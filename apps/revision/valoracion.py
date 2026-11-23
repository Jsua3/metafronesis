import json
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone
from rest_framework import status

from apps.simulation.models import CriterionScore, Rubric, RubricEvaluation, SimulationAttempt, SimulationRubricAssignment
from apps.simulation.models.rubric import EvaluationOrigin, LEVEL_INDEX
from apps.simulation.services.gestion_rubricas import descriptores
from shared.exceptions import ApiError

PESO_TOTAL = Decimal("100")

NIVELES = [
    {"value": "EN_INICIO", "label": "En inicio", "descriptor": "Muestra los primeros acercamientos al criterio; necesita acompañamiento para sostenerlo."},
    {"value": "EN_PROCESO", "label": "En proceso", "descriptor": "Aplica el criterio de forma parcial: acierta en algunos momentos y se le escapan otros."},
    {"value": "LOGRADO", "label": "Logrado", "descriptor": "Aplica el criterio con solidez y justifica lo que decide."},
    {"value": "DESTACADO", "label": "Destacado", "descriptor": "Aplica el criterio con criterio propio y anticipa lo que la situación pide."},
]


def rubrica_para_revision(case_version_id):
    asignacion = SimulationRubricAssignment.objects.filter(case_version_id=case_version_id, active=True).select_related("rubric").first()
    propia = Rubric.objects.filter(case_version_id=case_version_id, active=True).order_by("pk").first()
    if asignacion and not (propia and asignacion.rubric.is_default):
        return asignacion.rubric
    return propia or Rubric.objects.filter(is_default=True, active=True).order_by("pk").first()


def _rubrica(intento):
    rubrica = rubrica_para_revision(intento.case_version_id)
    if rubrica is None:
        raise ApiError("RUBRIC_MISSING", "El intento no tiene una rúbrica activa.", status.HTTP_409_CONFLICT)
    return rubrica


def _criterios(rubrica):
    return list(rubrica.criteria.filter(active=True).select_related("competency_ref").order_by("display_order", "pk"))


def nivel_global(criterios, puntuaciones):
    if not criterios or any(criterio.pk not in puntuaciones or not puntuaciones[criterio.pk].level for criterio in criterios):
        return None
    peso = sum((criterio.weight or criterio.max_score for criterio in criterios), Decimal(0))
    if not peso:
        return None
    promedio = sum((Decimal(criterio.weight or criterio.max_score) * LEVEL_INDEX[puntuaciones[criterio.pk].level] for criterio in criterios), Decimal(0)) / peso
    indice = max(1, min(4, int(promedio.quantize(Decimal("1"), rounding=ROUND_HALF_UP))))
    return list(LEVEL_INDEX)[indice - 1]


def consultar(intento):
    rubrica = _rubrica(intento)
    criterios = _criterios(rubrica)
    evaluacion = intento.rubric_evaluations.filter(rubric=rubrica, origin=EvaluationOrigin.DOCENTE).order_by("-updated_at", "-evaluated_at", "-pk").first()
    puntuaciones = {puntaje.rubric_criterion_id: puntaje for puntaje in evaluacion.criterion_scores.all()} if evaluacion else {}
    items = []
    for criterio in criterios:
        puntaje = puntuaciones.get(criterio.pk)
        comentario = (puntaje.comment or "") if puntaje else ""
        items.append({"criterion_id": criterio.pk, "criterionId": criterio.pk, "name": criterio.title, "title": criterio.title, "description": criterio.description, "weight": float(criterio.weight or criterio.max_score), "level": puntaje.level if puntaje else None, "observations": comentario, "comment": comentario, "displayOrder": criterio.display_order})
    comentario = (evaluacion.comment or "") if evaluacion else ""
    return {"attempt_id": str(intento.pk), "attemptId": str(intento.pk), "rubric_id": rubrica.pk, "rubricId": rubrica.pk, "rubric_name": rubrica.name, "rubricName": rubrica.name, "description": rubrica.description, "status": evaluacion.status if evaluacion else "PENDING", "items": items,
        "criteria": [{"id": criterio.pk, "competency": criterio.competency_ref.code if criterio.competency_ref_id else criterio.competency, "title": criterio.title, "description": criterio.description, "weight": float(criterio.weight or criterio.max_score), "displayOrder": criterio.display_order, "levelDescriptors": descriptores(criterio)} for criterio in criterios],
        "scores": [{"criterionId": item["criterionId"], "level": item["level"], "comment": item["comment"], "evidence": {}} for item in items if item["level"] is not None], "levels": NIVELES, "overallLevel": nivel_global(criterios, puntuaciones), "origin": evaluacion.origin if evaluacion else None, "general_observations": comentario, "comment": comentario}


@transaction.atomic
def guardar(intento, docente, datos):
    if not isinstance(datos, dict):
        raise ApiError("VALIDATION_ERROR", "La valoración debe ser un objeto.", status.HTTP_400_BAD_REQUEST)
    entregar = datos.get("deliver", True)
    if not isinstance(entregar, bool):
        raise ApiError("VALIDATION_ERROR", "deliver debe ser verdadero o falso.", status.HTTP_400_BAD_REQUEST, field="deliver")
    intento = SimulationAttempt.objects.select_for_update().get(pk=intento.pk)
    rubrica = _rubrica(intento)
    evaluacion = RubricEvaluation.objects.filter(attempt=intento, rubric=rubrica, instructor=docente, origin=EvaluationOrigin.DOCENTE).first()
    if evaluacion and evaluacion.status == "EVALUATED" and not entregar:
        raise ApiError("EVALUATION_ALREADY_DELIVERED", "Esta valoración ya se entregó al estudiante. Para corregirla, guárdala entregada.", status.HTTP_409_CONFLICT)
    criterios = _criterios(rubrica)
    if not criterios or sum((criterio.weight or criterio.max_score for criterio in criterios), Decimal(0)) != PESO_TOTAL:
        raise ApiError("RUBRIC_WEIGHTS", "Los pesos de los criterios activos deben sumar 100.", status.HTTP_400_BAD_REQUEST)
    filas = datos.get("scores") or datos.get("items") or []
    if not isinstance(filas, list):
        raise ApiError("VALIDATION_ERROR", "Las valoraciones deben ser una lista.", status.HTTP_400_BAD_REQUEST, field="scores")
    permitidos = {criterio.pk for criterio in criterios}
    puntuaciones = {}
    for fila in filas:
        if not isinstance(fila, dict):
            raise ApiError("VALIDATION_ERROR", "Cada valoración debe ser un objeto.", status.HTTP_400_BAD_REQUEST, field="scores")
        try:
            identificador = int(fila.get("criterionId") or fila.get("criterion_id"))
        except (TypeError, ValueError):
            raise ApiError("VALIDATION_ERROR", "Cada valoración necesita su criterio.", status.HTTP_400_BAD_REQUEST, field="scores") from None
        nivel = fila.get("level")
        if identificador not in permitidos or identificador in puntuaciones or "score" in fila or (nivel not in (None, "") and (not isinstance(nivel, str) or nivel not in LEVEL_INDEX)):
            raise ApiError("VALIDATION_ERROR", "El criterio o nivel de la valoración no es válido.", status.HTTP_400_BAD_REQUEST, field="scores")
        if nivel:
            comentario = fila.get("comment") or fila.get("observations") or ""
            if not isinstance(comentario, str):
                raise ApiError("VALIDATION_ERROR", "La observación debe ser texto.", status.HTTP_400_BAD_REQUEST, field="scores")
            puntuaciones[identificador] = (nivel, comentario)
    comentario = datos.get("comment") or datos.get("general_observations") or ""
    if not isinstance(comentario, str):
        raise ApiError("VALIDATION_ERROR", "El comentario debe ser texto.", status.HTTP_400_BAD_REQUEST, field="comment")
    if evaluacion is None:
        evaluacion = RubricEvaluation(attempt=intento, rubric=rubrica, instructor=docente, origin=EvaluationOrigin.DOCENTE, created_at=timezone.now())
    evaluacion.status = "EVALUATED" if entregar and len(puntuaciones) == len(criterios) else "PENDING"
    evaluacion.comment = comentario
    evaluacion.total_score = sum((Decimal(LEVEL_INDEX[puntuaciones[criterio.pk][0]]) * (criterio.weight or criterio.max_score) / PESO_TOTAL for criterio in criterios if criterio.pk in puntuaciones), Decimal(0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    evaluacion.snapshot_json = json.dumps({"rubricId": rubrica.pk, "rubricName": rubrica.name, "criteria": [{"id": criterio.pk, "title": criterio.title, "weight": str(criterio.weight), "description": criterio.description} for criterio in criterios], "valoracionRubrica": True}, ensure_ascii=False)
    evaluacion.updated_at = timezone.now()
    evaluacion.save()
    evaluacion.criterion_scores.all().delete()
    CriterionScore.objects.bulk_create([CriterionScore(rubric_evaluation=evaluacion, rubric_criterion=criterio, level=puntuaciones[criterio.pk][0], score=LEVEL_INDEX[puntuaciones[criterio.pk][0]], comment=puntuaciones[criterio.pk][1], evidence_json="{}") for criterio in criterios if criterio.pk in puntuaciones])
    return consultar(intento)
