"""S3-4 · De quién es cada dato y qué se hace con él cuando una persona pide que se suprima (RNF-003).

``DATA_INVENTORY`` (S3-1) dice QUÉ guarda cada columna. Este módulo dice DE QUIÉN es y CÓMO se llega a sus filas
(``PERSON_SCOPE``) y QUÉ se hace con cada columna personal, sensible o secreta cuando se suprime a la persona
(``ERASURE_RULES``). Los usan ``services.export_person`` y ``services.erase_person``. La compuerta es ``validar_cobertura()``:
una columna nueva del inventario sin regla (la analítica de E6 entra por aquí) rompe la prueba y, mientras no se decida qué
se hace con ella, ``erase_person`` se niega a correr.

Criterio de la supresión (el mismo para toda columna; BORRADOR hasta que la institución lo apruebe, SD-9):

- Lo que IDENTIFICA a la persona (nombre, apellido, correo, credenciales, IP y navegador de sus acciones) se reemplaza por un
  seudónimo estable derivado de su id (``eliminada-<id>``), se deja inutilizable o se anula.
- El TEXTO LIBRE que la persona escribió (bitácoras de reflexión, notas de revisión y de evidencia, el motivo escrito de una
  salida segura, el texto antiguo del asistente en la auditoría) se borra.
- LO QUE HIZO la persona (intentos, eventos, decisiones, pistas, informe, mundo, finalizaciones, pertenencias a grupos,
  autoría, evaluaciones recibidas) se CONSERVA como dato agregado enlazado a la cuenta, que ya es un seudónimo. Si la
  institución quiere borrarlo también, lo decide ella (SD-9); este repositorio no inventa obligaciones legales.
- El CONSENTIMIENTO queda como evidencia (ETH-01) y la AUDITORÍA solo pierde la IP y el navegador de las filas de la persona.

Dos papeles: una persona puede ser la TITULAR de unas filas (sus intentos, sus bitácoras, su pertenencia a un grupo) y la ACTORA
de otras (el docente que creó un caso o evaluó un intento ajeno). Suprimirla nunca toca el contenido de otras personas: una
regla declara los ``roles`` de ``PERSON_SCOPE`` a cuyas filas se aplica.
"""
from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from django.db.models import Case, CharField, F, Q, TextField, Value, When
from django.db.models.functions import Cast, Concat, Left, StrIndex

from apps.privacy import inventory
from apps.privacy.inventory import CON_SALIDAS, SECRET
from apps.simulation.services.audit_service import HIDDEN_CONTEXT_KEYS

# ── Qué se hace con una columna ───────────────────────────────────────────────────────────────────────────────────
SEUDONIMIZAR = "seudonimizar"  # el valor se reemplaza por otro que no identifica a nadie (``Regla.valor``)
VACIAR = "vaciar"  # el texto queda vacío ("")
ANULAR = "anular"  # el valor queda en NULL
BORRAR_FILA = "borrar_fila"  # la fila entera se borra
CONSERVAR = "conservar"  # no se toca; el motivo dice por qué es seguro (o a quién le toca decidir)
LIMPIAR_JSON = "limpiar_json"  # el texto es JSON y ``Regla.valor`` quita de él lo que la persona escribió; el resto se conserva
ACCIONES = (SEUDONIMIZAR, VACIAR, ANULAR, BORRAR_FILA, CONSERVAR, LIMPIAR_JSON)

#: Papel por defecto: las filas son datos DE la persona.
TITULAR = "titular"
#: Tablas que la base solo deja tocar dentro de ``audit_service.audit_purge_window()`` (la auditoría de solo añadir, S4-2).
TABLAS_DE_SOLO_ANADIR = frozenset({"audit_logs"})
#: El estado en el que queda la cuenta suprimida (columnas técnicas de ``users``, que no llevan regla): inactiva y sin marcas de
#: clave temporal. Con ``must_change_password`` encendido la cuenta contaría como «pendiente de aprobación» y un ADMIN podría
#: «aprobarla» mandando una clave temporal a un correo que no existe. Además se cierran sus sesiones (``account_service``).
CIERRE_DE_CUENTA: dict[str, Any] = {"activo": False, "must_change_password": False, "temp_password_set_at": None}


@dataclass(frozen=True)
class Pertenencia:
    """Una manera de llegar a las filas de una persona en una tabla.

    ``filas(persona)`` devuelve el ``Q`` sobre el modelo de la tabla. ``solo`` limita lo que se EXPORTA a esas columnas (para los
    papeles de actora: nada de los datos de otras personas); ``excluir`` quita columnas de lo que se exporta (p. ej. el id del
    docente que evaluó, que es otra persona). Las columnas ``SECRET`` nunca se exportan.
    """

    rol: str
    filas: Callable[[Any], Q]
    solo: tuple[str, ...] | None = None
    excluir: tuple[str, ...] = ()


@dataclass(frozen=True)
class Regla:
    """Qué se hace con UNA columna al suprimir a la persona. Todas llevan ``motivo`` (es el que sale en el informe).

    ``roles`` limita la regla a las filas de esos papeles de ``PERSON_SCOPE`` (``None`` = todos). ``valor`` depende de la acción:
    ``seudonimizar`` lleva el valor nuevo (un literal, una expresión del ORM o una función de la persona); ``limpiar_json`` la
    función que recibe el texto JSON y devuelve el texto limpio; las demás no llevan.
    """

    accion: str
    motivo: str
    roles: tuple[str, ...] | None = None
    valor: Any = None


# ── Los seudónimos ───────────────────────────────────────────────────────────────────────────────────────────────
#: Lo que deja ``CustomUser.set_password(None)``: sin clave usable. Una prueba lo compara con el modelo.
SIN_CLAVE = "!"
NOMBRE_SEUDONIMO = "Cuenta"
#: Lo que el servidor escribe en el evento de una salida segura sin motivo (``game_service.safe_exit``). Una prueba lo compara.
DETALLE_SALIDA_SEGURA = "Salida segura solicitada"
#: Lo que ``game_service`` añade al detalle de una decisión con evidencia saltada (``Override de evidencia: <etiquetas>``).
SUFIJO_DE_OVERRIDE = " | Override de evidencia: "


def correo_seudonimo(pk) -> str:
    """El correo de una cuenta suprimida: estable (se deriva del id) y sin parecer un correo real (``.invalid`` es reservado)."""
    return f"eliminada-{pk}@invalid"


def apellido_seudonimo(pk) -> str:
    return f"eliminada-{pk}"


def nombre_completo_seudonimo(pk) -> str:
    return f"{NOMBRE_SEUDONIMO} {apellido_seudonimo(pk)}"


def _por_id(prefijo, sufijo=""):
    """Un seudónimo distinto por fila: ``<prefijo><id de la fila><sufijo>`` (una sola sentencia ``UPDATE``)."""
    return Concat(Value(prefijo), Cast("pk", CharField()), Value(sufijo))


def _detalle_sin_texto_de_la_persona():
    """El detalle de un evento sin lo que la persona escribió: el motivo de una salida segura vuelve al texto de siempre y las
    etiquetas de una decisión con evidencia saltada se recortan (las manda el cliente tal cual). Lo demás queda igual."""
    return Case(
        When(event_type="SAFE_EXIT_REQUESTED", then=Value(DETALLE_SALIDA_SEGURA)),
        When(
            detail__contains=SUFIJO_DE_OVERRIDE,
            then=Left("detail", StrIndex("detail", Value(SUFIJO_DE_OVERRIDE)) - 1),
        ),
        default=F("detail"),
        output_field=TextField(),
    )


def _cargar(texto):
    try:
        return json.loads(texto)
    except (TypeError, ValueError):
        return None


def _contexto_sin_texto_libre(texto):
    """El contexto de una fila de auditoría sin sus claves de texto libre (``HIDDEN_CONTEXT_KEYS``: ``question``, del asistente)."""
    contexto = _cargar(texto)
    if not isinstance(contexto, dict) or not (HIDDEN_CONTEXT_KEYS & contexto.keys()):
        return texto
    return json.dumps({clave: valor for clave, valor in contexto.items() if clave not in HIDDEN_CONTEXT_KEYS})


def _informe_sin_el_motivo_de_la_salida_segura(texto):
    """El informe congelado de un intento copia el motivo escrito de una salida segura en su línea de tiempo: vuelve al texto de
    siempre. El resto del informe queda tal cual."""
    informe = _cargar(texto)
    if not isinstance(informe, dict) or not isinstance(informe.get("timeline"), list):
        return texto
    cambio = False
    for entrada in informe["timeline"]:
        if (
            isinstance(entrada, dict)
            and entrada.get("type") == "SAFE_EXIT_REQUESTED"
            and entrada.get("label") != DETALLE_SALIDA_SEGURA
        ):
            entrada["label"] = DETALLE_SALIDA_SEGURA
            cambio = True
    return json.dumps(informe, ensure_ascii=False) if cambio else texto


# ── De quién es cada dato ────────────────────────────────────────────────────────────────────────────────────────
#: Tabla → cómo se llega a las filas de una persona (``persona`` es su cuenta de ``users``). El primer papel de una tabla es
#: el más amplio: una fila que cae en dos papeles se exporta una sola vez, con el primero.
PERSON_SCOPE: dict[str, tuple[Pertenencia, ...]] = {
    "sesiones_sesion": (
        Pertenencia("docente", lambda p: Q(creada_por_id=p.pk)),
    ),
    "sesiones_convocatoria": (
        Pertenencia(TITULAR, lambda p: Q(estudiante_id=p.pk)),
    ),
    "sesiones_autorizacionrepeticion": (
        Pertenencia(TITULAR, lambda p: Q(convocatoria__estudiante_id=p.pk), excluir=("autorizada_por_id",)),
        Pertenencia("autorizador", lambda p: Q(autorizada_por_id=p.pk),
                    solo=("id", "autorizada_por_id", "creada_en")),
    ),
    "notificaciones_notificacion": (
        Pertenencia(TITULAR, lambda p: Q(destinatario_id=p.pk), excluir=("originador_id",)),
        Pertenencia("originador", lambda p: Q(originador_id=p.pk), solo=("id", "originador_id", "creada_en")),
    ),
    "users_permisodeautoria": (
        Pertenencia(TITULAR, lambda p: Q(docente_id=p.pk), excluir=("otorgado_por_id",)),
        Pertenencia("otorgante", lambda p: Q(otorgado_por_id=p.pk),
                    solo=("id", "otorgado_por_id", "otorgado_en")),
    ),
    # ── Su cuenta y sus solicitudes ──
    "users": (Pertenencia(TITULAR, lambda p: Q(pk=p.pk)),),
    "access_requests": (Pertenencia(TITULAR, lambda p: Q(email__iexact=p.email)),),
    # ── Pertenencia a grupos y asignaciones ──
    "grupos": (
        Pertenencia(
            "docente", lambda p: Q(profesor_id=p.pk),
            solo=("id", "nombre", "codigo", "profesor_id", "activo", "created_at"),
        ),
    ),
    "grupo_estudiante": (
        Pertenencia(TITULAR, lambda p: Q(estudiante_id=p.pk), excluir=("invited_by",)),
        Pertenencia("invitador", lambda p: Q(invited_by=p.pk), solo=("grupo_id", "invited_by", "invited_at")),
    ),
    "case_assignments": (
        Pertenencia(TITULAR, lambda p: Q(estudiante_id=p.pk), excluir=("assigned_by",)),
        Pertenencia(
            "asignador", lambda p: Q(assigned_by=p.pk),
            solo=("id", "case_version_id", "grupo_id", "assigned_by", "assigned_at"),
        ),
    ),
    # ── Autoría de casos, revisiones y rúbricas ──
    "simulation_cases": (
        Pertenencia(
            "autor", lambda p: Q(created_by=p.pk),
            solo=("id", "code", "title", "active", "created_by", "created_at", "updated_at"),
        ),
    ),
    "case_versions": (
        # Dos papeles y cada uno exporta solo SU columna de persona: la versión que ella creó pudo editarla otra persona (y al revés).
        Pertenencia(
            "autor", lambda p: Q(created_by=p.pk),
            solo=("id", "simulation_case_id", "semantic_version", "status", "created_by", "created_at"),
        ),
        Pertenencia(
            "editor", lambda p: Q(last_edited_by=p.pk),
            solo=("id", "simulation_case_id", "semantic_version", "status", "last_edited_by", "created_at"),
        ),
    ),
    "case_reviews": (
        Pertenencia("revisor", lambda p: Q(decided_by=p.pk), excluir=("requested_by",)),
        Pertenencia(
            "solicitante", lambda p: Q(requested_by=p.pk),
            solo=("id", "case_version_id", "requested_by", "requested_at", "decision", "reason", "decided_at"),
        ),
    ),
    "rubrics": (
        Pertenencia(
            "autor", lambda p: Q(created_by=p.pk),
            solo=("id", "case_version_id", "name", "active", "version", "is_default", "created_by", "created_at", "updated_at"),
        ),
    ),
    "simulation_rubric_assignments": (
        Pertenencia(
            "asignador", lambda p: Q(assigned_by=p.pk),
            solo=("id", "case_version_id", "rubric_id", "assigned_by", "active", "assigned_at"),
        ),
    ),
    "publication_checklists": (
        Pertenencia(
            "remitente", lambda p: Q(submitted_by=p.pk),
            solo=("id", "case_version_id", "submitted_by", "completion_ratio", "status", "submitted_at", "completed_at"),
        ),
    ),
    "publication_checklist_items": (
        Pertenencia(
            "remitente", lambda p: Q(checklist__submitted_by=p.pk),
            solo=("id", "checklist_id", "code", "label", "required", "fulfilled", "evidence_note"),
        ),
    ),
    # ── Intentos, bitácoras y evaluaciones ──
    "simulation_attempts_v2": (
        Pertenencia(TITULAR, lambda p: Q(student_id=p.pk), excluir=("replaced_by_id",)),
        Pertenencia(
            "sustituyente", lambda p: Q(replaced_by_id=p.pk),
            solo=("id", "replaced_by_id", "replace_reason", "ended_at"),
        ),
    ),
    "simulation_attemptevaluation": (Pertenencia(TITULAR, lambda p: Q(attempt__student_id=p.pk)),),
    "attempt_events": (Pertenencia(TITULAR, lambda p: Q(attempt__student_id=p.pk)),),
    "attempt_hint_views": (Pertenencia(TITULAR, lambda p: Q(attempt__student_id=p.pk)),),
    "attempt_reports": (Pertenencia(TITULAR, lambda p: Q(attempt__student_id=p.pk)),),
    "attempt_feedback": (Pertenencia(TITULAR, lambda p: Q(attempt__student_id=p.pk)),),
    "reflection_journals": (Pertenencia(TITULAR, lambda p: Q(attempt__student_id=p.pk)),),
    "attempt_world_states": (Pertenencia(TITULAR, lambda p: Q(attempt__student_id=p.pk)),),
    "student_case_completion": (Pertenencia(TITULAR, lambda p: Q(student_id=p.pk)),),
    # ── Uso del asistente de IA de autoría (P5): los contadores diarios del docente ──
    "authoring_assistant_usage": (Pertenencia(TITULAR, lambda p: Q(user_id=p.pk)),),
    "rubric_evaluations": (
        Pertenencia(TITULAR, lambda p: Q(attempt__student_id=p.pk), excluir=("instructor_id",)),
        Pertenencia(
            "evaluador", lambda p: Q(instructor_id=p.pk),
            solo=("id", "rubric_id", "instructor_id", "status", "origin", "evaluated_at"),
        ),
    ),
    "criterion_scores": (Pertenencia(TITULAR, lambda p: Q(rubric_evaluation__attempt__student_id=p.pk)),),
    # ── Auditoría y consentimiento ──
    "audit_logs": (Pertenencia("actor", lambda p: Q(actor_id=p.pk)),),
    "consent_records": (Pertenencia(TITULAR, lambda p: Q(person_id=p.pk)),),
}

#: Tablas del inventario que NO se atribuyen a una persona, y por qué. Una tabla con datos de personas que no esté en
#: ``PERSON_SCOPE`` ni aquí rompe la compuerta.
# BORRADOR: motivos pendientes de la aprobación de la institución (SD-9).
SIN_DUENO: dict[str, str] = {
    "rate_limit_buckets": (
        "contadores del limitador con una clave HMAC (de un correo o una IP) que solo el servidor puede calcular; no tienen "
        "columnas personales, sensibles ni secretas y `purge_rate_limits` los borra solos al vencer su ventana"
    ),
}

# ── Qué se hace con cada columna ─────────────────────────────────────────────────────────────────────────────────
# BORRADOR: los motivos son texto nuevo que lee quien opera la plataforma (el informe de la supresión y el documento de los
# derechos del titular), pendiente de la aprobación de Psicología y de la institución (SD-9).
_M_LLAVE = "es la llave de enlace de todo lo demás y de ella se deriva el seudónimo; sola no identifica a nadie"
_M_CONDUCTA = (
    "lo que hizo la persona queda como dato agregado enlazado a una cuenta ya seudonimizada; "
    "si la institución quiere borrarlo también, lo decide ella (SD-9)"
)
_M_AUTORIA = "la autoría del contenido del programa queda enlazada a la cuenta, que ya es un seudónimo; el contenido no se borra"
_M_TEXTO_DE_OTRO = (
    "texto que escribió un docente sobre el desempeño de la persona: la institución decide si se conserva (SD-9); "
    "puede nombrarla y el comando no lo edita"
)
_M_PERTENENCIA = "la pertenencia a un grupo queda enlazada a la cuenta seudonimizada: los reportes del docente la necesitan"


def _columnas(tabla, columnas, regla):
    return {(tabla, columna): regla for columna in columnas}


ERASURE_RULES: dict[tuple[str, str], Regla] = {
    ("sesiones_sesion", "creada_por_id"): Regla(CONSERVAR, _M_AUTORIA),
    ("sesiones_sesion", "mensaje"): Regla(VACIAR, "texto libre escrito por el docente", roles=("docente",)),
    **_columnas("sesiones_convocatoria", ("estudiante_id", "estado"), Regla(CONSERVAR, _M_CONDUCTA)),
    ("sesiones_convocatoria", "codigo_hash"): Regla(VACIAR, "invalida el código de acceso del estudiante", roles=(TITULAR,)),
    **_columnas("sesiones_autorizacionrepeticion", ("convocatoria_id", "autorizada_por_id"), Regla(CONSERVAR, _M_CONDUCTA)),
    ("sesiones_autorizacionrepeticion", "motivo"): Regla(VACIAR, "texto libre del docente", roles=("autorizador",)),
    **_columnas("notificaciones_notificacion", ("destinatario_id", "originador_id", "tipo", "leida"),
                Regla(CONSERVAR, _M_CONDUCTA)),
    **_columnas("notificaciones_notificacion", ("titulo", "cuerpo", "error_correo"),
                Regla(VACIAR, "contenido y errores del aviso de la persona", roles=(TITULAR,))),
    **_columnas("users_permisodeautoria", ("docente_id", "otorgado_por_id"), Regla(CONSERVAR, _M_AUTORIA)),
    # ── users: la cuenta conserva su fila y se seudonimiza ──
    ("users", "id"): Regla(CONSERVAR, _M_LLAVE),
    ("users", "password_hash"): Regla(
        SEUDONIMIZAR, "credencial: la clave queda inutilizable y la cuenta ya no puede entrar", valor=SIN_CLAVE
    ),
    ("users", "email"): Regla(
        SEUDONIMIZAR, "identifica y es el medio de contacto: pasa a un seudónimo estable derivado del id (eliminada-<id>@invalid)",
        valor=lambda persona: correo_seudonimo(persona.pk),
    ),
    ("users", "nombre"): Regla(SEUDONIMIZAR, "nombre de la persona: pasa a un seudónimo", valor=NOMBRE_SEUDONIMO),
    ("users", "apellido"): Regla(
        SEUDONIMIZAR, "apellido de la persona: pasa a un seudónimo derivado del id",
        valor=lambda persona: apellido_seudonimo(persona.pk),
    ),
    ("users", "role"): Regla(
        CONSERVAR, "el rol no identifica a nadie sin el nombre; los grupos, los casos y los intentos lo necesitan"
    ),
    # ── access_requests: se anonimizan ──
    ("access_requests", "id"): Regla(CONSERVAR, _M_LLAVE),
    ("access_requests", "nombre"): Regla(SEUDONIMIZAR, "nombre que indicó quien pidió la cuenta", valor="Solicitud"),
    ("access_requests", "apellido"): Regla(
        SEUDONIMIZAR, "apellido que indicó quien pidió la cuenta", valor=_por_id("anonimizada-")
    ),
    ("access_requests", "email"): Regla(
        SEUDONIMIZAR, "correo de quien pidió la cuenta: pasa a un seudónimo por solicitud (anonimizada-<id>@invalid)",
        valor=_por_id("anonimizada-", "@invalid"),
    ),
    ("access_requests", "status"): Regla(
        CONSERVAR, "el estado del trámite no identifica a nadie sin el nombre ni el correo y sirve para contar solicitudes"
    ),
    # ── Grupos, membresías y asignaciones: se conservan enlazadas a la cuenta seudonimizada ──
    ("grupos", "profesor_id"): Regla(CONSERVAR, "el grupo y sus estudiantes siguen existiendo; el docente queda como cuenta seudonimizada"),
    **_columnas("grupo_estudiante", ("estudiante_id", "status", "invited_by"), Regla(CONSERVAR, _M_PERTENENCIA)),
    **_columnas("case_assignments", ("estudiante_id", "assigned_by"), Regla(CONSERVAR, _M_PERTENENCIA)),
    # ── Autoría: el contenido del programa no se borra ──
    ("simulation_cases", "created_by"): Regla(CONSERVAR, _M_AUTORIA),
    **_columnas("case_versions", ("created_by", "last_edited_by"), Regla(CONSERVAR, _M_AUTORIA)),
    **_columnas("case_reviews", ("requested_by", "decided_by"), Regla(CONSERVAR, _M_AUTORIA)),
    ("case_reviews", "note"): Regla(
        VACIAR, "texto libre de quien decidió la revisión: puede identificarlo", roles=("revisor",)
    ),
    ("case_reviews", "content_reviewer"): Regla(
        SEUDONIMIZAR, "nombre de quien revisó el contenido: pasa al seudónimo de la cuenta", roles=("revisor",),
        valor=lambda persona: nombre_completo_seudonimo(persona.pk),
    ),
    ("rubrics", "created_by"): Regla(CONSERVAR, _M_AUTORIA),
    ("simulation_rubric_assignments", "assigned_by"): Regla(CONSERVAR, _M_AUTORIA),
    ("publication_checklists", "submitted_by"): Regla(CONSERVAR, _M_AUTORIA),
    ("publication_checklist_items", "evidence_note"): Regla(
        ANULAR, "texto libre del docente sobre la evidencia: puede nombrar personas", roles=("remitente",)
    ),
    # ── Intentos: lo que hizo la persona se conserva; solo se neutralizan la credencial del intento y el texto libre ──
    ("simulation_attempts_v2", "attempt_token_hash"): Regla(
        SEUDONIMIZAR, "credencial del intento: el hash pasa a un valor que ningún token puede producir", roles=(TITULAR,),
        valor=_por_id("suprimido-"),
    ),
    **_columnas(
        "simulation_attempts_v2",
        (
            "id", "student_id", "current_node_id", "status", "started_at", "ended_at", "active_seconds",
            "last_activity_at", "state_json",
        ),
        Regla(CONSERVAR, _M_CONDUCTA),
    ),
    **_columnas(
        "simulation_attempts_v2", ("replaced_by_id", "replace_reason"),
        Regla(CONSERVAR, "quién y por qué cerró el intento (texto del docente o del sistema): " + _M_TEXTO_DE_OTRO),
    ),
    **_columnas(
        "simulation_attemptevaluation", ("attempt_id", "snapshot"), Regla(CONSERVAR, _M_CONDUCTA),
    ),
    **_columnas(
        "attempt_events", ("attempt_id", "event_type", "decision_option_id", "occurred_at"),
        Regla(CONSERVAR, _M_CONDUCTA),
    ),
    ("attempt_events", "detail"): Regla(
        SEUDONIMIZAR,
        "texto del evento: el motivo escrito de una salida segura vuelve al texto de siempre y las etiquetas de evidencia "
        "saltada se recortan; lo demás es texto del sistema y queda",
        valor=_detalle_sin_texto_de_la_persona(),
    ),
    **_columnas("attempt_hint_views", ("attempt_id", "viewed_at"), Regla(CONSERVAR, _M_CONDUCTA)),
    **_columnas("attempt_reports", ("attempt_id", "attempt_ordinal"), Regla(CONSERVAR, _M_CONDUCTA)),
    ("attempt_reports", "report_json"): Regla(
        LIMPIAR_JSON,
        "informe congelado sin nombre ni correo: solo se limpia el motivo escrito de una salida segura, que copia en su línea "
        "de tiempo; el resto es lo que hizo la persona y queda",
        valor=_informe_sin_el_motivo_de_la_salida_segura,
    ),
    **_columnas("attempt_feedback", ("attempt_id", "rating", "created_at"), Regla(CONSERVAR, _M_CONDUCTA)),
    ("attempt_feedback", "comment"): Regla(
        VACIAR, "texto libre de la persona (el comentario de la encuesta): se vacía; la calificación queda como lo que hizo"
    ),
    **_columnas("reflection_journals", ("attempt_id", "encrypted_text"), Regla(
        BORRAR_FILA, "texto libre de la persona (cifrado): la bitácora se borra entera"
    )),
    **_columnas(
        "attempt_world_states",
        (
            "attempt_id", "scene_map_id", "player_x", "player_y", "inventory_json", "inspected_object_keys_json",
            "viewed_dialogue_keys_json", "used_tool_keys_json", "flags_json",
        ),
        Regla(CONSERVAR, _M_CONDUCTA),
    ),
    **_columnas("student_case_completion", ("student_id", "first_completed_at"), Regla(CONSERVAR, _M_CONDUCTA)),
    # ── Uso del asistente de autoría: contadores sin texto; el tope mensual los suma, así que se conservan ──
    **_columnas(
        "authoring_assistant_usage", ("user_id", "day", "count"),
        Regla(
            CONSERVAR,
            "contador diario de uso del asistente, sin el texto de las peticiones, enlazado a una cuenta ya seudonimizada; "
            "el tope mensual suma estas filas de todos los docentes, así que borrarlas lo alteraría (SD-9)",
        ),
    ),
    # ── Evaluaciones docentes: la institución decide (SD-9); hoy se conservan ──
    **_columnas("rubric_evaluations", ("attempt_id", "instructor_id", "total_score"), Regla(CONSERVAR, _M_CONDUCTA)),
    ("rubric_evaluations", "comment"): Regla(CONSERVAR, _M_TEXTO_DE_OTRO),
    **_columnas("criterion_scores", ("score", "level", "evidence_json"), Regla(CONSERVAR, _M_CONDUCTA)),
    ("criterion_scores", "comment"): Regla(CONSERVAR, _M_TEXTO_DE_OTRO),
    # ── Auditoría de solo añadir: la acción, el recurso y las fechas son la evidencia; solo se retiran la IP y el navegador ──
    **_columnas(
        "audit_logs", ("actor_id", "actor_role", "resource_id"),
        Regla(CONSERVAR, "la acción, el recurso y las fechas son la evidencia de quién hizo qué (RNF-007); no se tocan"),
    ),
    ("audit_logs", "context_json"): Regla(
        LIMPIAR_JSON,
        "el contexto lleva solo ids; las filas antiguas del asistente traían el texto libre de la pregunta (question) y ese "
        "texto se quita",
        roles=("actor",), valor=_contexto_sin_texto_libre,
    ),
    **_columnas(
        "audit_logs", ("ip_address", "user_agent"),
        Regla(ANULAR, "dirección y navegador de quien hizo la acción: dato personal de la persona", roles=("actor",)),
    ),
    # ── Consentimiento: evidencia de ETH-01 ──
    **_columnas(
        "consent_records", ("person_id", "accepted_at"),
        Regla(CONSERVAR, "evidencia de que el aviso de contenido se mostró y se aceptó (ETH-01); ya no identifica a nadie"),
    ),
}


# ── La compuerta ─────────────────────────────────────────────────────────────────────────────────────────────────
def _clase_en(inventario, tabla, columna):
    """La clasificación de ``tabla.columna`` en ``inventario``, o ``None`` si no está (como ``inventory.classify``, sin lanzar)."""
    entrada = inventario.get(tabla)
    if entrada is None:
        return None
    valor = entrada.get("columns", {}).get(columna)
    if valor is None:
        return entrada.get("default")
    return valor[0] if isinstance(valor, tuple) else valor


def _columnas_con_datos(inventario):
    """``{tabla: {columna: clase}}`` de las columnas personales, sensibles o secretas del inventario."""
    encontradas: dict[str, dict[str, Any]] = {}
    for tabla, entrada in inventario.items():
        for columna in entrada.get("columns", {}):
            clase = _clase_en(inventario, tabla, columna)
            if clase in CON_SALIDAS:
                encontradas.setdefault(tabla, {})[columna] = clase
    return encontradas


def modelo_de(tabla):
    """El modelo gestionado de la tabla ``tabla``, o ``None``."""
    return next((m for m in inventory._modelos_gestionados() if m._meta.db_table == tabla), None)


def campo_de(tabla, columna):
    """El campo del modelo cuya columna en la base es ``columna``, o ``None``."""
    modelo = modelo_de(tabla)
    if modelo is None:
        return None
    return next((campo for campo in modelo._meta.concrete_fields if campo.column == columna), None)


def _problemas_de_regla(tabla, columna, regla, roles_de_la_tabla):
    clave = f"{tabla}.{columna}"
    if regla.accion not in ACCIONES:
        return [f"{clave}: acción desconocida «{regla.accion}»"]
    problemas = []
    if not str(regla.motivo or "").strip():
        problemas.append(f"{clave}: la regla no tiene motivo escrito (sin motivo no se puede explicar qué se hizo)")
    if regla.roles is not None and not set(regla.roles) <= roles_de_la_tabla:
        problemas.append(f"{clave}: rol inexistente en PERSON_SCOPE de {tabla}: {sorted(set(regla.roles) - roles_de_la_tabla)}")
    campo = campo_de(tabla, columna)
    if regla.accion == SEUDONIMIZAR and regla.valor is None:
        problemas.append(f"{clave}: seudonimizar necesita el valor nuevo en Regla.valor")
    if regla.accion == LIMPIAR_JSON and not callable(regla.valor):
        problemas.append(f"{clave}: limpiar_json necesita en Regla.valor la función que limpia el texto JSON")
    if regla.accion in (VACIAR, ANULAR, BORRAR_FILA, CONSERVAR) and regla.valor is not None:
        problemas.append(f"{clave}: {regla.accion} no lleva valor (Regla.valor debe ser None)")
    if campo is not None:
        if regla.accion == ANULAR and not campo.null:
            problemas.append(f"{clave}: anular no sirve, la columna no admite NULL (usa vaciar o seudonimizar)")
        es_texto = campo.get_internal_type() in {"CharField", "TextField", "EmailField"}
        if regla.accion in (VACIAR, LIMPIAR_JSON) and not es_texto:
            problemas.append(f"{clave}: {regla.accion} solo sirve para columnas de texto")
    return problemas


def _problemas_de_alcance(inventario, alcance):
    problemas = []
    for tabla, pertenencias in alcance.items():
        roles = [p.rol for p in pertenencias]
        if len(set(roles)) != len(roles):
            problemas.append(f"{tabla}: papel repetido en PERSON_SCOPE")
        modelo = modelo_de(tabla)
        if modelo is None:
            continue
        reales = {campo.column for campo in modelo._meta.concrete_fields}
        for pertenencia in pertenencias:
            for columna in (*(pertenencia.solo or ()), *pertenencia.excluir):
                if columna not in reales:
                    problemas.append(f"{tabla}.{columna}: columna de exportación inexistente (papel {pertenencia.rol})")
            for columna in pertenencia.solo or ():
                if _clase_en(inventario, tabla, columna) == SECRET:
                    problemas.append(f"{tabla}.{columna}: columna secreta (SECRET) en la exportación; nunca sale (papel {pertenencia.rol})")
    return problemas


def validar_cobertura(*, inventario=None, alcance=None, reglas=None, sin_dueno=None) -> list[str]:
    """Lista, en español, todo lo que impide suprimir a una persona con garantías. Vacía = la cobertura está completa.

    Función pura: lee el inventario, el alcance y las reglas (los que se pasen, o los reales) y los metadatos de los modelos;
    no toca la base. Cada problema empieza por ``tabla`` o ``tabla.columna``. Dice: columnas personales, sensibles o secretas
    sin regla; tablas con datos de personas sin dueño ni exclusión; reglas, alcances y exclusiones obsoletos; reglas mal
    formadas (acción desconocida, sin motivo, ``anular`` sobre una columna NOT NULL…) y exportaciones con columnas inexistentes
    o secretas.
    """
    inventario = inventory.DATA_INVENTORY if inventario is None else inventario
    alcance = PERSON_SCOPE if alcance is None else alcance
    reglas = ERASURE_RULES if reglas is None else reglas
    sin_dueno = SIN_DUENO if sin_dueno is None else sin_dueno
    con_datos = _columnas_con_datos(inventario)
    problemas: list[str] = []

    for tabla in sorted(con_datos):
        if tabla not in alcance and tabla not in sin_dueno:
            problemas.append(
                f"{tabla}: tiene datos de personas y no está en PERSON_SCOPE ni en SIN_DUENO "
                "(decide de quién es y qué se hace al suprimirla: apps/privacy/data_subject.py)"
            )
    for tabla in sorted({*alcance, *sin_dueno}):
        if tabla not in inventario:
            problemas.append(f"{tabla}: está en PERSON_SCOPE o en SIN_DUENO y ya no está en el inventario (obsoleta)")
    for tabla in sorted(set(alcance) & set(sin_dueno)):
        problemas.append(f"{tabla}: está a la vez en PERSON_SCOPE y en SIN_DUENO; con dueño y sin dueño no puede ser las dos cosas")
    for tabla in sorted(alcance):
        if tabla in inventario and not con_datos.get(tabla):
            problemas.append(f"{tabla}: está en PERSON_SCOPE y ya no tiene columnas personales, sensibles ni secretas (obsoleta)")
        for columna, clase in con_datos.get(tabla, {}).items():
            if (tabla, columna) not in reglas:
                problemas.append(
                    f"{tabla}.{columna}: {clase} sin regla de supresión (decide qué se hace con ella en ERASURE_RULES, "
                    "apps/privacy/data_subject.py)"
                )

    roles_por_tabla = {tabla: {p.rol for p in pertenencias} for tabla, pertenencias in alcance.items()}
    for (tabla, columna), regla in sorted(reglas.items()):
        if columna not in con_datos.get(tabla, {}):
            problemas.append(f"{tabla}.{columna}: regla obsoleta (la columna no existe o ya no es personal, sensible ni secreta)")
            continue
        problemas.extend(_problemas_de_regla(tabla, columna, regla, roles_por_tabla.get(tabla, set())))

    # ``borrar_fila`` borra la fila entera: ninguna otra columna de la tabla puede hacer algo distinto.
    por_tabla: dict[str, list[tuple[str, Regla]]] = {}
    for (tabla, columna), regla in sorted(reglas.items()):
        por_tabla.setdefault(tabla, []).append((columna, regla))
    for tabla, columnas in por_tabla.items():
        if any(regla.accion == BORRAR_FILA for _, regla in columnas) and any(regla.accion != BORRAR_FILA for _, regla in columnas):
            problemas.extend(
                f"{tabla}.{columna}: borrar_fila no se mezcla con otras acciones en la misma tabla"
                for columna, regla in columnas if regla.accion == BORRAR_FILA
            )

    problemas.extend(_problemas_de_alcance(inventario, alcance))
    return problemas
