import json

from apps.simulation.assessment.evaluation import read_snapshot
from apps.simulation.models import AttemptStatus
from apps.simulation.models.attempt import REGISTERED_DECISION_EVENT_TYPES
from apps.simulation.models.rubric import EvaluationOrigin
from apps.simulation.services.case_rules import competency_overrides, rules_of
from shared.identity import IdentityPresenter

from . import consultas, valoracion


def _fecha(valor):
    return valor.isoformat() if valor else None


def _estado(intento):
    if intento.rubric_evaluations.filter(origin=EvaluationOrigin.DOCENTE, status="EVALUATED").exists():
        return "APLICADA"
    if intento.status == AttemptStatus.COMPLETED and valoracion.rubrica_para_revision(intento.case_version_id):
        return "PENDIENTE"
    return "NO_APLICA"


def recientes(docente, case_version_id=None, grupo_id=None):
    intentos = consultas.intentos_filtrados(docente, case_version_id, grupo_id).filter(case_version__simulation_case__active=True).select_related("case_version__simulation_case").order_by("-started_at", "-pk")[:20]
    return [{"attemptId": str(intento.pk), "studentAlias": IdentityPresenter.alias_for(intento.student_id, docente), "caseTitle": intento.case_version.simulation_case.title, "status": intento.status, "startedAt": _fecha(intento.started_at), "caseVersionId": intento.case_version_id, "endedAt": _fecha(intento.ended_at), "evaluationStatus": _estado(intento)} for intento in intentos]


def traza(intento, docente):
    eventos = list(intento.events.select_related("node", "decision_option").order_by("occurred_at", "pk"))
    conteos = {nombre: 0 for nombre in ("recommended", "acceptable", "risky", "contraindicated")}
    eventos_salida = []
    linea = []
    visitados = []
    evidencia = {}
    rubrica = valoracion.rubrica_para_revision(intento.case_version_id)
    criterios = valoracion._criterios(rubrica) if rubrica else []
    for criterio in criterios:
        codigo = criterio.competency_ref.code if criterio.competency_ref_id else criterio.competency
        evidencia.setdefault(codigo, {"code": codigo, "name": criterio.competency_ref.name if criterio.competency_ref_id else codigo, "items": []})
    orden = 0
    for evento in eventos:
        opcion = evento.decision_option
        clase = opcion.response_class if opcion else None
        titulo = evento.node.title if evento.node_id else None
        segundos = int((evento.occurred_at - intento.started_at).total_seconds()) if evento.occurred_at and intento.started_at else None
        eventos_salida.append({"type": evento.event_type, "class": clase, "nodeTitle": titulo, "decisionText": opcion.text if opcion else None, "detail": evento.detail, "occurredAt": _fecha(evento.occurred_at)})
        if titulo and titulo not in visitados:
            visitados.append(titulo)
        if opcion and evento.event_type in REGISTERED_DECISION_EVENT_TYPES:
            orden += 1
            if clase and clase.lower() in conteos:
                conteos[clase.lower()] += 1
            try:
                detalle = json.loads(evento.detail or "{}")
            except (ValueError, TypeError):
                detalle = {}
            efectos = detalle.get("effects", {}) if isinstance(detalle, dict) else {}
            competencias = efectos.get("competencies", {}) if isinstance(efectos, dict) else {}
            if not competencias:
                competencias = competency_overrides(opcion)
            for codigo in competencias:
                if codigo in evidencia:
                    evidencia[codigo]["items"].append({"order": orden, "nodeTitle": titulo or "", "optionText": opcion.text, "class": clase, "atSeconds": segundos})
            linea.append({"atSeconds": segundos, "time": _fecha(evento.occurred_at), "type": evento.event_type, "class": clase, "prohibited": clase == "CONTRAINDICATED", "label": opcion.text})
    evaluaciones = list(intento.rubric_evaluations.select_related("rubric").order_by("-evaluated_at"))
    def resumen(evaluacion):
        puntuaciones = {puntaje.rubric_criterion_id: puntaje for puntaje in evaluacion.criterion_scores.all()}
        return {"id": evaluacion.pk, "rubricName": evaluacion.rubric.name, "origin": evaluacion.origin, "overallLevel": valoracion.nivel_global(valoracion._criterios(evaluacion.rubric), puntuaciones), "comment": evaluacion.comment, "evaluatedAt": _fecha(evaluacion.evaluated_at)}
    docentes = [evaluacion for evaluacion in evaluaciones if evaluacion.origin == EvaluationOrigin.DOCENTE]
    sistema = next((evaluacion for evaluacion in evaluaciones if evaluacion.origin == EvaluationOrigin.SISTEMA), None)
    sistema_visible = {**resumen(sistema), "competencyLevels": []} if sistema and any(evaluacion.status == "EVALUATED" for evaluacion in docentes) else None
    instantanea = getattr(intento, "evaluation", None)
    datos_cierre = read_snapshot(intento, instantanea) if instantanea else {}
    final = datos_cierre.get("ending")
    if final is not None:
        final = {**final, "reason": final.get("reason", [])}
    cumplidos = set(intento.state_json.get("milestones", []))
    hitos = {"done": [], "missing": []}
    for hito in rules_of(intento.case_version).milestones:
        destino = "done" if hito.key in cumplidos else "missing"
        hitos[destino].append({"key": hito.key, "label": hito.label, "decisive": hito.decisive})
    duracion = int(((intento.ended_at or (eventos[-1].occurred_at if eventos else intento.started_at)) - intento.started_at).total_seconds()) if intento.started_at and (intento.ended_at or eventos) else None
    return {"attemptId": str(intento.pk), "studentAlias": IdentityPresenter.alias_for(intento.student_id, docente), "caseTitle": intento.case_version.simulation_case.title, "caseVersionId": intento.case_version_id, "status": intento.status, "startedAt": _fecha(intento.started_at), "endedAt": _fecha(intento.ended_at), "counts": conteos, "milestones": hitos, "personaPorEscena": [], "ending": final, "retries": sum(evento.event_type in ("DECISION_RETRY_REQUIRED", "PROHIBITED_DECISION_RETRY_REQUIRED") for evento in eventos), "prohibitedRetries": sum(evento.event_type == "PROHIBITED_DECISION_RETRY_REQUIRED" for evento in eventos), "safeExitUsed": any(evento.event_type == "SAFE_EXIT_REQUESTED" for evento in eventos), "totalDurationSeconds": duracion, "activeSeconds": round(intento.active_seconds), "timeline": linea, "visitedNodeTitles": visitados, "events": eventos_salida, "world": None, "reflections": [], "rubricEvaluations": [resumen(evaluacion) for evaluacion in docentes], "systemEvaluation": sistema_visible, "systemEvaluationAvailable": sistema is not None, "competenciesDeclared": any(competency_overrides(opcion) for opcion in intento.case_version.decisions.all()), "evidenceByCompetency": list(evidencia.values())}
