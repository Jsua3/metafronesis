from django.urls import path
from .views import CasosView, DefinicionView, FichaView, EscenasView, EscenaView, DecisionesView, DecisionView

from .views import ChecklistView, EditorView, ExportarCasoView, ImportarCasoView, PlanoView
from .mundo_views import MundoView, MapaView, MapasView, ObjetoView, ObjetosView, PistaView, PistasView

from .dialogos_views import DialogoView, DialogosView, HerramientaView, HerramientasView, OrdenNodosView, PersonajeView, PersonajesView

from .reglas_views import AceptarView, FinalesView, HitosView, RiesgoView, RubricaView

urlpatterns = [
    path("cases/<int:case_version_id>/rules/milestones", HitosView.as_view()),
    path("cases/<int:case_version_id>/rules/risk", RiesgoView.as_view()),
    path("cases/<int:case_version_id>/rules/endings", FinalesView.as_view()),
    path("cases/<int:case_version_id>/rubric", RubricaView.as_view()),
    path("cases/<int:case_version_id>/nodes/<int:elemento_id>/accept-ai", AceptarView.as_view(), {"tipo": "nodes"}),
    path("cases/<int:case_version_id>/decisions/<int:elemento_id>/accept-ai", AceptarView.as_view(), {"tipo": "decisions"}),
    path("cases/<int:case_version_id>/dialogues/<int:elemento_id>/accept-ai", AceptarView.as_view(), {"tipo": "dialogues"}),
    path("cases/<int:case_version_id>/objects/<int:elemento_id>/accept-ai", AceptarView.as_view(), {"tipo": "objects"}),
    path("cases/<int:case_version_id>/maps/<int:map_id>/dialogues", DialogosView.as_view()),
    path("cases/<int:case_version_id>/dialogues/<int:tree_id>", DialogoView.as_view()),
    path("cases/<int:case_version_id>/tools", HerramientasView.as_view()),
    path("cases/<int:case_version_id>/tools/<int:tool_id>", HerramientaView.as_view()),
    path("cases/<int:case_version_id>/characters", PersonajesView.as_view()),
    path("cases/<int:case_version_id>/characters/<int:character_id>", PersonajeView.as_view()),
    path("cases/<int:case_version_id>/nodes/reorder", OrdenNodosView.as_view()),
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
