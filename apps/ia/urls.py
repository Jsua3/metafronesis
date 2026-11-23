from django.urls import path
from .views import ConsultaView, EstadoView, GuiaView, PropuestaView
from .views_generaciones import (
    CrearGeneracionView,
    DetalleGeneracionView,
    EnsamblarGeneracionView,
    EscenaGeneracionView,
    EsqueletoGeneracionView,
    EstadoGeneracionView,
)

urlpatterns = [
    path("authoring/generations/status", EstadoGeneracionView.as_view()),
    path("authoring/generations", CrearGeneracionView.as_view()),
    path("authoring/generations/<uuid:gen_id>", DetalleGeneracionView.as_view()),
    path("authoring/generations/<uuid:gen_id>/skeleton", EsqueletoGeneracionView.as_view()),
    path("authoring/generations/<uuid:gen_id>/scenes/<slug:clave>", EscenaGeneracionView.as_view()),
    path("authoring/generations/<uuid:gen_id>/assemble", EnsamblarGeneracionView.as_view()),
    path("simulation/ai-assistant", ConsultaView.as_view()),
    path("authoring/cases/<int:case_version_id>/assistant/status", EstadoView.as_view()),
    path("authoring/cases/<int:case_version_id>/assistant/propose", PropuestaView.as_view()),
    path("authoring/cases/<int:case_version_id>/assistant/guide", GuiaView.as_view()),
]
