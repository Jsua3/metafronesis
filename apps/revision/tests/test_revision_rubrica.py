import pytest

from apps.revision.tests.test_revision import datos
from apps.simulation.models import RubricCriterion

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-32", "SIEP-43")]


def test_intentos_recientes_respetan_alcance(datos):
    respuesta = datos["cliente"].get("/api/instructor/attempts/recent")
    assert respuesta.status_code == 200
    assert [fila["attemptId"] for fila in respuesta.data["data"]] == [str(datos["intento"].pk)]


def test_valoracion_descriptores_y_entrega(datos):
    criterio = RubricCriterion.objects.create(rubric=datos["rubrica"], competency="EMPATIA", title="Escucha", weight=100, level_descriptors_json='{"LOGRADO": "Escucha activa"}')
    ruta = f'/api/instructor/attempts/{datos["intento"].pk}/rubric-evaluation'
    respuesta = datos["cliente"].get(ruta)
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["criteria"][0]["levelDescriptors"] == {"LOGRADO": "Escucha activa"}
    respuesta = datos["cliente"].put(ruta, {"scores": [{"criterionId": criterio.pk, "level": "LOGRADO"}], "deliver": False}, format="json")
    assert respuesta.status_code == 200 and respuesta.data["data"]["status"] == "PENDING"
    respuesta = datos["cliente"].put(ruta, {"scores": [{"criterionId": criterio.pk, "level": "LOGRADO"}]}, format="json")
    assert respuesta.status_code == 200 and respuesta.data["data"]["status"] == "EVALUATED"
    respuesta = datos["cliente"].put(ruta, {"deliver": False}, format="json")
    assert respuesta.status_code == 409 and respuesta.data["code"] == "EVALUATION_ALREADY_DELIVERED"


def test_traza_y_reemplazo_protegen_intentos_ajenos(datos):
    ruta = f'/api/instructor/attempts/{datos["intento_ajeno"].pk}'
    assert datos["cliente"].get(ruta + "/trace").status_code == 404
    assert datos["cliente"].post(ruta + "/replace", {"reason": "Motivo"}, format="json").status_code == 404


def test_borrador_no_visible_y_validacion(datos):
    from apps.simulation.services.evaluacion import retroalimentacion_docente_de

    criterio = RubricCriterion.objects.create(rubric=datos["rubrica"], competency="EMPATIA", title="Escucha", weight=100)
    ruta = f'/api/instructor/attempts/{datos["intento"].pk}/rubric-evaluation'
    respuesta = datos["cliente"].put(ruta, {"scores": [{"criterionId": criterio.pk, "level": "LOGRADO"}], "comment": "Privado", "deliver": False}, format="json")
    assert respuesta.status_code == 200
    assert retroalimentacion_docente_de(datos["intento"]) is None
    assert datos["cliente"].put(ruta, {"deliver": "false"}, format="json").status_code == 400
    assert datos["cliente"].put(ruta, {"scores": [{"criterionId": criterio.pk, "score": 4}]}, format="json").status_code == 400


def test_traza_y_valoracion_exigen_alcance_y_rol(datos):
    ruta = f'/api/instructor/attempts/{datos["intento"].pk}'
    assert datos["cliente"].get(ruta + "/trace").status_code == 200
    assert datos["cliente"].get(f'/api/instructor/attempts/{datos["intento_ajeno"].pk}/rubric-evaluation').status_code == 404
    datos["cliente"].force_authenticate(datos["alumno"])
    assert datos["cliente"].get(ruta + "/trace").status_code == 403
    assert datos["cliente"].put(ruta + "/rubric-evaluation", {}, format="json").status_code == 403


def test_valoracion_rechaza_niveles_no_textuales(datos):
    criterio = RubricCriterion.objects.create(rubric=datos["rubrica"], competency="EMPATIA", title="Escucha", weight=100)
    ruta = f'/api/instructor/attempts/{datos["intento"].pk}/rubric-evaluation'
    respuesta = datos["cliente"].put(ruta, {"scores": [{"criterionId": criterio.pk, "level": []}]}, format="json")
    assert respuesta.status_code == 400
    assert respuesta.data["code"] == "VALIDATION_ERROR"


def test_traza_muestra_evidencia_e_hitos_del_caso(datos):
    import json

    datos["version"].rules = json.dumps({"milestones": [{"key": "escuchar", "label": "Escuchar", "decisive": True}]})
    datos["version"].save(update_fields=["rules"])
    datos["intento"].state_json = {"milestones": ["escuchar"]}
    datos["intento"].save(update_fields=["state_json"])
    datos["opcion"].effects = json.dumps({"competencies": {"EMPATIA": "LOGRADO"}})
    datos["opcion"].save(update_fields=["effects"])
    RubricCriterion.objects.create(rubric=datos["rubrica"], competency="EMPATIA", title="Escucha", weight=100)
    respuesta = datos["cliente"].get(f'/api/instructor/attempts/{datos["intento"].pk}/trace')
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["milestones"]["done"] == [{"key": "escuchar", "label": "Escuchar", "decisive": True}]
    assert respuesta.data["data"]["evidenceByCompetency"][0]["items"][0]["optionText"] == "Opción"


def test_estudiante_no_ve_borrador_en_resultado(datos):
    from django.utils import timezone
    from apps.grupos.models import CaseAssignment

    datos["version"].status = "PUBLISHED"
    datos["version"].validated_at = timezone.now()
    datos["version"].definition_hash = "sha256:" + "a" * 64
    datos["version"].save(update_fields=["status", "validated_at", "definition_hash"])
    CaseAssignment.objects.create(case_version=datos["version"], estudiante=datos["alumno"])
    criterio = RubricCriterion.objects.create(rubric=datos["rubrica"], competency="EMPATIA", title="Escucha", weight=100)
    datos["intento"].status = "COMPLETED"
    datos["intento"].save(update_fields=["status"])
    ruta = f'/api/instructor/attempts/{datos["intento"].pk}/rubric-evaluation'
    cuerpo = {"scores": [{"criterionId": criterio.pk, "level": "LOGRADO"}], "comment": "Aún privado", "deliver": False}
    assert datos["cliente"].put(ruta, cuerpo, format="json").status_code == 200
    datos["cliente"].force_authenticate(datos["alumno"])
    respuesta = datos["cliente"].get(f'/api/simulation/attempts/{datos["intento"].pk}/result')
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["teacherFeedback"] is None
    datos["cliente"].force_authenticate(datos["docente"])
    cuerpo["deliver"] = True
    assert datos["cliente"].put(ruta, cuerpo, format="json").status_code == 200
    datos["cliente"].force_authenticate(datos["alumno"])
    assert datos["cliente"].get(f'/api/simulation/attempts/{datos["intento"].pk}/result').data["data"]["teacherFeedback"] == "Aún privado"


def test_json_de_recientes_y_auditoria(datos):
    from apps.simulation.models import AuditLog

    respuesta = datos["cliente"].get("/api/instructor/attempts/recent")
    fila = respuesta.data["data"][0]
    assert set(fila) == {"attemptId", "studentAlias", "caseTitle", "status", "startedAt", "caseVersionId", "endedAt", "evaluationStatus"}
    assert fila["studentAlias"].startswith("Estudiante-")
    assert fila["evaluationStatus"] == "NO_APLICA"
    ruta = f'/api/instructor/attempts/{datos["intento"].pk}'
    assert datos["cliente"].get(ruta + "/trace").status_code == 200
    assert datos["cliente"].get(ruta + "/rubric-evaluation").status_code == 200
    assert AuditLog.objects.filter(action="traza.leer", resource_id=str(datos["intento"].pk)).count() == 2


def test_valoracion_encuentra_rubrica_propia_o_predeterminada(datos):
    from apps.simulation.models import SimulationRubricAssignment

    SimulationRubricAssignment.objects.filter(case_version=datos["version"]).delete()
    datos["rubrica"].case_version = datos["version"]
    datos["rubrica"].save(update_fields=["case_version"])
    ruta = f'/api/instructor/attempts/{datos["intento"].pk}/rubric-evaluation'
    assert datos["cliente"].get(ruta).data["data"]["rubricId"] == datos["rubrica"].pk
    datos["rubrica"].case_version = None
    datos["rubrica"].is_default = True
    datos["rubrica"].save(update_fields=["case_version", "is_default"])
    assert datos["cliente"].get(ruta).data["data"]["rubricId"] == datos["rubrica"].pk


def test_traza_oculta_valoracion_automatica_hasta_entregar(datos):
    from apps.simulation.models import RubricEvaluation

    criterio = RubricCriterion.objects.create(rubric=datos["rubrica"], competency="EMPATIA", title="Escucha", weight=100)
    RubricEvaluation.objects.create(attempt=datos["intento"], rubric=datos["rubrica"], origin="SISTEMA")
    ruta = f'/api/instructor/attempts/{datos["intento"].pk}'
    traza = datos["cliente"].get(ruta + "/trace").data["data"]
    assert traza["systemEvaluation"] is None and traza["systemEvaluationAvailable"] is True
    cuerpo = {"scores": [{"criterionId": criterio.pk, "level": "LOGRADO"}]}
    assert datos["cliente"].put(ruta + "/rubric-evaluation", cuerpo, format="json").status_code == 200
    assert datos["cliente"].get(ruta + "/trace").data["data"]["systemEvaluation"]["origin"] == "SISTEMA"
