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

import importlib  # noqa: E402

from django.apps import apps as django_apps  # noqa: E402
from django.contrib.auth.models import AnonymousUser  # noqa: E402
from django.core.exceptions import ImproperlyConfigured  # noqa: E402
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
    "api/auth/code-login": "entrar con c?digo de convocatoria",
    "api/auth/google": "entrar con una cuenta de Google",
    "api/auth/google/config": "configuración pública del acceso con Google",
    "api/auth/access-request": "pedir una cuenta, que aprueba el ADMIN",
    "api/security/csp-report": "informe anónimo y limitado de violaciones de la política de contenido (CSP)",
    "^(?!api/|schema/|swagger-ui|django-static/).*$": "comodín que sirve la SPA de Angular",
}

#: Prefijo de una exención en ``AUDIT_BY_ROUTE``: ``EXENTO: <motivo>``.
EXENTO = "EXENTO: "

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
_PROPIO = "lectura de lo propio o de un catálogo común a todos los roles: no son datos de otra persona"
_GRUPOS = "grupos y asignaciones de casos: nombres, códigos y conteos, sin datos de personas"
_CATALOGO = "catálogo de lugares, salas y objetos de la biblioteca (archivos del servidor): no son datos de personas"
_ESTATICO = "plantilla o especificación estática: no lee datos de nadie"
_DOCUMENTACION = "documentación de la API: cerrada al ADMIN y apagada por defecto, sin datos de personas"


def _exento(motivo):
    return EXENTO + motivo


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
    # ── Reportes y analítica ──
    # E6-2 · los agregados de aprendizaje (C13): una fila por consulta buena, con {groupId, caseVersionId, suppressed} y
    # nunca ids de estudiantes ni cifras (``reportes/services.generar_analitica``).
    # ── La biblioteca de lugares del editor de casos (P6) ──
    ("api/biblioteca/lugares", "GET"): _exento(_CATALOGO),
    ("api/biblioteca/lugares/<str:lugar_id>", "GET"): _exento(_CATALOGO),
    # ── El juego del estudiante ──
    ("api/simulation/attempts", "POST"): "ATTEMPT_STARTED",
    # El dueño lee lo suyo (sin fila); el ADMIN o el docente lee el de otra persona (``reporte.leer``).
    ("api/simulation/cases", "GET"): _exento(_PROPIO),
    ("api/simulation/catalog", "GET"): _exento(_PROPIO),
    # ── Documentación de la API ──
    ("schema", "GET"): _exento(_DOCUMENTACION),
    ("swagger-ui.html", "GET"): _exento(_DOCUMENTACION),
}

#: Nombre del módulo y de la variable con que cada app declara la auditoría de sus rutas.
_MODULO_DE_SUPERFICIE = "superficie"
_DECLARACIONES_DE_APP = "AUDITORIA_POR_RUTA"


def _declaraciones_de_apps():
    """Las ``AUDITORIA_POR_RUTA`` de las apps instaladas que tienen ``superficie.py``."""
    for config in django_apps.get_app_configs():
        nombre = f"{config.name}.{_MODULO_DE_SUPERFICIE}"
        try:
            modulo = importlib.import_module(nombre)
        except ModuleNotFoundError as error:
            if error.name != nombre:
                raise
            continue
        yield nombre, getattr(modulo, _DECLARACIONES_DE_APP, {})


def auditoria_por_ruta():
    """``AUDIT_BY_ROUTE`` más lo que declara cada app; una ruta declarada dos veces es un error de configuración."""
    combinada = dict(AUDIT_BY_ROUTE)
    for origen, declaraciones in _declaraciones_de_apps():
        repetidas = combinada.keys() & declaraciones.keys()
        if repetidas:
            raise ImproperlyConfigured(f"{origen} vuelve a declarar la auditoría de {sorted(repetidas)}")
        combinada.update(declaraciones)
    return combinada


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
    auditoria = auditoria_por_ruta()
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
                "audit": auditoria.get((route, method)),  # S4-1 · None: ni muta ni lee datos de otra persona
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
