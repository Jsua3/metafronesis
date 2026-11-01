"""S3-4 · Los derechos del titular y la retención: exportar, suprimir y depurar (RNF-003).

- ``export_person(persona)``: TODO lo que el inventario marca como suyo y sale de ``data_subject.PERSON_SCOPE`` (sin columnas
  ``SECRET`` y con las bitácoras descifradas), como un diccionario listo para escribir en JSON.
- ``erase_person(persona, executed_by=..., dry_run=...)``: aplica ``data_subject.ERASURE_RULES`` en UNA transacción. El informe
  que devuelve lleva SOLO recuentos por tabla y la lista de lo que se conserva y por qué. Es idempotente y, si las reglas no
  cubren el inventario, se niega a correr (falla cerrada).
- ``purge_expired(dry_run=...)``: borra lo vencido: los contadores del limitador, la auditoría pasada de ``retention_until`` (≥ 360
  días) y las solicitudes de acceso RESUELTAS más viejas que ``SIEP_RETENTION_ACCESS_REQUEST_DAYS`` (0 = ninguna).

Los plazos y el procedimiento son de la INSTITUCIÓN (SD-9): aquí las herramientas existen y funcionan, pero nada se borra por
defecto salvo lo que ya era política (la auditoría vencida y los contadores). Los comandos de ``management/commands`` son la puerta
de entrada; la auditoría de cada acción (``datos.exportar``, ``datos.suprimir``, ``datos.depurar``) la escribe ``audit_events``.
"""
from __future__ import annotations

import operator
from datetime import date, datetime, timedelta
from decimal import Decimal
from functools import reduce
from uuid import UUID

from cryptography.exceptions import InvalidTag
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status

from apps.privacy import audit_events, data_subject, inventory
from apps.privacy.inventory import PERSONAL, SECRET, SENSITIVE, TECHNICAL
from apps.security import limiter
from apps.security.management.commands import purge_rate_limits as contadores_del_limitador
from apps.security.models import RateLimitBucket
from apps.simulation.models import AuditLog
from apps.simulation.services import crypto_service
from apps.simulation.services.audit_service import audit_purge_window, retention_days
from apps.users.models import AccessRequest, AccessRequestStatus, UserRole
from apps.users.services import account_service
from shared.exceptions import ApiError

User = get_user_model()

#: Versión del formato del archivo de exportación (sube si cambia su forma).
FORMATO_DE_EXPORTACION = 1
#: Cuántos problemas de cobertura se nombran en el error de «reglas incompletas».
MAXIMO_DE_PROBLEMAS_EN_EL_ERROR = 10


# ── Quién ejecuta ────────────────────────────────────────────────────────────────────────────────────────────────
def verificar_ejecutor(executed_by):
    """El ADMIN activo que ejecuta, releído de la base (un ADMIN desactivado o degradado desde que se cargó no vale).

    Lanza ``EXECUTOR_NOT_ADMIN`` si ``executed_by`` es ``None``, no existe, no es de rol ADMIN o está inactivo. Las acciones
    quedan auditadas con su **id**, no con su correo.
    """
    ejecutor = None if executed_by is None else User.objects.filter(pk=executed_by.pk).first()
    if ejecutor is None or ejecutor.role != UserRole.ADMIN or not ejecutor.activo:
        raise ApiError(
            "EXECUTOR_NOT_ADMIN",
            # BORRADOR: texto nuevo para quien opera la plataforma, pendiente de revisión.
            "Quien ejecuta debe ser un administrador activo (--executed-by).",
            status.HTTP_403_FORBIDDEN,
        )
    return ejecutor


# ── Piezas comunes ───────────────────────────────────────────────────────────────────────────────────────────────
def _o(condiciones):
    """Todas las condiciones unidas con OR."""
    return reduce(operator.or_, condiciones)


def _orden(modelo):
    """Las columnas por las que se ordena una tabla para que la exportación sea estable (la clave, aunque sea compuesta)."""
    return [campo.attname for campo in modelo._meta.pk_fields]


def _json(valor):
    """Un valor de la base como lo escribe JSON."""
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, (Decimal, UUID)):
        return str(valor)
    return valor


# ── Exportar ─────────────────────────────────────────────────────────────────────────────────────────────────────
def _columnas_de_exportacion(tabla, modelo, pertenencia):
    """Las columnas (como en la base) que se exportan de ``tabla`` para ese papel.

    Con ``solo``, esas; sin ``solo``, las clasificadas personales, sensibles o técnicas (el contenido público del programa no es
    un dato de la persona). Nunca las secretas, y nunca las de ``excluir`` (las que apuntan a otra persona).
    """
    reales = [campo.column for campo in modelo._meta.concrete_fields]
    if pertenencia.solo is not None:
        columnas = [columna for columna in reales if columna in pertenencia.solo]
    else:
        columnas = [columna for columna in reales if inventory.classify(tabla, columna) in (PERSONAL, SENSITIVE, TECHNICAL)]
    return [
        columna for columna in columnas
        if columna not in pertenencia.excluir and inventory.classify(tabla, columna) != SECRET
    ]


def _descifrar(bitacora):
    """El texto de una bitácora, o ``None`` si no se puede descifrar (la llave ya no está o la fila fue alterada)."""
    try:
        return crypto_service.decrypt(
            bitacora.encrypted_text,
            key_ref=bitacora.encryption_key_ref,
            attempt_id=bitacora.attempt_id,
            node_id=bitacora.node_id,
        )
    except (ValueError, InvalidTag):
        return None


def _filas_de_bitacoras(consulta):
    """Las bitácoras de la persona con su texto descifrado en vez del cifrado y la referencia de su llave."""
    filas = []
    for bitacora in consulta.order_by("pk"):
        texto = _descifrar(bitacora)
        filas.append({
            "id": bitacora.pk,
            "attempt_id": _json(bitacora.attempt_id),
            "node_id": bitacora.node_id,
            "text": texto,
            "readable": texto is not None,
            "locked": bitacora.locked,
            "created_at": _json(bitacora.created_at),
            "updated_at": _json(bitacora.updated_at),
        })
    return filas


def _filas_de(tabla, modelo, pertenencia, consulta):
    if tabla == "reflection_journals":
        return _filas_de_bitacoras(consulta)
    columnas = _columnas_de_exportacion(tabla, modelo, pertenencia)
    campos = {campo.column: campo for campo in modelo._meta.concrete_fields}
    atributos = [campos[columna].attname for columna in columnas]
    return [
        {columna: _json(valor) for columna, valor in zip(columnas, fila, strict=True)}
        for fila in consulta.order_by(*_orden(modelo)).values_list(*atributos)
    ]


def export_person(person) -> dict:
    """TODO lo que el inventario marca como de ``person`` y sale de ``PERSON_SCOPE``, listo para escribirlo como JSON.

    La cuenta va sin columnas ``SECRET``; los intentos, las decisiones, las bitácoras (descifradas), las evaluaciones recibidas,
    los consentimientos, las solicitudes y la auditoría donde fue actor (con su IP y su navegador) van completos. De lo que hizo
    sobre datos de otras personas (grupos que enseña, casos que escribió, evaluaciones que dio) solo van sus propias acciones:
    nunca un dato de otra persona. No escribe nada.
    """
    tablas = {}
    for tabla, pertenencias in data_subject.PERSON_SCOPE.items():
        modelo = data_subject.modelo_de(tabla)
        filas = []
        ya_exportado = Q()
        for pertenencia in pertenencias:
            alcance = pertenencia.filas(person)
            consulta = modelo.objects.filter(alcance)
            if ya_exportado:
                consulta = consulta.exclude(ya_exportado)  # una fila que cae en dos papeles se exporta una sola vez
            filas.extend(_filas_de(tabla, modelo, pertenencia, consulta))
            ya_exportado = ya_exportado | alcance
        tablas[tabla] = filas
    return {
        "formato": FORMATO_DE_EXPORTACION,
        "generadoEn": timezone.now().isoformat(),
        "persona": {"id": person.pk},
        "tablas": tablas,
        "resumen": {
            "filas": sum(len(filas) for filas in tablas.values()),
            "tablas": sum(1 for filas in tablas.values() if filas),
        },
    }


# ── Suprimir ─────────────────────────────────────────────────────────────────────────────────────────────────────
def _plan(persona):
    """Las filas de la persona en cada tabla, por papel, calculadas ANTES de cambiar nada (la cuenta cambia al final)."""
    return {
        tabla: {pertenencia.rol: pertenencia.filas(persona) for pertenencia in pertenencias}
        for tabla, pertenencias in data_subject.PERSON_SCOPE.items()
    }


def _orden_de_supresion():
    """Las tablas con dueño en el orden de ``PERSON_SCOPE`` y ``users`` al final: las demás se alcanzan por la cuenta."""
    tablas = list(data_subject.PERSON_SCOPE)
    return [*(t for t in tablas if t != "users"), *(t for t in tablas if t == "users")]


def _grupos_de_reglas(tabla, reglas):
    """Las reglas con efecto de ``tabla`` (las que no son ``conservar``) agrupadas por los papeles a cuyas filas se aplican."""
    grupos: dict[tuple | None, list] = {}
    for (nombre, columna), regla in reglas.items():
        if nombre == tabla and regla.accion != data_subject.CONSERVAR:
            grupos.setdefault(regla.roles, []).append((columna, regla))
    return grupos


def _valor_de(regla, persona):
    """El valor nuevo de una regla ``seudonimizar``: un literal, una expresión del ORM o una función de la persona."""
    valor = regla.valor
    if callable(valor) and not hasattr(valor, "resolve_expression"):
        return valor(persona)
    return valor


def _distinto(campo, valor):
    """Las filas cuyo valor actual no es ``valor``. Un NULL no se «protege»: no hay nada que reemplazar (salvo que ``valor``
    sea NULL, donde basta con que haya algo)."""
    nombre = campo.attname
    if valor is None:
        return Q(**{f"{nombre}__isnull": False})
    condicion = ~Q(**{nombre: valor})
    return Q(**{f"{nombre}__isnull": False}) & condicion if campo.null else condicion


def _escribir(tabla, consulta, cambios):
    if tabla in data_subject.TABLAS_DE_SOLO_ANADIR:
        with audit_purge_window():
            return consulta.update(**cambios)
    return consulta.update(**cambios)


def _borrar(tabla, consulta):
    if tabla in data_subject.TABLAS_DE_SOLO_ANADIR:
        with audit_purge_window():
            return consulta.delete()[0]
    return consulta.delete()[0]


def _limpiar_json(tabla, modelo, filas, campo, funcion, simulacro):
    """Aplica ``funcion`` (texto JSON → texto JSON) al ``campo`` de cada fila; escribe las que cambian y devuelve sus claves."""
    cambiadas = set()
    for pk, texto in list(filas.values_list("pk", campo.attname)):
        if texto is None:
            continue
        nuevo = funcion(texto)
        if nuevo == texto:
            continue
        cambiadas.add(pk)
        if not simulacro:
            _escribir(tabla, modelo.objects.filter(pk=pk), {campo.attname: nuevo})
    return cambiadas


def _aplicar_grupo(tabla, modelo, filas, columnas, persona, simulacro):
    """Aplica las reglas de un grupo a ``filas``. Devuelve ``(claves de las filas cambiadas, filas borradas)``: las claves, y no
    un recuento, para que una fila que cambia por dos reglas distintas cuente una sola vez."""
    campos = {campo.column: campo for campo in modelo._meta.concrete_fields}
    if any(regla.accion == data_subject.BORRAR_FILA for _, regla in columnas):
        # ``validar_cobertura`` garantiza que ninguna otra acción se mezcla con ``borrar_fila`` en la misma tabla.
        return set(), (filas.count() if simulacro else _borrar(tabla, filas))
    cambios, diferencias = {}, Q()
    for columna, regla in columnas:
        campo = campos[columna]
        if regla.accion == data_subject.SEUDONIMIZAR:
            valor = _valor_de(regla, persona)
        elif regla.accion == data_subject.VACIAR:
            valor = ""
        elif regla.accion == data_subject.ANULAR:
            valor = None
        else:
            continue  # ``limpiar_json`` se aplica fila a fila, abajo
        cambios[campo.attname] = valor
        diferencias = diferencias | _distinto(campo, valor)
    if tabla == "users":
        for columna, valor in data_subject.CIERRE_DE_CUENTA.items():
            cambios[campos[columna].attname] = valor
            diferencias = diferencias | _distinto(campos[columna], valor)
    cambiadas = set()
    if cambios:
        pendientes = filas.filter(diferencias)
        cambiadas |= set(pendientes.values_list("pk", flat=True))
        if cambiadas and not simulacro:
            _escribir(tabla, pendientes, cambios)
    for columna, regla in columnas:
        if regla.accion == data_subject.LIMPIAR_JSON:
            cambiadas |= _limpiar_json(tabla, modelo, filas, campos[columna], regla.valor, simulacro)
    return cambiadas, 0


def _conservado(reglas, tabla, quedan):
    """Lo que se conserva de ``tabla`` y por qué: las columnas con regla ``conservar`` y sus motivos (sin repetir)."""
    columnas = [(columna, regla.motivo) for (nombre, columna), regla in reglas.items()
                if nombre == tabla and regla.accion == data_subject.CONSERVAR]
    if not columnas or not quedan:
        return None
    return {
        "tabla": tabla,
        "filas": quedan,
        "columnas": [columna for columna, _ in columnas],
        "motivos": sorted({motivo for _, motivo in columnas}),
    }


def _ya_suprimida(persona):
    return (
        persona.email == data_subject.correo_seudonimo(persona.pk)
        and not persona.activo
        and not persona.has_usable_password()
    )


def _suprimir_en_la_transaccion(person, ejecutor, simulacro):
    persona = User.objects.select_for_update().filter(pk=person.pk).first()
    if persona is None:
        raise ApiError(
            "PERSON_NOT_FOUND",
            # BORRADOR: texto nuevo para quien opera la plataforma, pendiente de revisión.
            "No hay una cuenta con ese id: no se suprimió nada.",
            status.HTTP_404_NOT_FOUND,
        )
    if persona.role == UserRole.ADMIN:
        raise ApiError(
            "ERASE_ADMIN_FORBIDDEN",
            # BORRADOR: texto nuevo para quien opera la plataforma, pendiente de revisión.
            "Una cuenta de administración no se suprime: quita el rol primero (cámbiaselo a docente o estudiante) y vuelve a intentar.",
            status.HTTP_400_BAD_REQUEST,
        )
    ya_suprimida = _ya_suprimida(persona)
    plan = _plan(persona)
    reglas = data_subject.ERASURE_RULES
    tablas, conservado = {}, []
    for tabla in _orden_de_supresion():
        modelo = data_subject.modelo_de(tabla)
        por_papel = plan[tabla]
        todas = modelo.objects.filter(_o(por_papel.values()))
        en_alcance = todas.count()
        cambiadas, borradas = set(), 0
        for papeles, columnas in _grupos_de_reglas(tabla, reglas).items():
            filas = modelo.objects.filter(_o(por_papel[papel] for papel in (papeles or por_papel)))
            hechas, quitadas = _aplicar_grupo(tabla, modelo, filas, columnas, persona, simulacro)
            cambiadas, borradas = cambiadas | hechas, borradas + quitadas
        if tabla == "users" and cambiadas and not simulacro:
            account_service.revoke_sessions(persona.pk)  # sus tokens de antes dejan de valer (S1-4)
        tablas[tabla] = {"filas": en_alcance, "cambiadas": len(cambiadas), "borradas": borradas}
        resto = _conservado(reglas, tabla, en_alcance - borradas)
        if resto is not None:
            conservado.append(resto)
    return {
        "persona": persona.pk,
        "ejecutadaPor": ejecutor.pk,
        "simulacro": simulacro,
        "yaSuprimida": ya_suprimida,
        "tablas": tablas,
        "cambiadas": sum(t["cambiadas"] for t in tablas.values()),
        "borradas": sum(t["borradas"] for t in tablas.values()),
        "conservado": conservado,
    }


def erase_person(person, *, executed_by, dry_run=False) -> dict:
    """Suprime la identidad de ``person`` aplicando ``data_subject.ERASURE_RULES`` en una sola transacción.

    ``executed_by`` es el ADMIN activo que lo pide (se relee de la base y se audita por su id). Con ``dry_run`` cuenta lo que
    haría y no escribe nada, ni la auditoría. El informe lleva SOLO recuentos por tabla y la lista de lo que se conserva y por
    qué; nunca el correo, el nombre ni un texto de la persona. Repetirlo sobre una cuenta ya suprimida no falla y no cambia nada.

    No suprime a una cuenta ADMIN (``ERASE_ADMIN_FORBIDDEN``: quita el rol primero) y se niega a correr si las reglas no cubren
    el inventario (``ERASURE_RULES_INCOMPLETE``): una columna nueva obliga a decidir qué se hace con ella.
    """
    ejecutor = verificar_ejecutor(executed_by)
    problemas = data_subject.validar_cobertura()
    if problemas:
        raise ApiError(
            "ERASURE_RULES_INCOMPLETE",
            # BORRADOR: texto nuevo para quien opera la plataforma, pendiente de revisión.
            "No se suprimió nada: las reglas de supresión no cubren el inventario de datos. "
            + "; ".join(problemas[:MAXIMO_DE_PROBLEMAS_EN_EL_ERROR]),
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    with transaction.atomic():
        informe = _suprimir_en_la_transaccion(person, ejecutor, dry_run)
    if not dry_run and (informe["cambiadas"] or informe["borradas"]):
        # Fuera de la transacción, como el resto de la auditoría (``audit_service.record``). Sin cambios no hay evento: repetir
        # sobre una cuenta ya suprimida no escribe nada.
        persona = User.objects.get(pk=informe["persona"])
        audit_events.persona_suprimida(
            persona, ejecutor,
            cambiadas=informe["cambiadas"], borradas=informe["borradas"],
            tablas=sum(1 for t in informe["tablas"].values() if t["cambiadas"] or t["borradas"]),
        )
    return informe


# ── Depurar lo vencido ───────────────────────────────────────────────────────────────────────────────────────────
def _contadores_vencidos(simulacro):
    """Los contadores del limitador cuya ventana ya no se lee: la lógica de ``purge_rate_limits``."""
    ahora = int(limiter._now())
    total = 0
    for alcance, retencion in contadores_del_limitador._retenciones().items():
        corte = ahora - retencion
        if simulacro:
            total += RateLimitBucket.objects.filter(scope=alcance, window_start__lt=corte).count()
        else:
            total += contadores_del_limitador._borrar_por_lotes(alcance, corte)
    return total


def _auditoria_vencida(ahora, simulacro):
    """Las filas de auditoría pasadas de ``retention_until`` (≥ 360 días): la lógica de ``purge_audit_logs``."""
    vencidas = AuditLog.objects.filter(retention_until__lt=ahora)
    if simulacro:
        return vencidas.count()
    with audit_purge_window():  # la base solo deja borrar la auditoría dentro de esta ventana (S4-2)
        return vencidas.delete()[0]


def _solicitudes_vencidas(ahora, simulacro):
    """Las solicitudes de acceso RESUELTAS más viejas que ``SIEP_RETENTION_ACCESS_REQUEST_DAYS``; 0 = ninguna.

    La edad cuenta desde que se resolvió (``reviewed_at``; si falta, desde que se creó). Una pendiente nunca se borra por aquí.
    """
    dias = settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS
    if not dias:
        return 0
    try:
        corte = ahora - timedelta(days=dias)
    except OverflowError:  # un plazo de miles de años: nada ha vencido
        return 0
    ids = list(
        AccessRequest.objects.filter(status__in=[AccessRequestStatus.REVIEWED, AccessRequestStatus.DISMISSED])
        .annotate(resuelta_en=Coalesce("reviewed_at", "created_at"))
        .filter(resuelta_en__lt=corte)
        .values_list("pk", flat=True)
    )
    if simulacro or not ids:
        return len(ids)
    return AccessRequest.objects.filter(pk__in=ids).delete()[0]


def purge_expired(*, dry_run=False, executed_by=None) -> dict:
    """Borra lo vencido: contadores del limitador, auditoría pasada de ``retention_until`` y solicitudes resueltas vencidas.

    Con ``dry_run`` cuenta sin borrar. Con ``executed_by`` (un ADMIN activo) y algo borrado, deja un evento ``datos.depurar``
    con los recuentos. Sin ``SIEP_RETENTION_ACCESS_REQUEST_DAYS`` no se borra ninguna solicitud.
    """
    ejecutor = verificar_ejecutor(executed_by) if executed_by is not None else None
    ahora = timezone.now()
    with transaction.atomic():
        contadores = _contadores_vencidos(dry_run)
    with transaction.atomic():
        auditoria = _auditoria_vencida(ahora, dry_run)
    with transaction.atomic():
        solicitudes = _solicitudes_vencidas(ahora, dry_run)
    if ejecutor is not None and not dry_run and (contadores or auditoria or solicitudes):
        audit_events.datos_depurados(ejecutor, contadores=contadores, auditoria=auditoria, solicitudes=solicitudes)
    return {
        "simulacro": dry_run,
        "contadores": contadores,
        "auditoria": auditoria,
        "solicitudes": solicitudes,
        "diasDeAuditoria": retention_days(),
        "diasDeSolicitudes": settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS,
    }
