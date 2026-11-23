from django.urls import path

from .views import DashboardView, ExportarGrupoView, ExportarSesionView, ReporteEstudianteView, ReporteGrupoView

urlpatterns = [
    path('dashboard', DashboardView.as_view()),
    path('grupo/<int:grupo_id>', ReporteGrupoView.as_view()),
    path('estudiante/<int:estudiante_id>', ReporteEstudianteView.as_view()),
    path('grupo/<int:grupo_id>/export', ExportarGrupoView.as_view()),
    path('sesion/<int:sesion_id>/export', ExportarSesionView.as_view()),
]
