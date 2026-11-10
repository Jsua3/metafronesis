from django.http import Http404

from apps.grupos.alcance import estudiantes_de
from apps.grupos.models import Grupo, GrupoEstudiante, MembershipStatus
from apps.simulation.models import SimulationAttempt
from apps.simulation.models.attempt import REGISTERED_DECISION_EVENT_TYPES
from apps.simulation.models.rubric import EvaluationOrigin
from apps.simulation.services.evaluacion import retroalimentacion_docente_de
from apps.simulation.services.resultado import _decision, _rubrica
from shared.policies import ADMIN


def _intentos(docente):
    return SimulationAttempt.objects.filter(student_id__in=estudiantes_de(docente)).select_related("student")


def intento_de(docente, attempt_id):
    intento = _intentos(docente).filter(pk=attempt_id).first()
    if intento is None:
        raise Http404
    return intento


def _fila(intento):
    evaluacion = intento.rubric_evaluations.filter(origin=EvaluationOrigin.SISTEMA).order_by("-evaluated_at", "-pk").first()
    snapshot = getattr(intento, "evaluation", None)
    return {
        "attemptId": str(intento.pk),
        "student": {"id": intento.student_id, "name": f"{intento.student.nombre} {intento.student.apellido}".strip(), "email": intento.student.email},
        "caseVersionId": intento.case_version_id,
        "status": intento.status,
        "startedAt": intento.started_at,
        "endedAt": intento.ended_at,
        "level": snapshot.snapshot.get("level") if snapshot else None,
        "total": evaluacion.total_score if evaluacion else None,
    }


def listar(docente, case_version_id=None, grupo_id=None):
    intentos = _intentos(docente)
    if grupo_id is not None:
        grupos = Grupo.objects.filter(pk=grupo_id, activo=True)
        if docente.role != ADMIN:
            grupos = grupos.filter(profesor=docente)
        if not grupos.exists():
            raise Http404
        miembros = GrupoEstudiante.objects.filter(grupo_id=grupo_id, status=MembershipStatus.ACTIVE).values("estudiante_id")
        intentos = intentos.filter(student_id__in=miembros)
    if case_version_id is not None:
        intentos = intentos.filter(case_version_id=case_version_id)
    return [_fila(intento) for intento in intentos.order_by("-started_at", "pk")]


def detalle(docente, attempt_id):
    intento = intento_de(docente, attempt_id)
    eventos = intento.events.filter(event_type__in=REGISTERED_DECISION_EVENT_TYPES, decision_option__isnull=False).select_related("node", "decision_option__source_node")
    evaluacion = getattr(intento, "evaluation", None)
    return {
        **_fila(intento),
        "decisions": [_decision(evento) for evento in eventos],
        "evaluation": evaluacion.snapshot if evaluacion else None,
        "rubric": _rubrica(intento),
        "teacherFeedback": retroalimentacion_docente_de(intento),
    }
