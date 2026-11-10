from django.urls import path

from .views import IntentosView, IntentoView, RetroalimentacionView

urlpatterns = [
    path("attempts", IntentosView.as_view()),
    path("attempts/<uuid:attempt_id>", IntentoView.as_view()),
    path("attempts/<uuid:attempt_id>/feedback", RetroalimentacionView.as_view()),
]
