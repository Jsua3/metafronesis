from django.urls import path

from .views import ExportarGrupoView

urlpatterns = [path('grupo/<int:grupo_id>/export', ExportarGrupoView.as_view())]
