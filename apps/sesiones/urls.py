from django.urls import path
from . import views

urlpatterns = [
    path("sesiones", views.SesionesView.as_view()),
    path("sesiones/<int:pk>", views.SesionView.as_view()),
    path("sesiones/<int:pk>/convocados", views.ConvocadosView.as_view()),
    path("sesiones/<int:pk>/convocados/<int:estudiante_id>", views.ConvocadoView.as_view()),
    path("sesiones/<int:pk>/iniciar", views.IniciarView.as_view()),
    path("sesiones/<int:pk>/finalizar", views.FinalizarView.as_view()),
]
