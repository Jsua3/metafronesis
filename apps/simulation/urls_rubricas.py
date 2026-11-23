from django.urls import path

from .views_rubricas import (
    CompetenciasView, RubricaActivarView, RubricaCreateView, RubricaDesactivarView,
    RubricaDetailView, RubricaDuplicarView, RubricaPredeterminadaView, RubricaVersionView,
)

urlpatterns = [
    path("competencies", CompetenciasView.as_view()),
    path("rubrics", RubricaCreateView.as_view()),
    path("rubrics/", RubricaCreateView.as_view()),
    path("rubrics/<int:rubric_id>", RubricaDetailView.as_view()),
    path("rubrics/<int:rubric_id>/activate", RubricaActivarView.as_view()),
    path("rubrics/<int:rubric_id>/deactivate", RubricaDesactivarView.as_view()),
    path("rubrics/<int:rubric_id>/duplicate", RubricaDuplicarView.as_view()),
    path("rubrics/<int:rubric_id>/default", RubricaPredeterminadaView.as_view()),
    path("rubrics/case-versions/<int:case_version_id>", RubricaVersionView.as_view()),
]
