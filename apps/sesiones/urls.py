from django.urls import path

from . import views

urlpatterns = [
    path("sesiones", views.SesionesView.as_view()),
    path("sesiones/casos", views.CasosView.as_view()),
    path("sesiones/<int:pk>", views.SesionView.as_view()),
    path("sesiones/<int:pk>/sincronizar", views.SincronizarView.as_view()),
    path("sesiones/<int:pk>/convocados/<int:estudiante_id>", views.ConvocadoView.as_view()),
    path("sesiones/<int:pk>/convocados/<int:estudiante_id>/repeticion", views.RepeticionView.as_view()),
    # Literales (no generadas): el contrato de rutas del cliente lee este archivo con una expresión regular.
    path("sesiones/<int:pk>/iniciar", views.TransicionView.as_view(accion="iniciar")),
    path("sesiones/<int:pk>/pausar", views.TransicionView.as_view(accion="pausar")),
    path("sesiones/<int:pk>/reanudar", views.TransicionView.as_view(accion="reanudar")),
    path("sesiones/<int:pk>/finalizar", views.TransicionView.as_view(accion="finalizar")),
    path("sesiones/<int:pk>/cancelar", views.TransicionView.as_view(accion="cancelar")),
]
