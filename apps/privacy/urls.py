from django.urls import path

from .views import ConsentView

# Montado en "api/simulation/" (junto a las rutas del simulador): /api/simulation/cases/<id>/consent.
urlpatterns = [
    path("cases/<int:case_version_id>/consent", ConsentView.as_view()),
]
