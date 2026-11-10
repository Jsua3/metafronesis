from django.urls import path

from .views_rubricas import RubricaCreateView, RubricaDetailView, RubricaVersionView

urlpatterns = [
    path("rubrics", RubricaCreateView.as_view()),
    path("rubrics/<int:rubric_id>", RubricaDetailView.as_view()),
    path("rubrics/case-versions/<int:case_version_id>", RubricaVersionView.as_view()),
]
