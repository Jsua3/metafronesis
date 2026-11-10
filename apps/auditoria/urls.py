from django.urls import path

from .views import AuditoriaView

urlpatterns = [path("admin/audit", AuditoriaView.as_view())]
