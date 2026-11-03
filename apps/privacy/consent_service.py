"""Consentimiento de las personas: registrar, retirar y exigir (S3-2a, C12; ETH-01, SIEP-RF-05, RNF-010).

El servidor es dueño de la VERSIÓN VIGENTE del aviso (``SIEP_CONTENT_NOTICE_VERSION``): el cliente envía la que mostró y, si no
coincide, 409 ``NOTICE_VERSION_STALE`` con la vigente. Un consentimiento solo cuenta si es de esa persona, de esa versión del
caso, de la versión ACTUAL del aviso y no está retirado.

Alcance y tope (S3-2a2). ``reachable_version`` ofrece la versión publicada de un caso activo, como la ficha del caso. Una
archivada (o de un caso dado de baja) se ofrece solo a quien tiene un intento suyo de ella o un registro de consentimiento de
ella: así puede retirar y, con un intento abierto, volver a aceptar para seguir (como ``lifecycle.archive``, que deja terminar
los intentos abiertos y cierra solo la puerta a los nuevos). A los demás, el mismo 404. Cada aceptación NUEVA cuenta en
``consent_user`` (30 por persona y hora, ``apps/security/limits.py``) justo antes de crear la fila: el reenvío idempotente y el
retiro no cuentan ni se limitan.

``require_consent`` es la única pieza que decide si se exige; la llama ``game_service._require_attempt`` (el punto por el que
pasan el mundo y las órdenes de juego del estudiante). Con las dos banderas apagadas no hace nada y no consulta la base.
Quien está en crisis (pausa, salida segura, reanudar, abandonar, consultar el intento abierto) no pasa por ella: lo dice
``apps/privacy/tests/test_consent_enforcement.py`` ruta por ruta.

Este módulo no importa vistas. Depende de ``simulation`` (versiones de caso y auditoría); ``simulation`` solo depende de
``require_consent`` (no hay clave foránea de ``simulation`` hacia ``privacy``).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, Throttled

from apps.security.limiter import hit, key_hash, retry_after
from apps.security.limits import LIMITS
from apps.simulation.models import CaseVersion, CaseVersionStatus, SimulationAttempt
from apps.simulation.services.audit_service import arg, auditable
from shared.exceptions import ApiError

from .models import ConsentRecord, ConsentType

CONTENT_NOTICE = ConsentType.CONTENT_NOTICE
DATA_TREATMENT = ConsentType.DATA_TREATMENT


@dataclass(frozen=True)
class ConsentState:
    """Lo que ``GET …/consent`` dice: si el servidor exige el consentimiento, la versión vigente y si esta persona la aceptó."""

    required: bool
    notice_version: str
    accepted: bool
    accepted_at: datetime | None


class _YaVigente(Exception):
    """Otra petición registró la misma aceptación entre la lectura y la escritura (la ganó el índice único)."""


class _NadaQueRetirar(Exception):
    """Otra petición retiró lo vigente antes que esta."""


# ── Versiones vigentes (se leen en cada llamada: las pruebas y el despliegue las cambian sin reiniciar) ────────────────────


def content_notice_version() -> str:
    return settings.SIEP_CONTENT_NOTICE_VERSION


def data_treatment_notice_version() -> str:
    return settings.SIEP_DATA_TREATMENT_NOTICE_VERSION


def _version_id(case_version):
    """El id de una versión de caso dada como objeto o como id."""
    return getattr(case_version, "pk", case_version)


def _person_id(person):
    return getattr(person, "pk", person)


def reachable_version(person, case_version_id, *, to_accept=False) -> CaseVersion:
    """La versión que ``person`` puede ver en el consentimiento, o 404 (S3-2a2: ver el docstring del módulo).

    La publicada de un caso activo, como la ficha del caso. Una que ya no lo es solo se ofrece a quien tiene un intento o un
    registro de consentimiento de ella para LEER su estado y RETIRAR; para ACEPTAR (``to_accept``) hace falta un intento, que es
    quien retomaría el juego: un registro viejo sin intento no abre una aceptación nueva sobre algo que ya no se juega.
    """
    version = CaseVersion.objects.select_related("simulation_case").filter(pk=case_version_id).first()
    if version is None:
        raise _no_encontrado()
    if version.status == CaseVersionStatus.PUBLISHED and version.simulation_case.active:
        return version
    if to_accept:
        if _tiene_intento(person, version.pk):
            return version
    elif _tiene_intento_o_registro(person, version.pk):
        return version
    raise _no_encontrado()


def _no_encontrado() -> NotFound:
    # BORRADOR: mismo texto que la ficha del caso, pendiente de la aprobación de Psicología (VD-23).
    return NotFound("Caso no encontrado")


def _tiene_intento(person, case_version_id) -> bool:
    """¿Tiene ``person`` un intento suyo de esta versión, como estudiante?"""
    return SimulationAttempt.objects.filter(case_version_id=case_version_id, student_id=_person_id(person)).exists()


def _tiene_intento_o_registro(person, case_version_id) -> bool:
    """¿Tiene ``person`` un intento suyo de esta versión, como estudiante, o algún registro de su aviso de contenido?"""
    persona = _person_id(person)
    intento = _tiene_intento(person, case_version_id)
    registro = ConsentRecord.objects.filter(
        person_id=persona, consent_type=CONTENT_NOTICE, case_version_id=case_version_id
    ).exists()
    return intento or registro


def _vigentes(person, consent_type, case_version_id, notice_version):
    """Los registros NO retirados de esa persona, tipo, caso y versión del aviso (a lo sumo uno: lo impone la base)."""
    return ConsentRecord.objects.filter(
        person_id=_person_id(person),
        consent_type=consent_type,
        case_version_id=case_version_id,
        notice_version=notice_version,
        withdrawn_at__isnull=True,
    )


def _require_current_notice(sent, current):
    """409 ``NOTICE_VERSION_STALE`` con la versión vigente si lo que el cliente mostró no es lo vigente (o no mostró nada)."""
    if not sent or sent != current:
        raise ApiError(
            "NOTICE_VERSION_STALE",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "El aviso cambió desde que lo leíste. Léelo de nuevo antes de aceptar.",
            status.HTTP_409_CONFLICT,
            noticeVersion=current,
        )


def _contar_aceptacion(person) -> None:
    """Cuenta una aceptación NUEVA de ``person`` y la corta al pasar el tope (``consent_user``: 30 por persona y hora).

    Se llama justo antes de crear la fila: el reenvío idempotente y el retiro no pasan por aquí. Con el limitador apagado,
    ``hit`` devuelve 0 y no se aplica nada.
    """
    if hit("consent_user", key_hash(_person_id(person))) > LIMITS["consent_user"].limit:
        raise Throttled(wait=retry_after("consent_user"))


# ── Aviso de contenido (por versión del caso) ────────────────────────────────────────────────────────────────────────────


def has_valid_consent(person, case_version) -> bool:
    """¿Tiene ``person`` un consentimiento vigente del aviso de contenido de esta versión del caso, en la versión actual?"""
    return _vigentes(person, CONTENT_NOTICE, _version_id(case_version), content_notice_version()).exists()


def consent_state(person, case_version) -> ConsentState:
    vigente = content_notice_version()
    accepted_at = (
        _vigentes(person, CONTENT_NOTICE, _version_id(case_version), vigente)
        .values_list("accepted_at", flat=True)
        .first()
    )
    return ConsentState(
        required=settings.SIEP_CONSENT_REQUIRED,
        notice_version=vigente,
        accepted=accepted_at is not None,
        accepted_at=accepted_at,
    )


def _contexto_del_aviso(args, kwargs, result):
    """Solo la versión del caso y la del aviso: nada de la persona (el actor ya consta en su columna de la auditoría)."""
    return {"caseVersionId": arg(args, kwargs, 1, "case_version_id"), "noticeVersion": arg(args, kwargs, 2, "notice_version")}


@auditable("consentimiento.aceptar", "CASE_VERSION", 1, context=_contexto_del_aviso)
def _crear_aceptacion(person, case_version_id, notice_version):
    """Escribe la fila. La auditoría va con ella: solo se registra si esta llamada CREÓ la aceptación (el reenvío idempotente
    y quien pierde una carrera no pasan por aquí con éxito)."""
    try:
        with transaction.atomic():  # punto de guardado: un IntegrityError no rompe la transacción de quien llama
            return ConsentRecord.objects.create(
                person_id=_person_id(person),
                consent_type=CONTENT_NOTICE,
                case_version_id=case_version_id,
                notice_version=notice_version,
            )
    except IntegrityError:
        raise _YaVigente from None


#: Cuántas veces se intenta crear la aceptación si cada intento choca con una vigente que otra petición retira antes de leerla.
_INTENTOS_DE_ACEPTACION = 3


def _aceptar_con_reintento(crear, leer_vigente):
    """``(registro, creado)``: crea la aceptación, o devuelve la vigente que ganó la carrera (revisión S7-2, riesgo 4).

    Si el índice único dice que ya había una vigente pero, al releerla, otra petición la acaba de RETIRAR, no hay ganadora que
    devolver: antes ese ``.get()`` lanzaba ``DoesNotExist`` (500). Ahora se vuelve a intentar crear (quien llama aceptó DESPUÉS
    del retiro, así que debe quedar aceptado) y, si tres vueltas seguidas chocan, un 409 que el cliente muestra con «Reintentar».
    """
    for _ in range(_INTENTOS_DE_ACEPTACION):
        try:
            return crear(), True
        except _YaVigente:
            ganadora = leer_vigente()
            if ganadora is not None:
                return ganadora, False
    raise ApiError(
        "CONSENT_CONFLICT",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "El consentimiento cambió mientras se registraba. Inténtalo de nuevo.",
        status.HTTP_409_CONFLICT,
    )


def accept_content_notice(person, case_version, notice_version):
    """Registra que ``person`` aceptó el aviso de contenido de la versión del caso. Devuelve ``(registro, creado)``.

    Idempotente: si ya hay una aceptación vigente de esa versión del aviso, devuelve la misma con ``creado=False`` y no deja
    otra fila ni otra auditoría. Atómica: si dos peticiones llegan a la vez, el índice único deja una sola fila y la otra
    recibe la ganadora. Una versión del aviso que no es la vigente es un 409.
    """
    version_id = _version_id(case_version)
    _require_current_notice(notice_version, content_notice_version())
    existente = _vigentes(person, CONTENT_NOTICE, version_id, notice_version).first()
    if existente is not None:
        return existente, False
    _contar_aceptacion(person)
    return _aceptar_con_reintento(
        lambda: _crear_aceptacion(person, version_id, notice_version),
        lambda: _vigentes(person, CONTENT_NOTICE, version_id, notice_version).first(),
    )


@auditable("consentimiento.retirar", "CASE_VERSION", 1, context=_contexto_del_aviso)
def _retirar_aviso(person, case_version_id, notice_version, withdrawn_at):
    """Marca como retirado lo vigente de esa versión del aviso. Un solo UPDATE: si otra petición se adelantó no hay nada
    que retirar y no se audita."""
    retirados = _vigentes(person, CONTENT_NOTICE, case_version_id, notice_version).update(withdrawn_at=withdrawn_at)
    if not retirados:
        raise _NadaQueRetirar


def withdraw_content_notice(person, case_version):
    """Retira lo vigente del aviso de contenido de esa versión del caso (de cualquier versión del aviso). No borra nada.

    Devuelve la hora del retiro o ``None`` si no había nada vigente (idempotente). Una fila de auditoría por registro retirado.
    """
    version_id = _version_id(case_version)
    withdrawn_at = timezone.now()
    avisos = list(
        ConsentRecord.objects.filter(
            person_id=_person_id(person), consent_type=CONTENT_NOTICE, case_version_id=version_id, withdrawn_at__isnull=True
        )
        .order_by("id")
        .values_list("notice_version", flat=True)
    )
    retirado = False
    for aviso in avisos:
        try:
            _retirar_aviso(person, version_id, aviso, withdrawn_at)
            retirado = True
        except _NadaQueRetirar:
            continue
    return withdrawn_at if retirado else None


# ── Tratamiento de datos (sin caso; sin ruta todavía: la institución entrega texto y versión, SD-8) ───────────────────────


def has_valid_data_treatment_consent(person) -> bool:
    return _vigentes(person, DATA_TREATMENT, None, data_treatment_notice_version()).exists()


def _contexto_del_tratamiento(args, kwargs, result):
    return {"noticeVersion": arg(args, kwargs, 1, "notice_version")}


@auditable("consentimiento.aceptar", "DATA_TREATMENT", -1, context=_contexto_del_tratamiento)
def _crear_aceptacion_del_tratamiento(person, notice_version):
    try:
        with transaction.atomic():
            return ConsentRecord.objects.create(
                person_id=_person_id(person), consent_type=DATA_TREATMENT, case_version=None, notice_version=notice_version
            )
    except IntegrityError:
        raise _YaVigente from None


def accept_data_treatment(person, notice_version):
    """Como ``accept_content_notice`` para la autorización de tratamiento de datos (sin caso). Devuelve ``(registro, creado)``.

    Sin versión configurada del aviso (``SIEP_DATA_TREATMENT_NOTICE_VERSION`` vacía) no hay nada que aceptar: 409.
    """
    _require_current_notice(notice_version, data_treatment_notice_version())
    existente = _vigentes(person, DATA_TREATMENT, None, notice_version).first()
    if existente is not None:
        return existente, False
    _contar_aceptacion(person)
    return _aceptar_con_reintento(
        lambda: _crear_aceptacion_del_tratamiento(person, notice_version),
        lambda: _vigentes(person, DATA_TREATMENT, None, notice_version).first(),
    )


# ── La exigencia ─────────────────────────────────────────────────────────────────────────────────────────────────────────


def require_consent(person, case_version) -> None:
    """403 si el servidor exige un consentimiento que ``person`` no tiene; si no, no hace nada.

    - ``SIEP_CONSENT_REQUIRED``: exige el aviso de contenido de ESTA versión del caso, en la versión actual del aviso →
      ``CONSENT_REQUIRED {noticeVersion}``.
    - ``SIEP_DATA_TREATMENT_CONSENT_REQUIRED``: además, la autorización de tratamiento de datos →
      ``DATA_TREATMENT_CONSENT_REQUIRED {noticeVersion}``.

    Con las dos apagadas no consulta la base. NO se llama desde la pausa, la salida segura, reanudar, abandonar ni consultar el
    intento abierto (REGLA-004, ETH-02).
    """
    if settings.SIEP_CONSENT_REQUIRED and not has_valid_consent(person, case_version):
        raise ApiError(
            "CONSENT_REQUIRED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Para continuar necesitas leer y aceptar el aviso de contenido sensible de este caso.",
            status.HTTP_403_FORBIDDEN,
            noticeVersion=content_notice_version(),
        )
    if settings.SIEP_DATA_TREATMENT_CONSENT_REQUIRED and not has_valid_data_treatment_consent(person):
        raise ApiError(
            "DATA_TREATMENT_CONSENT_REQUIRED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Para continuar necesitas aceptar la autorización de tratamiento de datos.",
            status.HTTP_403_FORBIDDEN,
            noticeVersion=data_treatment_notice_version(),
        )
