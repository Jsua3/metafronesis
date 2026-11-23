"""Construcción y conservación del informe del estudiante."""

import json

from apps.simulation.casedef.vocabulary import INITIAL_PERSONA, LABELS, step_persona
from apps.simulation.models import AttemptReport, AttemptStatus, ReflectionJournal
from apps.simulation.models.attempt import RETRY_EVENT_TYPES
from apps.simulation.services import case_rules
from apps.simulation.assessment import evaluation as evaluacion_formativa
from apps.simulation.services.revision_de_respuestas import decisiones_vigentes

VERSION_INFORME = 1
MENSAJES = {
    "IN_PROGRESS": "Intento en progreso.",
    "PAUSED": "Pausa segura activa. Tu intento quedó guardado y puedes reanudarlo cuando lo decidas.",
    "COMPLETED": "Intento finalizado. Tu recorrido quedó registrado para evaluación formativa.",
    "INCOMPLETE": "Intento incompleto.",
    "REPLACED": "Intento reemplazado.",
    "SAFE_EXITED": "Salida segura registrada.",
}
RECOMENDACION_PAUSA = "Retoma el caso con acompañamiento docente cuando te sientas preparado/a."


def congelado(intento):
    return AttemptReport.objects.filter(attempt=intento).values_list("report_json", flat=True).first()


def _revision(eventos):
    resultado = []
    for orden, evento in enumerate(eventos, start=1):
        opcion = evento.decision_option
        detalle = json.loads(evento.detail or "{}")
        clase = detalle.get("response_class", opcion.response_class)
        resultado.append({
            "order": orden, "nodeId": evento.node_id, "nodeTitle": evento.node.title,
            "chosen": {"optionId": opcion.pk, "text": opcion.text},
            "consequence": opcion.consequence_text or opcion.target_node.narrative or "",
            "feedback": {"explanation": opcion.feedback_text or opcion.immediate_feedback or "",
                         "theoryBasis": opcion.theory_basis or ""},
            "class": clase, "prohibited": clase == "CONTRAINDICATED",
        })
    return resultado



def _duraciones_por_escena(eventos, cierre):
    entradas = [evento for evento in eventos if evento.node_id and evento.event_type in ("ATTEMPT_STARTED", "NODE_ENTERED")]
    fases = []
    for indice, entrada in enumerate(entradas):
        final = entradas[indice + 1].occurred_at if indice + 1 < len(entradas) else cierre
        fases.append({"nodeId": entrada.node_id, "nodeTitle": entrada.node.title,
                      "startedAt": entrada.occurred_at.isoformat(), "endedAt": final.isoformat() if final else None,
                      "durationSeconds": int((final - entrada.occurred_at).total_seconds()) if final else None})
    return fases

def construir(intento):
    eventos = list(intento.events.select_related("node").order_by("occurred_at", "id"))
    titulos = list(dict.fromkeys(evento.node.title for evento in eventos if evento.node_id and
        evento.event_type in ("ATTEMPT_STARTED", "NODE_ENTERED", "ROOM_ENTERED", "DECISION_SELECTED", "DECISION_CHANGED")))
    if intento.current_node.title not in titulos:
        titulos.append(intento.current_node.title)
    reflexiones = list(ReflectionJournal.objects.filter(attempt=intento).select_related("node").order_by("id"))
    duracion = int((intento.ended_at - intento.started_at).total_seconds()) if intento.ended_at else None
    informe = {
        "attemptId": str(intento.pk), "caseTitle": intento.case_version.simulation_case.title,
        "status": intento.status, "totalDurationSeconds": duracion,
        "phaseDurations": _duraciones_por_escena(eventos, intento.ended_at),
        "toolsUsed": sum(evento.event_type == "TOOL_USED" for evento in eventos),
        "reflectionsCount": len(reflexiones),
        "safeExitUsed": any(evento.event_type == "SAFE_EXIT_REQUESTED" for evento in eventos),
        "visitedNodeTitles": titulos,
        "recommendations": [RECOMENDACION_PAUSA] if intento.status in ("PAUSED", "SAFE_EXITED") else [],
        "summaryMessage": MENSAJES[intento.status],
    }
    if intento.status != AttemptStatus.COMPLETED:
        return informe
    decisiones = decisiones_vigentes(intento)
    evaluacion_guardada = getattr(intento, "evaluation", None)
    evaluacion = evaluacion_guardada.snapshot if evaluacion_guardada else evaluacion_formativa.build(intento)
    final = evaluacion.get("ending")
    if final:
        informe["ending"] = {**final, "reason": []}
    reglas = case_rules.rules_of(intento.case_version)
    cumplidos = intento.state_json.get("milestones", [])
    if reglas.milestones:
        informe["milestones"] = {
            "done": [{"key": hito.key, "label": hito.label, "decisive": hito.decisive} for hito in reglas.milestones if hito.key in cumplidos],
            "missing": [{"key": hito.key, "label": hito.label, "decisive": hito.decisive} for hito in reglas.milestones if hito.key not in cumplidos],
        }
        informe["recommendations"].extend(f"Revisa con tu docente: {hito.label}." for hito in reglas.milestones if hito.key not in cumplidos)
    cambios = intento.state_json.get("persona", {})
    vinculo, activacion = step_persona(*INITIAL_PERSONA, cambios.get("bond", 0), cambios.get("activation", 0))
    conteos = {clave: evaluacion.get("counts", {}).get(clave, 0)
               for clave in ("recommended", "acceptable", "risky", "contraindicated")}
    conteos.update({"retries": sum(evento.event_type in RETRY_EVENT_TYPES for evento in eventos),
                    "prohibitedRetries": sum(evento.event_type == "PROHIBITED_DECISION_RETRY_REQUIRED" for evento in eventos),
                    "toolsUsed": informe["toolsUsed"], "reflections": informe["reflectionsCount"]})
    informe.update({
        "counts": conteos,
        "schemaVersion": VERSION_INFORME,
        "persona": {"bond": vinculo.value, "activation": activacion.value,
                    "label": f"se muestra {LABELS[vinculo]} y {LABELS[activacion]}"},
        "decisionReview": _revision(decisiones),
        "reflections": [{"nodeId": registro.node_id, "nodeTitle": registro.node.title, "locked": registro.locked} for registro in reflexiones],
        "retries": sum(evento.event_type in RETRY_EVENT_TYPES for evento in eventos),
        "prohibitedRetries": sum(evento.event_type == "PROHIBITED_DECISION_RETRY_REQUIRED" for evento in eventos),
    })
    evaluacion_rubrica = intento.rubric_evaluations.filter(origin="SISTEMA").first()
    if evaluacion_rubrica:
        informe["competencyLevels"] = [
            {"code": fila.rubric_criterion.competency, "name": fila.rubric_criterion.title,
             "level": fila.level, "basis": None, "evidence": []}
            for fila in evaluacion_rubrica.criterion_scores.select_related("rubric_criterion").order_by("rubric_criterion_id")
        ]
    return informe


def congelar(intento):
    existente = congelado(intento)
    if existente is not None:
        return existente
    informe = construir(intento)
    AttemptReport.objects.create(attempt=intento, report_json=informe,
        report_schema_version=VERSION_INFORME, definition_hash=intento.case_version.definition_hash or "")
    return informe


def leer(intento):
    informe = congelado(intento)
    return informe if informe is not None else construir(intento)
