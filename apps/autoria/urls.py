from django.urls import path
from .views import CasosView, DefinicionView, FichaView, EscenasView, EscenaView, DecisionesView, DecisionView

from .views import ChecklistView, EditorView, ExportarCasoView, ImportarCasoView, PlanoView
from .mundo_views import MundoView, MapaView, MapasView, ObjetoView, ObjetosView, PistaView, PistasView

urlpatterns = [
    path("cases/<int:case_version_id>/world", MundoView.as_view()),
    path("cases/<int:case_version_id>/maps", MapasView.as_view()),
    path("cases/<int:case_version_id>/maps/<int:map_id>", MapaView.as_view()),
    path("cases/<int:case_version_id>/maps/<int:map_id>/objects", ObjetosView.as_view()),
    path("cases/<int:case_version_id>/objects/<int:object_id>", ObjetoView.as_view()),
    path("cases/<int:case_version_id>/maps/<int:map_id>/hints", PistasView.as_view()),
    path("cases/<int:case_version_id>/hints/<int:hint_id>", PistaView.as_view()),
    path("cases/<int:case_version_id>/editor", EditorView.as_view()),
    path("cases/<int:case_version_id>/checklist", ChecklistView.as_view()),
    path("cases/<int:case_version_id>/plan", PlanoView.as_view()),
    path("cases/import", ImportarCasoView.as_view()),
    path("cases/<int:case_version_id>/export", ExportarCasoView.as_view()),
    path("cases", CasosView.as_view()),
    path("cases/<int:case_version_id>/definition", DefinicionView.as_view()),
    path("cases/<int:case_version_id>/brief", FichaView.as_view()),
    path("cases/<int:case_version_id>/nodes", EscenasView.as_view()),
    path("cases/<int:case_version_id>/nodes/<int:node_id>", EscenaView.as_view()),
    path("cases/<int:case_version_id>/decisions", DecisionesView.as_view()),
    path("cases/<int:case_version_id>/decisions/<int:decision_id>", DecisionView.as_view()),
]
