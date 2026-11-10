from django.urls import path
from .views import CasosView, DefinicionView, FichaView, EscenasView, EscenaView, DecisionesView, DecisionView

urlpatterns = [
    path("cases", CasosView.as_view()),
    path("cases/<int:case_version_id>/definition", DefinicionView.as_view()),
    path("cases/<int:case_version_id>/brief", FichaView.as_view()),
    path("cases/<int:case_version_id>/nodes", EscenasView.as_view()),
    path("cases/<int:case_version_id>/nodes/<int:node_id>", EscenaView.as_view()),
    path("cases/<int:case_version_id>/decisions", DecisionesView.as_view()),
    path("cases/<int:case_version_id>/decisions/<int:decision_id>", DecisionView.as_view()),
]
