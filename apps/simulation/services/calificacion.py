"""Calificación del intento con la rúbrica del caso (Strategy).

Cada estrategia es un algoritmo intercambiable para pasar de las decisiones del intento a un nivel por criterio y a un
total ponderado. ``estrategia_para`` elige la que corresponde al estado del intento.
"""

from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

from shared.eventos import intento_calificado

from apps.simulation.models import AttemptStatus, CriterionScore, RubricEvaluation, SimulationAttempt
from apps.simulation.models.rubric import LEVEL_INDEX, EvaluationOrigin, FormativeLevel
from apps.simulation.models.vocabulary import ResponseClass
from .case_rules import competency_overrides
from .rubricas import rubrica_activa_de

#: Estados de la evaluación del sistema.
EVALUADA = "EVALUATED"
PENDIENTE = "PENDING"
PARCIAL = "PARTIAL"

#: Nivel que aporta cada clase de respuesta cuando la opción no fija uno propio.
NIVEL_POR_CLASE = {
    ResponseClass.RECOMMENDED: FormativeLevel.DESTACADO,
    ResponseClass.ACCEPTABLE: FormativeLevel.LOGRADO,
    ResponseClass.RISKY: FormativeLevel.EN_PROCESO,
    ResponseClass.CONTRAINDICATED: FormativeLevel.EN_INICIO,
}
#: Una respuesta contraindicada impide pasar de este nivel en la competencia que tocó.
TOPE_POR_CONTRAINDICADA = LEVEL_INDEX[FormativeLevel.EN_PROCESO]
_NIVEL_DE_INDICE = {indice: nivel for nivel, indice in LEVEL_INDEX.items()}


@dataclass
class Calificacion:
    total: Decimal
    niveles: dict[int, str | None]
    estado: str


def _evidencias(intento):
    """Índices aportados por competencia y competencias tocadas por una respuesta contraindicada."""
    aportes, topadas = defaultdict(list), set()
    from .revision_de_respuestas import decisiones_vigentes
    eventos = decisiones_vigentes(intento)
    for evento in eventos:
        opcion = evento.decision_option
        if opcion is None or opcion.response_class not in NIVEL_POR_CLASE:
            continue
        for codigo, nivel in competency_overrides(opcion).items():
            aportes[codigo].append(LEVEL_INDEX[nivel or NIVEL_POR_CLASE[opcion.response_class]])
            if opcion.response_class == ResponseClass.CONTRAINDICATED:
                topadas.add(codigo)
    return aportes, topadas


def _nivel(indices, topada):
    promedio = int((Decimal(sum(indices)) / len(indices)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return _NIVEL_DE_INDICE[min(promedio, TOPE_POR_CONTRAINDICADA) if topada else promedio]


def _total(niveles, criterios):
    pesos = {c.pk: c.weight for c in criterios}
    con_nivel = [(LEVEL_INDEX[nivel], pesos[pk]) for pk, nivel in niveles.items() if nivel is not None]
    suma_pesos = sum((peso for _, peso in con_nivel), Decimal(0))
    if not suma_pesos:
        return Decimal("0.00")
    total = sum((indice * peso for indice, peso in con_nivel), Decimal(0)) / suma_pesos
    return total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class EstrategiaDeCalificacion(ABC):
    """Interfaz común: de un intento y una rúbrica a una ``Calificacion``."""

    def calificar(self, intento, rubrica) -> Calificacion:
        aportes, topadas = _evidencias(intento)
        criterios = list(rubrica.criteria.filter(active=True))
        niveles = {
            c.pk: _nivel(aportes[c.competency], c.competency in topadas) if aportes.get(c.competency)
            else self.nivel_sin_evidencia()
            for c in criterios
        }
        return Calificacion(_total(niveles, criterios), niveles, self.estado(niveles))

    @abstractmethod
    def nivel_sin_evidencia(self) -> str | None:
        """Qué recibe un criterio que ninguna decisión tocó."""

    @abstractmethod
    def estado(self, niveles) -> str:
        """Estado de la evaluación resultante."""


class PorCompetenciaPonderada(EstrategiaDeCalificacion):
    """Intento completo: un criterio sin evidencia queda sin nivel y la evaluación, pendiente."""

    def nivel_sin_evidencia(self):
        return None

    def estado(self, niveles):
        return PENDIENTE if None in niveles.values() else EVALUADA


class IncompletoParcial(EstrategiaDeCalificacion):
    """Intento sin terminar (RN-11): lo no respondido cuenta como En inicio y la nota es parcial."""

    def nivel_sin_evidencia(self):
        return FormativeLevel.EN_INICIO

    def estado(self, niveles):
        return PARCIAL


class CeroParaAusentes:
    def calificar(self, intento, rubrica) -> Calificacion:
        niveles = {c.pk: FormativeLevel.EN_INICIO for c in rubrica.criteria.filter(active=True)}
        return Calificacion(Decimal("0.00"), niveles, "ABSENT")


def calificacion_de_ausente(case_version_id) -> Calificacion | None:
    rubrica = rubrica_activa_de(case_version_id)
    return CeroParaAusentes().calificar(None, rubrica) if rubrica else None


def estrategia_para(intento) -> EstrategiaDeCalificacion:
    """Elige el algoritmo según el estado del intento."""
    return PorCompetenciaPonderada() if intento.status == AttemptStatus.COMPLETED else IncompletoParcial()


@transaction.atomic
def calificar_y_guardar(intento) -> RubricEvaluation | None:
    """Crea una sola vez la evaluación del sistema del intento; ``None`` si el caso no tiene rúbrica."""
    intento = SimulationAttempt.objects.select_for_update().get(pk=intento.pk)
    rubrica = rubrica_activa_de(intento.case_version_id)
    if rubrica is None:
        return None
    existente = RubricEvaluation.objects.filter(attempt=intento, rubric=rubrica, origin=EvaluationOrigin.SISTEMA).first()
    if existente:
        return existente
    resultado = estrategia_para(intento).calificar(intento, rubrica)
    evaluacion = RubricEvaluation.objects.create(
        attempt=intento, rubric=rubrica, origin=EvaluationOrigin.SISTEMA,
        total_score=resultado.total, status=resultado.estado,
    )
    CriterionScore.objects.bulk_create([
        CriterionScore(rubric_evaluation=evaluacion, rubric_criterion_id=criterio, level=nivel,
                       score=LEVEL_INDEX.get(nivel, 0))
        for criterio, nivel in resultado.niveles.items()
    ])
    intento_calificado.send(sender=SimulationAttempt, intento=intento, evaluacion=evaluacion)
    return evaluacion
