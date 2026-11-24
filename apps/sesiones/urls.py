from django.urls import path

from . import views
from .servicios import ACCIONES

urlpatterns = [
    path("sesiones", views.SesionesView.as_view()),
    path("sesiones/casos", views.CasosView.as_view()),
    path("sesiones/<int:pk>", views.SesionView.as_view()),
    path("sesiones/<int:pk>/sincronizar", views.SincronizarView.as_view()),
    path("sesiones/<int:pk>/convocados/<int:estudiante_id>", views.ConvocadoView.as_view()),
    path("sesiones/<int:pk>/convocados/<int:estudiante_id>/repeticion", views.RepeticionView.as_view()),
    *[path(f"sesiones/<int:pk>/{accion}", views.TransicionView.as_view(accion=accion)) for accion in ACCIONES],
]
