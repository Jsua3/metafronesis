from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal

from django.db.models import Prefetch
from apps.simulation.models import DecisionOption, SimulationNode, SimulationRubricAssignment
from apps.simulation.models.vocabulary import ResponseClass


@dataclass(frozen=True)
class Problema:
    code: str
    where: str
    message: str


class ComponenteDelCaso(ABC):
    @abstractmethod
    def problemas(self) -> list[Problema]:
        pass


@dataclass
class OpcionHoja(ComponenteDelCaso):
    opcion: DecisionOption

    def problemas(self):
        if not (self.opcion.feedback_text or '').strip() and not (self.opcion.theory_basis or '').strip():
            return [Problema('OPTION_NO_JUSTIFICATION', f'options/{self.opcion.pk}', 'La opción necesita una justificación.')]
        return []


@dataclass
class EscenaCompuesta(ComponenteDelCaso):
    escena: SimulationNode
    hijos: list[OpcionHoja]

    def problemas(self):
        problemas = []
        lugar = f'nodes/{self.escena.pk}'
        if not self.escena.terminal_node:
            if not (self.escena.decision_prompt or '').strip():
                problemas.append(Problema('NODE_NO_QUESTION', lugar, 'La escena necesita una pregunta.'))
            if len(self.hijos) < 2:
                problemas.append(Problema('NODE_FEW_OPTIONS', lugar, 'La escena necesita al menos dos opciones.'))
            if not any(h.opcion.response_class == ResponseClass.RECOMMENDED for h in self.hijos):
                problemas.append(Problema('NODE_NO_RECOMMENDED', lugar, 'La escena necesita una opción recomendada.'))
        return problemas + [p for hijo in self.hijos for p in hijo.problemas()]


@dataclass
class CasoCompuesto(ComponenteDelCaso):
    version: object
    hijos: list[EscenaCompuesta]
    asignacion: object | None

    def problemas(self):
        problemas = []
        inicios = sum(h.escena.start_node for h in self.hijos)
        if inicios == 0:
            problemas.append(Problema('CASE_NO_START', 'case', 'El caso necesita una escena inicial.'))
        elif inicios > 1:
            problemas.append(Problema('CASE_MULTIPLE_START', 'case', 'El caso debe tener una sola escena inicial.'))
        if not any(h.escena.terminal_node for h in self.hijos):
            problemas.append(Problema('CASE_NO_TERMINAL', 'case', 'El caso necesita una escena terminal.'))
        if not self.version.estimated_minutes or self.version.estimated_minutes <= 0:
            problemas.append(Problema('CASE_NO_TIME', 'case', 'El caso necesita un tiempo estimado positivo.'))
        if self.asignacion is None:
            problemas.append(Problema('CASE_NO_RUBRIC', 'case', 'El caso necesita una rúbrica activa.'))
        elif sum((c.weight for c in self.asignacion.rubric.criteria.all() if c.active), Decimal('0')) != 100:
            problemas.append(Problema('RUBRIC_WEIGHTS', 'rubric', 'Los pesos de la rúbrica deben sumar 100.'))
        return problemas + [p for hijo in self.hijos for p in hijo.problemas()]


def arbol_de(version) -> CasoCompuesto:
    opciones = DecisionOption.objects.order_by('option_key', 'pk')
    escenas = SimulationNode.objects.filter(case_version=version).order_by('node_key', 'pk').prefetch_related(
        Prefetch('options', queryset=opciones))
    hijos = [EscenaCompuesta(escena, [OpcionHoja(o) for o in escena.options.all()]) for escena in escenas]
    asignacion = (SimulationRubricAssignment.objects.filter(case_version=version, active=True)
                  .select_related('rubric').prefetch_related('rubric__criteria').first())
    return CasoCompuesto(version, hijos, asignacion)
