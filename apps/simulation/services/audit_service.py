"""Audit trail — Django equivalent of Spring's @Auditable AOP aspect
(infrastructure/audit/{Auditable,SimulationAuditAspect,AuditLogAdapter}).

Spring intercepts @Auditable service methods and, AFTER the method returns
successfully, writes an audit_logs row with actor (SecurityContext), resource id
(method arg), and IP/User-Agent (request). Here the same is done with:
  * a thread-local bound to the current request by ``AuditContextMiddleware``
    (DRF writes the authenticated user back onto the Django request, so by the
    time a service runs ``request.user`` is the actor);
  * an ``@auditable`` decorator placed OUTSIDE ``@transaction.atomic`` so the
    audit write happens after the business transaction (≈ Spring REQUIRES_NEW).

Audit must NEVER break the business operation: every failure here is caught and
logged. Retention is configurable via ``settings.AUDIT_RETENTION_DAYS`` with a
minimum of 12 months (360 days, E5-7 / RNF-007).
"""
import functools
import json
import logging
import re
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta

from django.conf import settings
from django.db import connection, transaction
from django.utils import timezone

from apps.security.limiter import hit, key_hash
from apps.security.limits import LIMITS
from shared.client_ip import client_ip
from shared.security_events import log_security_event

from ..models import AuditLog, CaseReview
from shared.policies import ESTUDIANTE

logger = logging.getLogger(__name__)

MIN_RETENTION_DAYS = 360  # Spring: RETENTION_MONTHS(12) * 30 days (≥ 12 meses, RNF-007)
RETENTION_DAYS = MIN_RETENTION_DAYS
MAX_USER_AGENT_LEN = 500
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
MAX_PAGE = 1_000_000  # más allá, el OFFSET se sale del rango de la base y el listado cae con un 500
#: Bandera de sesión que mira el trigger de la migración 0026 (S4-2): ``on`` deja pasar UPDATE, DELETE y TRUNCATE.
AUDIT_PURGE_SETTING = "siep.purge"

#: Taxonomía canónica ``entidad.verbo`` (E5-7, §A16, C15).
AUDIT_TAXONOMY: dict[str, str] = {
    "ATTEMPT_STARTED": "intento.iniciar",
    "DECISION_SELECTED": "intento.decidir",
    "REFLECTION_SAVED": "intento.reflexionar",
    "SAFE_EXIT_REQUESTED": "intento.pausar",
    "ATTEMPT_RESUMED": "intento.reanudar",
    "ATTEMPT_REPLACED": "intento.reemplazar",
    "AI_ASSISTANT_QUERY": "asistente.consultar",
    "AI_AUTHORING_PROPOSE": "asistente_autoria.proponer",
    "AI_AUTHORING_GUIDE": "asistente_autoria.guiar",
    "TRACE_VIEWED": "traza.leer",
    "RUBRIC_SAVED": "rubrica.evaluar",
    "ANALYTICS_VIEWED": "analitica.ver",
    "CASE_CREATED": "caso.crear",
    "CASE_IMPORTED": "caso.importar",
    "CASE_SUBMITTED": "caso.enviar_revision",
    "CASE_APPROVED": "caso.aprobar",
    "CASE_REJECTED": "caso.rechazar",
    "CASE_ARCHIVED": "caso.archivar",
    "CASE_CLONED": "caso.clonar",
    "ADMIN_PUBLISH_CASE": "caso.publicar",
    "ADMIN_CLONE_VERSION": "caso.clonar",
    "ADMIN_CHECKLIST_UPDATE": "caso.actualizar_checklist",
    "ADMIN_UPDATE_BRIEF": "caso.actualizar_ficha",
    "ADMIN_SAVE_WORLD": "mundo.guardar",
    "ADMIN_CREATE_NODE": "nodo.crear",
    "ADMIN_REORDER_NODES": "nodo.reordenar",
    "ADMIN_UPDATE_NODE": "nodo.actualizar",
    "ADMIN_DELETE_NODE": "nodo.eliminar",
    "ADMIN_CREATE_DECISION": "decision.crear",
    "ADMIN_UPDATE_DECISION": "decision.actualizar",
    "ADMIN_DELETE_DECISION": "decision.eliminar",
    "ADMIN_UPDATE_MILESTONES": "reglas.actualizar_hitos",
    "ADMIN_UPDATE_RISK": "reglas.actualizar_riesgo",
    "ADMIN_UPDATE_ENDINGS": "reglas.actualizar_finales",
    "ADMIN_ACCEPT_AI_NODE": "ia.aceptar_nodo",
    "ADMIN_ACCEPT_AI_DECISION": "ia.aceptar_decision",
    "ADMIN_ACCEPT_AI_DIALOGUE": "ia.aceptar_dialogo",
    "ADMIN_ACCEPT_AI_OBJECT": "ia.aceptar_objeto",
    "ADMIN_CREATE_MAP": "mapa.crear",
    "ADMIN_UPDATE_MAP": "mapa.actualizar",
    "ADMIN_DELETE_MAP": "mapa.eliminar",
    "ADMIN_CREATE_OBJECT": "objeto.crear",
    "ADMIN_UPDATE_OBJECT": "objeto.actualizar",
    "ADMIN_DELETE_OBJECT": "objeto.eliminar",
    "ADMIN_CREATE_DIALOGUE": "dialogo.crear",
    "ADMIN_UPDATE_DIALOGUE": "dialogo.actualizar",
    "ADMIN_DELETE_DIALOGUE": "dialogo.eliminar",
    "ADMIN_CREATE_TOOL": "herramienta.crear",
    "ADMIN_UPDATE_TOOL": "herramienta.actualizar",
    "ADMIN_DELETE_TOOL": "herramienta.eliminar",
    "ADMIN_CREATE_HINT": "pista.crear",
    "ADMIN_UPDATE_HINT": "pista.actualizar",
    "ADMIN_DELETE_HINT": "pista.eliminar",
    "ADMIN_CREATE_CHARACTER": "personaje.crear",
    "ADMIN_UPDATE_CHARACTER": "personaje.actualizar",
    "ADMIN_DELETE_CHARACTER": "personaje.eliminar",
    "MEMBERSHIP_INVITED": "grupo.invitar",
    "MEMBERSHIP_ACCEPTED": "grupo.aceptar",
    "MEMBERSHIP_DECLINED": "grupo.rechazar",
    "MEMBERSHIP_LEFT": "grupo.salir",
    "MEMBERSHIP_REMOVED": "grupo.retirar",
    "STUDENTS_IMPORTED": "grupo.importar",
    "GROUP_CREATED": "grupo.crear",
    "GROUP_UPDATED": "grupo.actualizar",
    "GROUP_DELETED": "grupo.eliminar",
    "ASSIGNMENT_CREATED": "asignacion.crear",
    "ASSIGNMENT_UPDATED": "asignacion.actualizar",
    "ASSIGNMENT_REMOVED": "asignacion.eliminar",
    "USER_APPROVED": "usuario.aprobar",
    "PASSWORD_CHANGED": "usuario.cambiar_clave",
    "PASSWORD_SET_BY_ADMIN": "usuario.fijar_clave",
    "SESSIONS_REVOKED": "sesion.revocar",
    # S4-1 · quién entró, quién cambió qué y quién leyó datos de otra persona (RNF-007, SIEP-RNF-02).
    "LOGIN_SUCCEEDED": "sesion.entrar",
    "LOGIN_FAILED": "sesion.fallar",
    "LOGIN_LOCKED": "sesion.bloquear",
    "LOGOUT": "sesion.salir",
    "USER_CREATED": "usuario.crear",
    "USER_UPDATED": "usuario.actualizar",
    "USER_STATUS_CHANGED": "usuario.estado",
    "USER_ROLE_CHANGED": "usuario.rol",
    "USER_LIST_VIEWED": "usuario.listar",
    "ADMIN_CREATED_BY_COMMAND": "usuario.crear_admin",
    "ADMIN_RESET_BY_COMMAND": "usuario.reponer_admin",
    "ACCESS_REQUEST_CREATED": "solicitud.crear",
    "ACCESS_REQUEST_RESOLVED": "solicitud.resolver",
    "ACCESS_REQUEST_LIST_VIEWED": "solicitud.listar",
    "REPORT_VIEWED": "reporte.leer",
    "REPORT_EXPORTED": "reporte.exportar",
    "GROUP_STUDENTS_VIEWED": "grupo.listar_estudiantes",
    "AUDIT_VIEWED": "auditoria.leer",
    "RUBRIC_CREATED": "rubrica.crear",
    "RUBRIC_UPDATED": "rubrica.actualizar",
    "RUBRIC_ACTIVATED": "rubrica.activar",
    "COMPETENCY_CREATED": "competencia.crear",
    # S3-2a · el consentimiento al aviso de contenido: se escribe con la etiqueta (``consent_service``).
    "CONSENT_ACCEPTED": "consentimiento.aceptar",
    "CONSENT_WITHDRAWN": "consentimiento.retirar",
    # S3-4 · los derechos del titular y la retención: comandos de gestión (``apps/privacy``), con el ADMIN que los ejecuta como actor.
    "PERSONAL_DATA_EXPORTED": "datos.exportar",
    "PERSONAL_DATA_ERASED": "datos.suprimir",
    "EXPIRED_DATA_PURGED": "datos.depurar",
}

#: S4-1 · La lista blanca del contexto: por código crudo, los únicos campos que la fila de ese evento puede llevar (más
#: ``taxonomy``, ``method`` y ``class``, que pone el sistema). Nunca contraseñas, tokens, correos en claro ni texto escrito
#: por una persona: solo ids, banderas, nombres de campos y valores de un conjunto cerrado (``reason``, ``role``…). Un
#: evento que no está aquí (los que ya existían) conserva su contexto tal cual. ``append`` la aplica a toda fila.
CONTEXT_WHITELIST: dict[str, frozenset[str]] = {
    "LOGIN_SUCCEEDED": frozenset({"provider"}),
    "LOGIN_FAILED": frozenset({"emailHash", "reason"}),
    "LOGIN_LOCKED": frozenset({"scope", "targetId"}),
    "LOGOUT": frozenset(),
    "USER_CREATED": frozenset({"targetId", "role", "activo"}),
    "USER_UPDATED": frozenset({"targetId", "changed"}),
    "USER_STATUS_CHANGED": frozenset({"targetId", "changed", "activo"}),
    "USER_ROLE_CHANGED": frozenset({"targetId", "changed", "role", "previousRole"}),
    "USER_LIST_VIEWED": frozenset({"count"}),
    "ADMIN_CREATED_BY_COMMAND": frozenset({"targetId"}),
    "ADMIN_RESET_BY_COMMAND": frozenset({"targetId"}),
    "ACCESS_REQUEST_CREATED": frozenset({"requestId"}),
    "ACCESS_REQUEST_RESOLVED": frozenset({"requestId", "status"}),
    "ACCESS_REQUEST_LIST_VIEWED": frozenset({"count"}),
    "REPORT_VIEWED": frozenset({"groupId", "studentId", "attemptId", "caseVersionId"}),
    "REPORT_EXPORTED": frozenset({"groupId", "caseVersionId"}),
    "GROUP_STUDENTS_VIEWED": frozenset({"groupId", "count"}),
    "GROUP_CREATED": frozenset({"groupId"}),
    "GROUP_UPDATED": frozenset({"groupId", "changed"}),
    "GROUP_DELETED": frozenset({"groupId"}),
    "AUDIT_VIEWED": frozenset({"filters", "actorId", "page"}),
    "RUBRIC_CREATED": frozenset({"rubricId", "sourceId", "isDefault"}),
    "RUBRIC_UPDATED": frozenset({"rubricId", "changed", "caseVersionId"}),
    "RUBRIC_ACTIVATED": frozenset({"rubricId", "active"}),
    "COMPETENCY_CREATED": frozenset({"competencyId"}),
    # S7-2 (#2) · `node` lo manda el cliente tal cual: la lista blanca deja solo números y palabras cortas (el texto de la
    # pregunta nunca entra: solo su longitud).
    "AI_ASSISTANT_QUERY": frozenset({"question_length", "node", "decision_taken", "response_length"}),
    # P5 · el asistente de autoría: pantalla (palabra segura), modelo, recuento de cambios, duración y resultado. Nunca el
    # texto de la petición ni de la respuesta.
    "AI_AUTHORING_PROPOSE": frozenset({"screen", "model", "changes", "duration_ms", "outcome"}),
    "AI_AUTHORING_GUIDE": frozenset({"screen", "model", "changes", "duration_ms", "outcome"}),
    "CONSENT_ACCEPTED": frozenset({"caseVersionId", "noticeVersion"}),
    "CONSENT_WITHDRAWN": frozenset({"caseVersionId", "noticeVersion"}),
    # S3-4 · solo ids (de la persona y del ADMIN que ejecuta) y recuentos: nunca el correo, el nombre ni un texto de la persona.
    "PERSONAL_DATA_EXPORTED": frozenset({"targetId", "executedBy", "rows", "tables"}),
    "PERSONAL_DATA_ERASED": frozenset({"targetId", "executedBy", "changed", "deleted", "tables"}),
    "EXPIRED_DATA_PURGED": frozenset({"executedBy", "rateLimits", "auditLogs", "accessRequests"}),
}
#: Lo que el sistema pone en toda fila escrita por ``@auditable``/``record``: constantes, nunca datos de la persona.
_CONTEXTO_DEL_SISTEMA = frozenset({"taxonomy", "method", "class"})
#: Un texto del contexto solo puede ser una palabra de un conjunto cerrado o un hash: sin espacios, sin ``@``, a lo más 64.
_VALOR_SEGURO = re.compile(r"[A-Za-z0-9_.:\-]{1,64}")

_local = threading.local()


def retention_days() -> int:
    """Días de retención de auditoría (mínimo 360 días = 12 meses, RNF-007)."""
    configured = getattr(settings, "AUDIT_RETENTION_DAYS", MIN_RETENTION_DAYS)
    try:
        return max(MIN_RETENTION_DAYS, int(configured))
    except (TypeError, ValueError):
        return MIN_RETENTION_DAYS


def canonical_action(action: str | None) -> str:
    """Devuelve la etiqueta canónica ``entidad.verbo`` para una acción de auditoría."""
    if not action:
        return "sistema.desconocido"
    if "." in action:
        return action
    return AUDIT_TAXONOMY.get(action, action.lower().replace("_", "."))


def matching_actions(action_filter: str) -> list[str]:
    """Expande un filtro de acción (``entidad.verbo`` o código legado) a todas sus variantes."""
    candidates = {action_filter}
    if action_filter in AUDIT_TAXONOMY:
        candidates.add(AUDIT_TAXONOMY[action_filter])
    for raw_code, taxonomy_code in AUDIT_TAXONOMY.items():
        if taxonomy_code == action_filter:
            candidates.add(raw_code)
    return sorted(candidates)


# ─── request binding (set by AuditContextMiddleware) ─────────────────────────
def bind_request(request):
    _local.request = request


def clear_request():
    _local.request = None


def _current_request():
    return getattr(_local, "request", None)


# ─── actor / http context resolution ─────────────────────────────────────────
def _resolve_actor():
    request = _current_request()
    user = getattr(request, "user", None) if request is not None else None
    if user is not None and getattr(user, "is_authenticated", False):
        actor_id = str(user.id) if getattr(user, "id", None) is not None else None
        actor_role = getattr(user, "role", None) or "SYSTEM"
        return actor_id, actor_role
    return None, "ANONYMOUS"


def current_actor_id():
    """El id (entero) de quien hace la petición en curso, o ``None`` fuera de una petición."""
    actor_id, _ = _resolve_actor()
    try:
        return int(actor_id) if actor_id is not None else None
    except (TypeError, ValueError):
        return None


def _client_ip(request):
    # None (NULL en ``ip_address``) cuando no hay IP: la cadena vacía no es una dirección.
    return client_ip(request) or None


# ─── persistence (Spring AuditLogAdapter.append) ─────────────────────────────
def _registrar_fallo_de_auditoria(action, ex):
    """Un fallo al escribir la auditoría: una línea ERROR con nombre estable y un contador en la base (S4-3).

    Solo se guarda el nombre de la excepción, porque su texto puede traer datos de la persona. La operación auditada
    ya terminó y no se rompe; el contador va aparte, en su propio ``try``.
    """
    logger.error(
        "audit_write_failed",
        extra={"fields": {"event": "audit_write_failed", "action": action, "error": type(ex).__name__}},
    )
    try:
        hit("audit_failure", key_hash("all"))
    except Exception:  # noqa: BLE001 - contar el fallo no puede romper nada
        pass


def _lista_blanca_de(action):
    """La lista blanca del evento, se escriba con su código crudo (``LOGIN_FAILED``) o con su etiqueta (``sesion.fallar``);
    ``None`` si el evento no la tiene (los que ya existían)."""
    if action in CONTEXT_WHITELIST:
        return CONTEXT_WHITELIST[action]
    return next(
        (CONTEXT_WHITELIST[crudo] for crudo, etiqueta in AUDIT_TAXONOMY.items()
         if etiqueta == action and crudo in CONTEXT_WHITELIST),
        None,
    )


def _valor_seguro(valor) -> bool:
    if isinstance(valor, (bool, int)):
        return True
    return isinstance(valor, str) and _VALOR_SEGURO.fullmatch(valor) is not None


def _filtrar_contexto(payload: dict, permitidos: frozenset) -> dict:
    """Deja en el contexto solo los campos de la lista blanca y solo valores simples (S4-1).

    Un campo que el evento no declara se descarta; también un valor que no es un número, una bandera o una palabra
    corta (sin espacios, sin ``@``): nada de textos libres, correos ni estructuras anidadas. Una lista conserva solo sus
    elementos simples.
    """
    limpio = {}
    for clave, valor in payload.items():
        if clave not in permitidos and clave not in _CONTEXTO_DEL_SISTEMA:
            continue
        if isinstance(valor, (list, tuple)):
            limpio[clave] = [item for item in valor if _valor_seguro(item)]
        elif _valor_seguro(valor):
            limpio[clave] = valor
    return limpio


def _cabe_la_fila_del_estudiante(actor_fk, actor_role):
    """Cuenta la fila en el tope por estudiante (``audit_game_user``) y dice si cabe (revisión S7-2, #2).

    La auditoría es de solo añadir y las órdenes de juego no llevan limitador: sin este tope una sola cuenta la llenaba. Solo
    acota a los estudiantes (los demás roles tienen sus propios límites en las rutas pesadas). Lo que pasa del tope no se
    escribe, sigue contado y deja UN aviso por ventana, sin datos de la persona salvo su id. Con el limitador apagado,
    ``hit`` devuelve 0 y no hay tope."""
    if actor_fk is None or actor_role != ESTUDIANTE:
        return True
    total = hit("audit_game_user", key_hash(str(actor_fk), "juego"))
    limite = LIMITS["audit_game_user"].limit
    if total == limite + 1:
        log_security_event("audit_game_user_capped", scope="audit_game_user", actor_id=actor_fk)
    return total <= limite


def append(actor_id, actor_role, action, resource_type, resource_id,
           context, ip_address, user_agent, occurred_at):
    try:
        actor_fk = None
        if actor_id is not None:
            try:
                actor_fk = int(actor_id)
            except (TypeError, ValueError):
                actor_fk = None  # e.g. a UUID actor — keep FK null
        if not _cabe_la_fila_del_estudiante(actor_fk, actor_role):
            return
        occurred = occurred_at or timezone.now()
        payload = dict(context) if isinstance(context, dict) else {}
        payload.setdefault("taxonomy", canonical_action(action))
        permitidos = _lista_blanca_de(action)
        if permitidos is not None:
            payload = _filtrar_contexto(payload, permitidos)
        AuditLog.objects.create(
            actor_id=actor_fk,
            actor_role=actor_role,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            context_json=json.dumps(payload),
            ip_address=ip_address,
            user_agent=user_agent[:MAX_USER_AGENT_LEN] if user_agent else None,
            occurred_at=occurred,
            retention_until=occurred + timedelta(days=retention_days()),
        )
    except Exception as ex:  # pragma: no cover - audit must never propagate
        _registrar_fallo_de_auditoria(action, ex)


@contextmanager
def audit_purge_window():
    """Abre la puerta de la auditoría de solo añadir (S4-2) solo dentro de este bloque.

    Lo usan el purgado (``purge_audit_logs``) y los ayudantes de prueba. ``set_config(..., true)`` enciende
    ``siep.purge`` hasta el fin de la transacción. Al salir con éxito devuelve el valor que tenía antes, así que una
    ventana anidada no deja la puerta abierta en la transacción de fuera; si el bloque falla, PostgreSQL deshace el
    cambio junto con su savepoint.
    """
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("SELECT current_setting(%s, true)", [AUDIT_PURGE_SETTING])
        previous = cursor.fetchone()[0] or ""
        cursor.execute("SELECT set_config(%s, 'on', true)", [AUDIT_PURGE_SETTING])
        yield
        cursor.execute("SELECT set_config(%s, %s, true)", [AUDIT_PURGE_SETTING, previous])


def record(action, resource_type=None, resource_id=None, context=None, *, actor=None):
    """Escribe UNA fila de auditoría ahora, sin decorador (S4-1). Nunca lanza.

    Para los lugares donde ``@auditable`` no encaja: el acceso (la petición aún no está autenticada y quien entró es el
    ``actor`` que se pasa), las lecturas de las vistas y los eventos de una operación que no es una función de servicio.
    Sin ``actor`` sale de la petición enlazada (``AuditContextMiddleware``); fuera de una petición es ``ANONYMOUS``. El
    contexto pasa por la lista blanca de ``action`` (``CONTEXT_WHITELIST``). Llámala FUERA de una transacción abierta: un
    fallo de la base dentro de ella dejaría la transacción abortada, y la auditoría no debe romper la operación.
    """
    try:
        if actor is not None:
            actor_id = str(actor.pk) if getattr(actor, "pk", None) is not None else None
            actor_role = getattr(actor, "role", None) or "SYSTEM"
        else:
            actor_id, actor_role = _resolve_actor()
        request = _current_request()
        ip_address = _client_ip(request) if request is not None else None
        user_agent = request.META.get("HTTP_USER_AGENT") if request is not None else None
        payload = {"taxonomy": canonical_action(action)}
        if context:
            payload.update(context)
        append(
            actor_id,
            actor_role,
            action,
            resource_type or None,
            None if resource_id is None else str(resource_id),
            payload,
            ip_address,
            user_agent,
            timezone.now(),
        )
    except Exception as ex:  # audit errors never reach the caller
        _registrar_fallo_de_auditoria(action, ex)


# ─── @auditable decorator (Spring SimulationAuditAspect) ─────────────────────
def arg(args, kwargs, index, name):
    """El argumento ``name`` de una llamada, venga posicional (``index``) o por nombre."""
    if name in kwargs:
        return kwargs[name]
    return args[index] if index < len(args) else None


def auditable(action, resource_type="", resource_id_param_index=0, context=None, resource_id=None):
    """Registra ``action`` DESPUÉS de que la operación termine bien.

    ``context`` (opcional) es ``(args, kwargs, result) -> dict``: lo que devuelve se suma al
    contexto de la fila (p. ej. los ids de las cuentas aprobadas en un lote). ``resource_id`` (opcional, con la misma
    firma) saca el recurso de lo que devolvió la operación (p. ej. el id de lo que acaba de crear) y manda sobre
    ``resource_id_param_index``. Si cualquiera falla, la fila se escribe sin esos datos: la auditoría nunca rompe la
    operación.
    """

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)  # always run the operation first
            try:
                extra = None
                if context is not None:
                    try:
                        extra = context(args, kwargs, result)
                    except Exception as ex:  # noqa: BLE001
                        logger.warning("Audit context error [action=%s]: %s", action, ex)
                recurso = None
                if resource_id is not None:
                    try:
                        recurso = resource_id(args, kwargs, result)
                    except Exception as ex:  # noqa: BLE001
                        logger.warning("Audit resource error [action=%s]: %s", action, ex)
                _write_audit(func, action, resource_type, resource_id_param_index, args, extra, recurso)
            except Exception as ex:  # audit errors never reach the caller
                _registrar_fallo_de_auditoria(action, ex)
            return result

        return wrapper

    return decorator


def _write_audit(func, action, resource_type, idx, args, extra=None, recurso=None):
    actor_id, actor_role = _resolve_actor()

    resource_id = None
    if recurso is not None:
        resource_id = str(recurso)
    elif idx >= 0 and args and idx < len(args) and args[idx] is not None:
        resource_id = str(args[idx])

    request = _current_request()
    ip_address = _client_ip(request) if request is not None else None
    user_agent = request.META.get("HTTP_USER_AGENT") if request is not None else None

    context = {
        "method": func.__name__,
        "class": func.__module__.rsplit(".", 1)[-1],
        "taxonomy": canonical_action(action),
    }
    if extra:
        context.update(extra)

    append(
        actor_id,
        actor_role,
        action,
        resource_type or None,
        resource_id,
        context,
        ip_address,
        user_agent,
        timezone.now(),
    )


# ─── Consulta de auditoría y alarma del sello (E5-7 ⇢ C15) ────────────────────
def review_quality_summary() -> dict:
    """Visibilidad para el ADMIN de devoluciones por CONTENIDO frente a FORMA (consejo §9.1-B).

    Si tras al menos 5 revisiones decididas ninguna devolución es por ``CONTENIDO`` (o tras 30
    revisiones con devoluciones más del 30 % del total sigue sin participación sustantiva de
    contenido), se activa ``rubberStampAlarm = True``.
    """
    decided = CaseReview.objects.filter(decision__isnull=False)
    decided_count = decided.count()
    approved_count = decided.filter(decision="APPROVED").count()
    rejected = decided.filter(decision="REJECTED")
    rejected_total = rejected.count()
    rejected_content = rejected.filter(reason="CONTENIDO").count()
    rejected_form = rejected.filter(reason="FORMA").count()

    content_rate = round(rejected_content / decided_count, 4) if decided_count else 0.0
    form_rate = round(rejected_form / decided_count, 4) if decided_count else 0.0
    alarm = bool(
        (decided_count >= 5 and rejected_content == 0)
        or (decided_count >= 30 and rejected_total > 0 and (rejected_content / rejected_total) < 0.30)
    )
    return {
        "decidedReviews": decided_count,
        "approved": approved_count,
        "rejectedTotal": rejected_total,
        "rejectedByContent": rejected_content,
        "rejectedByForm": rejected_form,
        "contentRejectionRate": content_rate,
        "formRejectionRate": form_rate,
        "rubberStampAlarm": alarm,
    }


#: Claves del contexto que son texto libre escrito por una persona. El asistente de IA ya no las guarda, pero las
#: filas anteriores pueden traerlas: la lectura de la auditoría nunca las devuelve.
HIDDEN_CONTEXT_KEYS = frozenset({"question"})


def _parse_context(raw_json: str | None) -> dict:
    if not raw_json:
        return {}
    try:
        parsed = json.loads(raw_json)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def list_audit_logs(
    *,
    actor_id: int | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    from_dt: datetime | None = None,
    to_dt: datetime | None = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> dict:
    """Consulta paginada y filtrada de ``audit_logs`` para el ADMIN (C15, SIEP-RNF-02, RNF-007)."""
    qs = AuditLog.objects.all()
    if actor_id is not None:
        qs = qs.filter(actor_id=actor_id)
    if action:
        qs = qs.filter(action__in=matching_actions(action.strip()))
    if resource_type:
        qs = qs.filter(resource_type=resource_type.strip())
    if from_dt is not None:
        qs = qs.filter(occurred_at__gte=from_dt)
    if to_dt is not None:
        qs = qs.filter(occurred_at__lte=to_dt)

    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    total = qs.count()
    offset = (page - 1) * page_size
    rows = list(qs.order_by("-occurred_at", "-id")[offset : offset + page_size])

    items = []
    for row in rows:
        ctx = {k: v for k, v in _parse_context(row.context_json).items() if k not in HIDDEN_CONTEXT_KEYS}
        items.append({
            "id": row.id,
            "actorId": row.actor_id,
            "actorRole": row.actor_role,
            "action": row.action,
            "taxonomy": ctx.get("taxonomy") or canonical_action(row.action),
            "resourceType": row.resource_type,
            "resourceId": row.resource_id,
            "context": ctx,
            "ipAddress": row.ip_address,
            "userAgent": row.user_agent,
            "occurredAt": row.occurred_at.isoformat() if row.occurred_at else None,
            "retentionUntil": row.retention_until.isoformat() if row.retention_until else None,
        })

    return {
        "items": items,
        "page": page,
        "pageSize": page_size,
        "coverage": {"shown": len(items), "total": total},
        "retentionDays": retention_days(),
        "reviewQuality": review_quality_summary(),
    }
