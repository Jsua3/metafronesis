from django.urls import path

from .views import ExportarGrupoView, ExportarSesionView

urlpatterns = [
    path('grupo/<int:grupo_id>/export', ExportarGrupoView.as_view()),
    path('sesion/<int:sesion_id>/export', ExportarSesionView.as_view()),
]
