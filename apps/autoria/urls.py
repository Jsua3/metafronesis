from django.urls import path
from .views import CasosView, DefinicionView, FichaView

urlpatterns = [
    path("cases", CasosView.as_view()),
    path("cases/<int:case_version_id>/definition", DefinicionView.as_view()),
    path("cases/<int:case_version_id>/brief", FichaView.as_view()),
]
