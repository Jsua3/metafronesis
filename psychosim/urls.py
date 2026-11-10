"""Root URL dispatcher. App includes are added as each module is implemented."""
from functools import update_wrapper

from django.conf import settings
from django.http import Http404
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.grupos.views import (
    AssignmentDetailView,
    AssignmentListCreateView,
    GrupoCasoDetailView,
    GrupoCasosView,
    GrupoDetailView,
    GrupoEstudianteActivarView,
    GrupoEstudianteDetailView,
    GrupoEstudiantesImportView,
    GrupoEstudiantesImportSpecView,
    GrupoEstudiantesImportTemplateView,
    GrupoEstudiantesView,
    GrupoListCreateView,
    MeInvitationAcceptView,
    MeInvitationDeclineView,
    MeInvitationLeaveView,
    MeInvitationsView,
)
from apps.security.csp_report import CspReportView
from apps.users.views import (
    AdminAccessRequestListView,
    AdminAccessRequestStatusView,
    AdminUserApproveView,
    AdminUserDetailView,
    AdminUserListCreateView,
    AdminUserRevokeSessionsView,
    AdminUserStatusView,
    LogoutView,
)
from apps.users.authentication import SiepJWTAuthentication
from apps.users.views_autoria import PermisoDeAutoriaView
from shared.health import health
from shared.permissions import policy_permission

# S2-4 · el HTML del SPA lo sirve SIEMPRE esta vista (shared/spa.py), con el nonce de la petición.
from shared.spa import spa_index


def _docs_gate(view):
    """Compuerta del esquema OpenAPI y su visor (S2-5, RNF-002).

    Con ``SIEP_EXPOSE_API_DOCS`` apagada responde 404 antes de mirar credenciales: no se revela que la ruta existe.
    La bandera se lee en cada petición, no al importar. Encendida, delega en la vista, que exige sesión y rol ADMIN.
    ``update_wrapper`` conserva ``cls`` e ``initkwargs``: el inventario de superficie los lee.
    """

    def gated(request, *args, **kwargs):
        if not settings.SIEP_EXPOSE_API_DOCS:
            raise Http404
        return view(request, *args, **kwargs)

    return update_wrapper(gated, view)


urlpatterns = [
    # C11: salud del servicio (pública, sin autenticación, sin datos internos).
    path("api/health", health),
    # S2-3a · informe de violaciones de la CSP (RNF-002): anónimo y limitado por IP; responde 204 sin cuerpo.
    path("api/security/csp-report", CspReportView.as_view()),
    path("api/auth/", include("apps.users.urls")),
    # S1-4 · cerrar la propia sesión: cualquier persona autenticada, también con el cambio de contraseña pendiente.
    path("api/auth/logout", LogoutView.as_view()),
    path("api/grupos", GrupoListCreateView.as_view()),
    path("api/grupos/<int:pk>", GrupoDetailView.as_view()),
    path("api/grupos/<int:pk>/estudiantes", GrupoEstudiantesView.as_view()),
    path("api/grupos/<int:pk>/estudiantes/<int:estudiante_id>", GrupoEstudianteDetailView.as_view()),
    path("api/grupos/<int:pk>/estudiantes/<int:estudiante_id>/activar", GrupoEstudianteActivarView.as_view()),
    # C5 · invitaciones del estudiante a grupos (E2-10).
    path("api/me/invitations", MeInvitationsView.as_view()),
    path("api/me/invitations/<int:group_id>/accept", MeInvitationAcceptView.as_view()),
    path("api/me/invitations/<int:group_id>/decline", MeInvitationDeclineView.as_view()),
    path("api/me/invitations/<int:group_id>/leave", MeInvitationLeaveView.as_view()),
    path("api/grupos/<int:pk>/estudiantes/import", GrupoEstudiantesImportView.as_view()),
    path("api/grupos/<int:pk>/estudiantes/import/", GrupoEstudiantesImportView.as_view()),
    path("api/grupos/estudiantes/import/spec", GrupoEstudiantesImportSpecView.as_view()),
    path("api/grupos/estudiantes/import/spec/", GrupoEstudiantesImportSpecView.as_view()),
    path("api/grupos/estudiantes/import/template", GrupoEstudiantesImportTemplateView.as_view()),
    path("api/grupos/estudiantes/import/template/", GrupoEstudiantesImportTemplateView.as_view()),
    path("api/grupos/<int:pk>/casos", GrupoCasosView.as_view()),
    path("api/grupos/<int:pk>/casos/<int:case_version_id>", GrupoCasoDetailView.as_view()),
    # C7 · asignaciones de casos con ventana (E3-1); las rutas de arriba son su alias heredado.
    path("api/assignments", AssignmentListCreateView.as_view()),
    path("api/assignments/<int:assignment_id>", AssignmentDetailView.as_view()),
    path("api/simulation/", include("apps.simulation.urls")),
    # S3-2 · C12: el consentimiento al aviso de contenido vive en ``apps/privacy`` y cuelga del mismo prefijo del simulador
    # (``/api/simulation/cases/<id>/consent``); sus rutas no chocan con las de arriba.
    path("api/simulation/", include("apps.privacy.urls")),
    # ED-9 (por defecto): ``/api/authoring/**`` es el espacio canónico de la autoría y
    # ``/api/admin/cases/**`` queda como alias del mismo urlconf hasta que el visual migre.
    # P6 · la biblioteca de lugares del editor de casos (solo quien autora).
    path("api/biblioteca/", include("apps.biblioteca.urls")),

    # Ola 1 · rubricas
    path("api/", include("apps.simulation.urls_rubricas")),

    # Ola 1 · autoria
    path("api/authoring/", include("apps.autoria.urls")),

    # Ola 1 · publicacion
    path("api/authoring/", include("apps.publicacion.urls")),

    # Ola 1 · reportes
    path("api/reportes/", include("apps.reportes.urls")),

    # Ola 1 · revision
    path("api/instructor/", include("apps.revision.urls")),

    # Ola 2 · notificaciones

    # Ola 2 · ia

    # Ola 2 · auditoria

    # Ola 2 · sesiones

    path("api/admin/users", AdminUserListCreateView.as_view()),
    path("api/admin/users/approve", AdminUserApproveView.as_view()),
    path("api/admin/users/<int:user_id>", AdminUserDetailView.as_view()),
    path("api/admin/users/<int:user_id>/status", AdminUserStatusView.as_view()),
    path("api/admin/users/<int:user_id>/authoring-permission", PermisoDeAutoriaView.as_view()),
    path("api/admin/users/<int:user_id>/revoke-sessions", AdminUserRevokeSessionsView.as_view()),
    path("api/admin/access-requests", AdminAccessRequestListView.as_view()),
    path("api/admin/access-requests/<int:request_id>/status", AdminAccessRequestStatusView.as_view()),
    # E3-9 · catálogo de competencias (RQ-NEG-002): el personal lo lee, el ADMIN lo amplía.
    # S2-5 · esquema OpenAPI y su visor: cerrados. Apagada la bandera, 404; encendida, sesión JWT y rol ADMIN.
    path(
        "schema/",
        _docs_gate(SpectacularAPIView.as_view(
            permission_classes=[policy_permission("user", "manage")],
            authentication_classes=[SiepJWTAuthentication],
        )),
        name="schema",
    ),
    path(
        "swagger-ui.html",
        _docs_gate(SpectacularSwaggerView.as_view(
            url_name="schema",
            permission_classes=[policy_permission("user", "manage")],
            authentication_classes=[SiepJWTAuthentication],
        )),
    ),
    # Catch-all del SPA (debe ir al final): cualquier ruta que no sea API,
    # schema o swagger devuelve el index.html de Angular.
    re_path(r"^(?!api/|schema/|swagger-ui|django-static/).*$", spa_index),
]
