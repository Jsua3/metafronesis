from django.urls import path
from .views import ConsultaView, EstadoView, GuiaView, PropuestaView

urlpatterns = [
    path("simulation/ai-assistant", ConsultaView.as_view()),
    path("authoring/cases/<int:case_version_id>/assistant/status", EstadoView.as_view()),
    path("authoring/cases/<int:case_version_id>/assistant/propose", PropuestaView.as_view()),
    path("authoring/cases/<int:case_version_id>/assistant/guide", GuiaView.as_view()),
]
