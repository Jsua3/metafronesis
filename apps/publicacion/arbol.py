from shared.contenido_relleno import es_relleno
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal

from django.db.models import Prefetch, Q, Sum
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
        relleno = [Problema('CONTENT_PLACEHOLDER', f'options/{self.opcion.pk}/{campo}',
                           f'Escribe {nombre}: todavía tiene texto de relleno.')
                   for campo, nombre, texto in (
                       ('text', 'la respuesta', self.opcion.text),
                       ('feedback', 'la retroalimentación', self.opcion.feedback_text),
                       ('immediateFeedback', 'la retroalimentación inmediata', self.opcion.immediate_feedback),
                   ) if es_relleno(texto)]
        if not any((texto or '').strip() for texto in (
            self.opcion.feedback_text, self.opcion.theory_basis, self.opcion.immediate_feedback,
        )):
            return relleno + [Problema('OPTION_NO_JUSTIFICATION', f'options/{self.opcion.pk}', 'La opción necesita una justificación.')]
        return relleno


@dataclass
class EscenaCompuesta(ComponenteDelCaso):
    escena: SimulationNode
    hijos: list[OpcionHoja]
    alcanzable_por_decisiones: bool = True

    def problemas(self):
        problemas = []
        lugar = f'nodes/{self.escena.pk}'
        if es_relleno(self.escena.narrative):
            problemas.append(Problema('CONTENT_PLACEHOLDER', lugar, 'Escribe la narración: todavía tiene texto de relleno.'))
        if not self.escena.terminal_node and (self.hijos or self.alcanzable_por_decisiones):
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
        elif (self.asignacion.peso_criterios_activos or Decimal('0')) != 100:
            problemas.append(Problema('RUBRIC_WEIGHTS', 'rubric', 'Los pesos de la rúbrica deben sumar 100.'))
        from apps.simulation.models.world import DialogueLine
        for linea in DialogueLine.objects.filter(dialogue_tree__scene_map__case_version=self.version).select_related('dialogue_tree__scene_map'):
            if es_relleno(linea.text):
                nodo = linea.dialogue_tree.scene_map.node_id
                problemas.append(Problema('CONTENT_PLACEHOLDER', f'nodes/{nodo}', 'Escribe el diálogo: todavía tiene texto de relleno.'))
        return problemas + [p for hijo in self.hijos for p in hijo.problemas()]


def arbol_de(version) -> CasoCompuesto:
    opciones = DecisionOption.objects.order_by('option_key', 'pk')
    escenas = SimulationNode.objects.filter(case_version=version).order_by('node_key', 'pk').prefetch_related(
        Prefetch('options', queryset=opciones))
    escenas = list(escenas)
    por_id = {escena.pk: escena for escena in escenas}
    pendientes = [escena.pk for escena in escenas if escena.start_node]
    alcanzables = set()
    while pendientes:
        escena_id = pendientes.pop()
        if escena_id in alcanzables or escena_id not in por_id:
            continue
        alcanzables.add(escena_id)
        pendientes.extend(opcion.target_node_id for opcion in por_id[escena_id].options.all())
    hijos = [EscenaCompuesta(escena, [OpcionHoja(opcion) for opcion in escena.options.all()],
                             escena.pk in alcanzables) for escena in escenas]
    asignacion = (SimulationRubricAssignment.objects.filter(case_version=version, active=True)
                  .select_related('rubric')
                  .annotate(peso_criterios_activos=Sum('rubric__criteria__weight',
                      filter=Q(rubric__criteria__active=True))).first())
    return CasoCompuesto(version, hijos, asignacion)
