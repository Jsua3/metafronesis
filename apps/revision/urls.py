from django.urls import path

from .views import IntentosView, IntentoView, RetroalimentacionView, IntentosRecientesView, TrazaView, ValoracionRubricaView, ReemplazarIntentoView

urlpatterns = [
    path("attempts", IntentosView.as_view()),
    path("attempts/recent", IntentosRecientesView.as_view()),
    path("attempts/<uuid:attempt_id>", IntentoView.as_view()),
    path("attempts/<uuid:attempt_id>/feedback", RetroalimentacionView.as_view()),
    path("attempts/<uuid:attempt_id>/replace", ReemplazarIntentoView.as_view()),
    path("attempts/<uuid:attempt_id>/trace", TrazaView.as_view()),
    path("attempts/<uuid:attempt_id>/rubric-evaluation", ValoracionRubricaView.as_view()),
]
