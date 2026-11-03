"""Inventario de superficie del servidor (plan 03, S0-2).

Recorre el ``urlconf`` real y da, por ruta y método HTTP, quién puede llamarla (``exposure``), qué
cuerpo admite (``body``), los alcances del limitador (``throttle``, S1-2) y la auditoría que deja (``audit``, S4-1: un
código, varios separados por coma, o ``EXENTO: <motivo>``; vacío si la ruta ni muta ni lee datos de otra persona).
``shared/surface-inventory.json`` es la evidencia versionada de ese recorrido: si aparece una ruta
nueva o cambia una exposición, ``shared/tests/test_surface_inventory.py`` falla hasta que se regenere
con ``python -m shared.surface --write`` (desde ``backend_django/``).

Las rutas públicas y su motivo viven aquí: son la única fuente de ``test_public_routes.py``. La auditoría de cada ruta
(``AUDIT_BY_ROUTE``) también: ``shared/tests/test_audit_coverage.py`` exige que toda ruta que muta o lee datos de otra
persona la declare.
"""
import json
import os
import sys
from pathlib import Path

if __name__ == "__main__":
    # ``python -m shared.surface``: DRF lee sus ajustes al cargarse (``APIView``), así que Django se
    # configura antes de importarlo. Dentro de pytest ya lo configura ``pytest.ini``.
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "psychosim.settings.base")
    import django

    django.setup()

from django.contrib.auth.models import AnonymousUser  # noqa: E402
from django.test import RequestFactory  # noqa: E402
from django.urls import URLPattern, URLResolver, get_resolver  # noqa: E402
from rest_framework.parsers import MultiPartParser  # noqa: E402
from rest_framework.permissions import IsAuthenticated  # noqa: E402
from rest_framework.views import APIView  # noqa: E402

VERSION = 1
HTTP_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")
PUBLIC = "public"
AUTHENTICATED = "authenticated"

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
PUBLIC_ROUTE_REASONS: dict[str, str] = {
    "api/health": "sondeo de salud de la plataforma",
    "api/auth/login": "entrar",
    "api/auth/google": "entrar con una cuenta de Google",
    "api/auth/google/config": "configuración pública del acceso con Google",
    "api/auth/access-request": "pedir una cuenta, que aprueba el ADMIN",
    "api/security/csp-report": "informe anónimo y limitado de violaciones de la política de contenido (CSP)",
    "^(?!api/|schema/|swagger-ui|django-static/).*$": "comodín que sirve la SPA de Angular",
}

#: Prefijo de una exención en ``AUDIT_BY_ROUTE``: ``EXENTO: <motivo>``.
EXENTO = "EXENTO: "
_CV = "/<int:case_version_id>"

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
_PROPIO = "lectura de lo propio o de un catálogo común a todos los roles: no son datos de otra persona"
_CONTENIDO = "contenido del caso (autoría): no son datos de personas"
_CALCULO = "valida el caso y devuelve hallazgos: no escribe en la base"
_RUBRICAS = "rúbricas y competencias (el instrumento de evaluación): no son datos de personas"
_GRUPOS = "grupos y asignaciones de casos: nombres, códigos y conteos, sin datos de personas"
_SEUDONIMO = (
    "listado seudonimizado (alias por docente) dentro de su alcance; leer el detalle de un intento "
    "(traza, evaluación, reporte) sí queda auditado"
)
_CATALOGO = "catálogo de lugares, salas y objetos de la biblioteca (archivos del servidor): no son datos de personas"
_ESTATICO = "plantilla o especificación estática: no lee datos de nadie"
_INTENTO_PROPIO = (
    "estado de juego del propio intento: el hecho queda en la traza del intento (attempt_events), que se audita al leerla"
)
_DOCUMENTACION = "documentación de la API: cerrada al ADMIN y apagada por defecto, sin datos de personas"
# BORRADOR (E6-3): texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
_ENCUESTA_PROPIA = (
    "respuesta del estudiante a la encuesta breve de SU intento completado (apagada por defecto): se envía una sola vez y no se modifica, y la fila misma (el intento y la fecha en attempt_feedback) es la evidencia; el comentario no entra a la auditoría"
)


def _exento(motivo):
    return EXENTO + motivo


def _autoria(prefijo, tabla):
    return {(prefijo + sufijo, metodo): valor for (sufijo, metodo), valor in tabla.items()}


# La autoría de casos vive en dos prefijos con el mismo urlconf (ED-9): ``/api/authoring/cases`` es el canónico y
# ``/api/admin/cases`` su alias hasta que el cliente migre. Se declara una vez por sufijo y se expande a los dos.
_AUTORIA = {
    ("", "GET"): _exento(_CONTENIDO),
    ("", "POST"): "CASE_CREATED",
    ("/import", "POST"): "CASE_IMPORTED",
    # P5 · el asistente de IA de autoría: ``status`` solo lee el cupo de quien llama y su propio caso.
    (f"{_CV}/assistant/status", "GET"): _exento(_PROPIO),
    (f"{_CV}/assistant/propose", "POST"): "AI_AUTHORING_PROPOSE",
    (f"{_CV}/assistant/guide", "POST"): "AI_AUTHORING_GUIDE",
    (f"{_CV}/brief", "PUT"): "ADMIN_UPDATE_BRIEF",
    (f"{_CV}/characters", "POST"): "ADMIN_CREATE_CHARACTER",
    (f"{_CV}/characters/<int:character_id>", "PUT"): "ADMIN_UPDATE_CHARACTER",
    (f"{_CV}/characters/<int:character_id>", "DELETE"): "ADMIN_DELETE_CHARACTER",
    (f"{_CV}/checklist", "PUT"): "ADMIN_CHECKLIST_UPDATE",
    (f"{_CV}/clone-version", "POST"): "ADMIN_CLONE_VERSION",
    (f"{_CV}/decisions", "POST"): "ADMIN_CREATE_DECISION",
    (f"{_CV}/decisions/<int:decision_id>", "PUT"): "ADMIN_UPDATE_DECISION",
    (f"{_CV}/decisions/<int:decision_id>", "DELETE"): "ADMIN_DELETE_DECISION",
    (f"{_CV}/definition", "GET"): _exento(_CONTENIDO),
    (f"{_CV}/dialogues/<int:tree_id>", "PUT"): "ADMIN_UPDATE_DIALOGUE",
    (f"{_CV}/dialogues/<int:tree_id>", "DELETE"): "ADMIN_DELETE_DIALOGUE",
    (f"{_CV}/editor", "GET"): _exento(_CONTENIDO),
    (f"{_CV}/hints/<int:hint_id>", "PUT"): "ADMIN_UPDATE_HINT",
    (f"{_CV}/hints/<int:hint_id>", "DELETE"): "ADMIN_DELETE_HINT",
    (f"{_CV}/lifecycle", "GET"): _exento(_CONTENIDO),
    # Una sola ruta, cinco acciones (``action`` del cuerpo): cada una deja su evento.
    (f"{_CV}/lifecycle", "POST"): "CASE_SUBMITTED,CASE_APPROVED,CASE_REJECTED,CASE_ARCHIVED,CASE_CLONED",
    (f"{_CV}/maps", "POST"): "ADMIN_CREATE_MAP",
    (f"{_CV}/maps/<int:map_id>", "PUT"): "ADMIN_UPDATE_MAP",
    (f"{_CV}/maps/<int:map_id>", "DELETE"): "ADMIN_DELETE_MAP",
    (f"{_CV}/maps/<int:map_id>/dialogues", "POST"): "ADMIN_CREATE_DIALOGUE",
    (f"{_CV}/maps/<int:map_id>/hints", "POST"): "ADMIN_CREATE_HINT",
    (f"{_CV}/maps/<int:map_id>/objects", "POST"): "ADMIN_CREATE_OBJECT",
    (f"{_CV}/nodes", "POST"): "ADMIN_CREATE_NODE",
    (f"{_CV}/nodes/<int:node_id>/accept-ai", "POST"): "ADMIN_ACCEPT_AI_NODE",
    (f"{_CV}/decisions/<int:decision_id>/accept-ai", "POST"): "ADMIN_ACCEPT_AI_DECISION",
    (f"{_CV}/dialogues/<int:tree_id>/accept-ai", "POST"): "ADMIN_ACCEPT_AI_DIALOGUE",
    (f"{_CV}/objects/<int:object_id>/accept-ai", "POST"): "ADMIN_ACCEPT_AI_OBJECT",
    # Las reglas de métricas (hitos, riesgo y finales) vienen de la rama de métricas; se declaran aquí para la compuerta.
    (f"{_CV}/rules/milestones", "PUT"): "ADMIN_UPDATE_MILESTONES",
    (f"{_CV}/rules/risk", "PUT"): "ADMIN_UPDATE_RISK",
    (f"{_CV}/rules/endings", "PUT"): "ADMIN_UPDATE_ENDINGS",
    (f"{_CV}/nodes/<int:node_id>", "PUT"): "ADMIN_UPDATE_NODE",
    (f"{_CV}/nodes/<int:node_id>", "DELETE"): "ADMIN_DELETE_NODE",
    (f"{_CV}/nodes/reorder", "PATCH"): "ADMIN_REORDER_NODES",
    (f"{_CV}/objects/<int:object_id>", "PUT"): "ADMIN_UPDATE_OBJECT",
    (f"{_CV}/objects/<int:object_id>", "DELETE"): "ADMIN_DELETE_OBJECT",
    (f"{_CV}/publish", "POST"): "ADMIN_PUBLISH_CASE",
    (f"{_CV}/rules/milestones", "PUT"): "ADMIN_UPDATE_MILESTONES",
    (f"{_CV}/rules/risk", "PUT"): "ADMIN_UPDATE_RISK",
    (f"{_CV}/rules/endings", "PUT"): "ADMIN_UPDATE_ENDINGS",
    (f"{_CV}/tools", "POST"): "ADMIN_CREATE_TOOL",
    (f"{_CV}/tools/<int:tool_id>", "PUT"): "ADMIN_UPDATE_TOOL",
    (f"{_CV}/tools/<int:tool_id>", "DELETE"): "ADMIN_DELETE_TOOL",
    (f"{_CV}/validate", "POST"): _exento(_CALCULO),
    (f"{_CV}/world", "PUT"): "ADMIN_SAVE_WORLD",
    (f"{_CV}/world-editor", "GET"): _exento(_CONTENIDO),
    (f"{_CV}/world-preview", "GET"): _exento(_CONTENIDO),
    (f"{_CV}/world/validate", "POST"): _exento(_CALCULO),
}

# S4-1 · La auditoría de cada ruta, y la compuerta de cobertura (``shared/tests/test_audit_coverage.py``) que la exige: toda
# ruta que **muta** estado (POST, PUT, PATCH, DELETE) o que **lee** lo que un ADMIN o un PROFESOR puede ver declara aquí su
# auditoría, ``{(ruta, método): código}``, o ``EXENTO: <motivo>``. El valor es el código (o la etiqueta, para los eventos
# que ya se escribían con ella: ``asignacion.crear``) que la ruta deja; varios, separados por coma, cuando una misma ruta
# puede dejar más de uno (el acceso, el ciclo de vida de un caso). Se llena el campo ``audit`` del inventario. Ante la duda
# se audita; una exención dice por qué la ruta no deja fila. Las lecturas públicas y las del ESTUDIANTE sobre su propio
# intento no se declaran (el ``audit`` va vacío). Los códigos deben existir en ``AUDIT_TAXONOMY`` y en el código.
AUDIT_BY_ROUTE: dict[tuple[str, str], str] = {
    # ── Acceso y sesión ──
    ("api/auth/login", "POST"): "LOGIN_SUCCEEDED,LOGIN_FAILED,LOGIN_LOCKED",
    ("api/auth/google", "POST"): "LOGIN_SUCCEEDED",
    ("api/auth/logout", "POST"): "LOGOUT,SESSIONS_REVOKED",
    ("api/auth/change-password", "POST"): "PASSWORD_CHANGED",
    ("api/auth/access-request", "POST"): "ACCESS_REQUEST_CREATED",
    ("api/auth/me", "GET"): _exento(_PROPIO),
    ("api/security/csp-report", "POST"): _exento(
        "informe anónimo del navegador sobre la política de contenido: no cambia datos de personas; "
        "deja una línea del registro de seguridad"
    ),
    # ── Cuentas y solicitudes de acceso (ADMIN) ──
    ("api/admin/users", "GET"): "USER_LIST_VIEWED",
    ("api/admin/users", "POST"): "USER_CREATED,PASSWORD_SET_BY_ADMIN,ACCESS_REQUEST_RESOLVED",
    ("api/admin/users/<int:user_id>", "PUT"): (
        "USER_UPDATED,USER_STATUS_CHANGED,USER_ROLE_CHANGED,PASSWORD_SET_BY_ADMIN,USER_APPROVED"
    ),
    ("api/admin/users/<int:user_id>/status", "PATCH"): "USER_STATUS_CHANGED,USER_APPROVED",
    ("api/admin/users/<int:user_id>/revoke-sessions", "POST"): "SESSIONS_REVOKED",
    ("api/admin/users/approve", "POST"): "USER_APPROVED",
    ("api/admin/access-requests", "GET"): "ACCESS_REQUEST_LIST_VIEWED",
    ("api/admin/access-requests/<int:request_id>/status", "PATCH"): "ACCESS_REQUEST_RESOLVED",
    # ── Consentimiento al aviso de contenido (ESTUDIANTE, S3-2a) ──
    ("api/simulation/cases/<int:case_version_id>/consent", "POST"): "consentimiento.aceptar",
    ("api/simulation/cases/<int:case_version_id>/consent", "DELETE"): "consentimiento.retirar",
    # ── La propia auditoría (ADMIN) ──
    ("api/admin/audit", "GET"): "AUDIT_VIEWED",
    # ── Grupos, membresías y asignaciones de casos ──
    ("api/grupos", "GET"): _exento(_GRUPOS),
    ("api/grupos", "POST"): "GROUP_CREATED",
    ("api/grupos/<int:pk>", "PUT"): "GROUP_UPDATED",
    ("api/grupos/<int:pk>", "PATCH"): "GROUP_UPDATED",
    ("api/grupos/<int:pk>", "DELETE"): "GROUP_DELETED",
    ("api/grupos/<int:pk>/casos", "GET"): _exento(_GRUPOS),
    ("api/grupos/<int:pk>/casos", "POST"): "asignacion.crear",
    ("api/grupos/<int:pk>/casos/<int:case_version_id>", "DELETE"): "asignacion.eliminar",
    ("api/grupos/<int:pk>/estudiantes", "GET"): "GROUP_STUDENTS_VIEWED",
    ("api/grupos/<int:pk>/estudiantes", "POST"): "MEMBERSHIP_INVITED",
    ("api/grupos/<int:pk>/estudiantes/<int:estudiante_id>", "DELETE"): "MEMBERSHIP_REMOVED",
    ("api/grupos/<int:pk>/estudiantes/<int:estudiante_id>/activar", "POST"): "MEMBERSHIP_ACCEPTED",
    ("api/grupos/<int:pk>/estudiantes/import", "POST"): "STUDENTS_IMPORTED",
    ("api/grupos/estudiantes/import/spec", "GET"): _exento(_ESTATICO),
    ("api/grupos/estudiantes/import/template", "GET"): _exento(_ESTATICO),
    ("api/assignments", "GET"): _exento(_GRUPOS),
    ("api/assignments", "POST"): "asignacion.crear",
    ("api/assignments/<int:assignment_id>", "PATCH"): "asignacion.actualizar",
    ("api/assignments/<int:assignment_id>", "DELETE"): "asignacion.eliminar",
    ("api/me/invitations", "GET"): _exento(_PROPIO),
    ("api/me/invitations/<int:group_id>/accept", "POST"): "MEMBERSHIP_ACCEPTED",
    ("api/me/invitations/<int:group_id>/decline", "POST"): "MEMBERSHIP_DECLINED",
    ("api/me/invitations/<int:group_id>/leave", "POST"): "MEMBERSHIP_LEFT",
    # ── Revisión docente de los intentos ──
    ("api/instructor/attempts", "GET"): _exento(_SEUDONIMO),
    ("api/instructor/attempts/recent", "GET"): _exento(_SEUDONIMO),
    ("api/instructor/attempts/<uuid:attempt_id>/trace", "GET"): "traza.leer",
    ("api/instructor/attempts/<uuid:attempt_id>/rubric-evaluation", "GET"): "traza.leer",
    ("api/instructor/attempts/<uuid:attempt_id>/rubric-evaluation", "POST"): "rubrica.evaluar",
    ("api/instructor/attempts/<uuid:attempt_id>/rubric-evaluation", "PUT"): "rubrica.evaluar",
    ("api/instructor/attempts/<uuid:attempt_id>/rubric-evaluation", "PATCH"): "rubrica.evaluar",
    ("api/instructor/attempts/<uuid:attempt_id>/replace", "POST"): "ATTEMPT_REPLACED",
    # ── Reportes y analítica ──
    ("api/reportes/dashboard", "GET"): "ANALYTICS_VIEWED",
    # E6-2 · los agregados de aprendizaje (C13): una fila por consulta buena, con {groupId, caseVersionId, suppressed} y
    # nunca ids de estudiantes ni cifras (``reportes/services.generar_analitica``).
    ("api/reportes/analiticas", "GET"): "ANALYTICS_VIEWED",
    ("api/reportes/estudiante/<int:estudiante_id>", "GET"): "REPORT_VIEWED",
    ("api/reportes/grupo/<int:grupo_id>", "GET"): "REPORT_VIEWED",
    ("api/reportes/grupo/<int:grupo_id>/export", "GET"): "REPORT_EXPORTED",
    # ── Rúbricas y competencias ──
    ("api/rubrics", "GET"): _exento(_RUBRICAS),
    ("api/rubrics", "POST"): "RUBRIC_CREATED",
    ("api/rubrics/<int:rubric_id>", "GET"): _exento(_RUBRICAS),
    ("api/rubrics/<int:rubric_id>", "PUT"): "RUBRIC_UPDATED",
    ("api/rubrics/<int:rubric_id>", "PATCH"): "RUBRIC_UPDATED",
    ("api/rubrics/<int:rubric_id>/activate", "POST"): "RUBRIC_ACTIVATED",
    ("api/rubrics/<int:rubric_id>/deactivate", "POST"): "RUBRIC_ACTIVATED",
    ("api/rubrics/<int:rubric_id>/default", "POST"): "RUBRIC_UPDATED",
    ("api/rubrics/<int:rubric_id>/duplicate", "POST"): "RUBRIC_CREATED",
    ("api/rubrics/case-versions/<int:case_version_id>", "GET"): _exento(_RUBRICAS),
    ("api/rubrics/case-versions/<int:case_version_id>", "POST"): "RUBRIC_UPDATED",
    ("api/rubrics/case-versions/<int:case_version_id>", "PUT"): "RUBRIC_UPDATED",
    ("api/competencies", "GET"): _exento(_RUBRICAS),
    ("api/competencies", "POST"): "COMPETENCY_CREATED",
    # ── La biblioteca de lugares del editor de casos (P6) ──
    ("api/biblioteca/lugares", "GET"): _exento(_CATALOGO),
    ("api/biblioteca/lugares/<str:lugar_id>", "GET"): _exento(_CATALOGO),
    # ── El juego del estudiante ──
    ("api/simulation/ai-assistant", "POST"): "AI_ASSISTANT_QUERY",
    ("api/simulation/attempts", "POST"): "ATTEMPT_STARTED",
    ("api/simulation/attempts/<uuid:attempt_id>/decisions", "POST"): "DECISION_SELECTED",
    ("api/simulation/attempts/<uuid:attempt_id>/reflections", "POST"): "REFLECTION_SAVED",
    ("api/simulation/attempts/<uuid:attempt_id>/feedback", "POST"): _exento(_ENCUESTA_PROPIA),
    ("api/simulation/attempts/<uuid:attempt_id>/safe-exit", "POST"): "SAFE_EXIT_REQUESTED",
    ("api/simulation/attempts/<uuid:attempt_id>/resume", "POST"): "ATTEMPT_RESUMED",
    ("api/simulation/attempts/<uuid:attempt_id>/enter-room", "POST"): _exento(_INTENTO_PROPIO),
    ("api/simulation/attempts/<uuid:attempt_id>/hints/next", "POST"): _exento(_INTENTO_PROPIO),
    ("api/simulation/attempts/<uuid:attempt_id>/interactions/<str:interaction_key>", "POST"): _exento(_INTENTO_PROPIO),
    ("api/simulation/attempts/<uuid:attempt_id>/npcs/<str:npc_key>", "POST"): _exento(_INTENTO_PROPIO),
    ("api/simulation/attempts/<uuid:attempt_id>/tools/use", "POST"): _exento(_INTENTO_PROPIO),
    ("api/simulation/attempts/<uuid:attempt_id>/world-state", "PATCH"): _exento(
        "posición del jugador en su propio intento: cientos de escrituras por partida sin valor probatorio; "
        "el juego jamás se frena"
    ),
    # El dueño lee lo suyo (sin fila); el ADMIN o el docente lee el de otra persona (``reporte.leer``).
    ("api/simulation/attempts/<uuid:attempt_id>/student-report", "GET"): "REPORT_VIEWED",
    ("api/simulation/cases", "GET"): _exento(_PROPIO),
    ("api/simulation/cases/<int:case_version_id>/brief", "GET"): _exento(_PROPIO),
    ("api/simulation/catalog", "GET"): _exento(_PROPIO),
    # ── Documentación de la API ──
    ("schema", "GET"): _exento(_DOCUMENTACION),
    ("swagger-ui.html", "GET"): _exento(_DOCUMENTACION),
    **{
        clave: valor
        for prefijo in ("api/authoring/cases", "api/admin/cases")
        for clave, valor in _autoria(prefijo, _AUTORIA).items()
    },
}


def _root_patterns():
    return get_resolver().url_patterns


def _iter_routes(patterns, prefix=""):
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            yield from _iter_routes(pattern.url_patterns, prefix + str(pattern.pattern))
        elif isinstance(pattern, URLPattern):
            yield prefix + str(pattern.pattern), pattern.callback


def _methods(view_class):
    """Métodos HTTP que implementa la vista. Una vista de función de Django puro admite solo GET."""
    if view_class is None:
        return ("GET",)
    return tuple(method for method in HTTP_METHODS if hasattr(view_class, method.lower()))


def _permissions_for(view_class, method, initkwargs=None):
    """La vista y los permisos que DRF le aplicaría a ``method`` (``get_permissions`` puede depender de él).

    Los ``initkwargs`` de ``as_view(...)`` (p. ej. ``permission_classes``) mandan sobre la clase, igual que en la petición real.
    """
    if view_class is None:  # vista de función de Django puro: DRF no le pone permisos
        return None, []
    view = view_class(**(initkwargs or {}))
    view.setup(RequestFactory().generic(method, "/"))
    return view, view.get_permissions()


def _admits_anonymous(permission, view):
    """¿DRF deja pasar una petición sin sesión por este permiso? Es la misma comprobación que hace DRF."""
    request = RequestFactory().get("/")
    request.user = AnonymousUser()
    return bool(permission.has_permission(request, view))


def _exposure(view, permissions):
    """``public`` si DRF deja pasar una petición anónima por todos los permisos de la vista."""
    if not permissions or all(_admits_anonymous(permission, view) for permission in permissions):
        return PUBLIC
    policy_permissions = [permission for permission in permissions if hasattr(permission, "policy")]
    if not policy_permissions:
        if all(isinstance(permission, IsAuthenticated) for permission in permissions):
            return AUTHENTICATED
        nombres = ", ".join(sorted(type(permission).__name__ for permission in permissions))
        raise ValueError(f"permiso sin clasificar en el inventario de superficie: {nombres}")
    roles = frozenset.intersection(*(frozenset(permission.roles) for permission in policy_permissions))
    if not roles:
        raise ValueError("una vista combina políticas que no tienen ningún rol en común")
    return "role:" + ",".join(sorted(role.upper() for role in roles))


def _has_own_parsers(view_class):
    """¿La vista (o una base suya, antes de ``APIView``) declara ``parser_classes`` propios?"""
    for klass in view_class.__mro__:
        if klass is APIView:
            return False
        if "parser_classes" in vars(klass):
            return True
    return False


def _body(method, view_class):
    if method in ("GET", "DELETE"):
        return "none"
    # Todas las vistas admiten multipart por el ajuste por defecto; es de importación de archivos
    # solo la que lo declara en sus propios ``parser_classes`` (hoy, la importación de grupos).
    if view_class is not None and _has_own_parsers(view_class) and any(
        issubclass(parser, MultiPartParser) for parser in view_class.parser_classes
    ):
        return "multipart-import"
    return "json-small"


def _throttle_scopes(view_class):
    """Alcances del limitador que declara la vista (``throttle_classes``), en el orden en que se evalúan; ``None`` si
    no tiene ninguno. Se leen del atributo ``scope`` de cada clase: ``shared`` no importa ``apps``."""
    if view_class is None:
        return None
    scopes = [getattr(cls, "scope", "") for cls in getattr(view_class, "throttle_classes", None) or []]
    scopes = [scope for scope in scopes if scope]
    return scopes or None


def collect_routes(patterns=None):
    """Una fila por ruta (sin barra final) y método HTTP, ordenadas por (ruta, método)."""
    rows = {}
    for raw_route, callback in _iter_routes(_root_patterns() if patterns is None else patterns):
        route = raw_route.rstrip("/")
        view_class = getattr(callback, "cls", None)
        initkwargs = getattr(callback, "initkwargs", None)
        for method in _methods(view_class):
            view, permissions = _permissions_for(view_class, method, initkwargs)
            row = {
                "route": route,
                "method": method,
                "exposure": _exposure(view, permissions),
                "body": _body(method, view_class),
                "throttle": _throttle_scopes(view_class),
                "audit": AUDIT_BY_ROUTE.get((route, method)),  # S4-1 · None: ni muta ni lee datos de otra persona
            }
            key = (route, method)
            # ``…/import`` y ``…/import/`` son una sola fila sin barra final: si difieren, es un error.
            previa = rows.get(key)
            if previa is not None and previa != row:
                raise ValueError(f"{method} {route} se clasifica de dos maneras distintas")
            rows[key] = row
    return [rows[key] for key in sorted(rows)]


def public_routes(patterns=None):
    """Las rutas (sin barra final) con alguna fila pública: lo que comparan las pruebas de rutas públicas."""
    return {row["route"] for row in collect_routes(patterns) if row["exposure"] == PUBLIC}


def render_inventory():
    """El inventario como documento determinista: es la evidencia versionada de la superficie."""
    return {"version": VERSION, "routes": collect_routes()}


def _main(argv):
    document = json.dumps(render_inventory(), ensure_ascii=False, indent=2) + "\n"
    if "--write" in argv:
        target = Path(__file__).with_name("surface-inventory.json")
        target.write_text(document, encoding="utf-8", newline="\n")
        print(f"escrito {target}")
    else:
        sys.stdout.write(document)
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
