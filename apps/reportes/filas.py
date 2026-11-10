from dataclasses import dataclass

from django.db.models import Count, Prefetch, Q
from django.db.models.functions import Coalesce

from apps.grupos.models import GrupoEstudiante, MembershipStatus
from apps.simulation.models import EvaluationOrigin, RubricEvaluation, SimulationAttempt
from apps.simulation.models.attempt import REGISTERED_DECISION_EVENT_TYPES


@dataclass
class FilaDeReporte:
    estudiante: str
    correo: str
    estado: str
    nivel: str | None
    total: str | None
    avance: int
    retroalimentacion: str | None


def _fila(persona, intento):
    nombre = f'{persona.nombre} {persona.apellido}'.strip()
    if intento is None:
        return FilaDeReporte(nombre, persona.email, 'SIN_INTENTO', None, None, 0, None)
    evaluaciones = intento.rubric_evaluations.all()
    sistema = next((e for e in evaluaciones if e.origin == EvaluationOrigin.SISTEMA), None)
    docente = next((e for e in evaluaciones if e.origin == EvaluationOrigin.DOCENTE), None)
    niveles = [p.level for p in sistema.criterion_scores.all() if p.level] if sistema else []
    return FilaDeReporte(
        nombre, persona.email, intento.status, ', '.join(niveles) or None,
        str(sistema.total_score) if sistema else None, intento.avance,
        docente.comment if docente else None,
    )


def filas_de(grupo, case_version) -> list[FilaDeReporte]:
    miembros = list(GrupoEstudiante.objects.filter(
        grupo=grupo, status=MembershipStatus.ACTIVE,
    ).select_related('estudiante').order_by('estudiante__apellido', 'estudiante__nombre', 'estudiante_id'))
    evaluaciones = RubricEvaluation.objects.prefetch_related('criterion_scores').order_by(
        Coalesce('updated_at', 'evaluated_at').desc(), '-id',
    )
    intentos = SimulationAttempt.objects.filter(
        case_version=case_version, student_id__in=[m.estudiante_id for m in miembros],
    ).annotate(avance=Count('events', filter=Q(events__event_type__in=REGISTERED_DECISION_EVENT_TYPES)))
    intentos = intentos.prefetch_related(Prefetch('rubric_evaluations', queryset=evaluaciones)).order_by('-started_at', '-id')
    ultimos = {}
    for intento in intentos:
        ultimos.setdefault(intento.student_id, intento)
    return [_fila(m.estudiante, ultimos.get(m.estudiante_id)) for m in miembros]
