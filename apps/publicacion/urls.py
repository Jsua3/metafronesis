from django.urls import path
from .views import ValidarView

urlpatterns = [path('cases/<int:case_version_id>/validate', ValidarView.as_view())]
