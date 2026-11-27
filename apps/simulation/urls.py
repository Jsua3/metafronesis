from django.urls import path
from . import views_s3 as views
from .views_informe import InformeEstudiante
from .views_bitacora import EstadoIntento, Reflexiones, SalidaSegura
from .views_resultado import Resultado
from .views_progreso import Revisit, Progress
from .views_consultas import Ficha, IntentoActivo, Historial
from .views_portada import ImagenPortadaView
from .views_world import Mundo, MapaProgreso, PosicionMundo, EntradaSala, Pistas, SiguientePista, Interaccion, UsoHerramienta, Personaje

urlpatterns = [
    path("covers/<uuid:cover_id>", ImagenPortadaView.as_view(), name="case-cover"),
    path("attempts/<uuid:pk>/student-report", InformeEstudiante.as_view()),
    path("attempts/<uuid:pk>/reflections", Reflexiones.as_view()),
    path("attempts/<uuid:pk>/safe-exit", SalidaSegura.as_view()),
    path("attempts/<uuid:pk>/state", EstadoIntento.as_view()),
    path("attempts/<uuid:pk>/hints", Pistas.as_view()),
    path("attempts/<uuid:pk>/hints/next", SiguientePista.as_view()),
    path("attempts/<uuid:pk>/interactions/<str:key>", Interaccion.as_view()),
    path("attempts/<uuid:pk>/tools/use", UsoHerramienta.as_view()),
    path("attempts/<uuid:pk>/npcs/<str:key>", Personaje.as_view()),
    path("attempts/<uuid:pk>/world", Mundo.as_view()),
    path("attempts/<uuid:pk>/progress-map", MapaProgreso.as_view()),
    path("attempts/<uuid:pk>/world-state", PosicionMundo.as_view()),
    path("attempts/<uuid:pk>/enter-room", EntradaSala.as_view()),
    path("catalog", views.Catalog.as_view()),
    path("attempts/<uuid:pk>/evaluation", views.Evaluation.as_view()),
    path("attempts/<uuid:pk>/revisit", Revisit.as_view()),
    path("attempts/<uuid:pk>/progress", Progress.as_view()),
    path("attempts/<uuid:pk>/result", Resultado.as_view()),
    path("cases", views.Cases.as_view()),
    path("cases/<int:case_version_id>/brief", Ficha.as_view()),
    path("cases/<int:case_version_id>/active-attempt", IntentoActivo.as_view()),
    path("cases/<int:pk>", views.CaseDetail.as_view()),
    path("attempts", views.Attempts.as_view()),
    path("attempts/history", Historial.as_view()),
    path("attempts/<uuid:pk>", views.AttemptDetail.as_view()),
    path(
        "attempts/<uuid:pk>/pause",
        views.AttemptTransition.as_view(),
        {"action": "pause"},
    ),
    path(
        "attempts/<uuid:pk>/resume",
        views.AttemptTransition.as_view(),
        {"action": "resume"},
    ),
    path(
        "attempts/<uuid:pk>/replace",
        views.AttemptTransition.as_view(),
        {"action": "replace"},
    ),
    path("attempts/<uuid:pk>/decisions", views.Decision.as_view()),
]
