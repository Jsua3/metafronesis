from apps.simulation.models.attempt import AttemptStatus
from apps.simulation.models.rubric import EvaluationOrigin
from apps.simulation.casedef.vocabulary import ResponseClass
from shared.exceptions import ApiError

from .attempt_api import owned
from .evaluacion import retroalimentacion_docente_de
from .rubricas import rubrica_activa_de


def _decision(evento):
    opcion = evento.decision_option
    nodo = evento.node or opcion.source_node
    return {
        "node": nodo.title,
        "question": nodo.decision_prompt,
        "option": opcion.text,
        "correct": opcion.response_class in (ResponseClass.RECOMMENDED, ResponseClass.ACCEPTABLE),
        "responseClass": opcion.response_class,
        "justification": {
            "feedback": opcion.feedback_text or opcion.immediate_feedback,
            "theoryBasis": opcion.theory_basis,
        },
    }


def _rubrica(intento):
    rubrica = rubrica_activa_de(intento.case_version_id)
    if rubrica is None:
        return None
    evaluacion = intento.rubric_evaluations.filter(rubric=rubrica, origin=EvaluationOrigin.SISTEMA).first()
    if evaluacion is None:
        return None
    return {
        "total": evaluacion.total_score,
        "status": evaluacion.status,
        "levels": [{"criterion": fila.rubric_criterion_id, "level": fila.level} for fila in evaluacion.criterion_scores.order_by("rubric_criterion_id")],
    }


def resultado_de(estudiante, attempt_id) -> dict:
    intento = owned(estudiante, attempt_id)
    if intento.status != AttemptStatus.COMPLETED:
        raise ApiError("ATTEMPT_NOT_FINISHED", "El intento aún no ha finalizado.", 409)
    from .revision_de_respuestas import decisiones_vigentes
    eventos = decisiones_vigentes(intento)
    evaluacion = getattr(intento, "evaluation", None)
    return {
        "attemptId": str(intento.pk),
        "status": intento.status,
        "decisions": [_decision(evento) for evento in eventos],
        "evaluation": evaluacion.snapshot if evaluacion else None,
        "rubric": _rubrica(intento),
        "teacherFeedback": retroalimentacion_docente_de(intento),
    }
