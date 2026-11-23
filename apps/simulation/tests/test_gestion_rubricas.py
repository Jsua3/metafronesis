import pytest
from rest_framework.test import APIClient

from apps.simulation.models import Rubric, RubricCriterion
from apps.users.models import CustomUser
from shared.policies import ADMIN, ESTUDIANTE, PROFESOR

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-34")]


@pytest.fixture
def escenario():
    docente = CustomUser.objects.create_user(email="gestion@example.test", password="prueba", role=PROFESOR)
    otro = CustomUser.objects.create_user(email="ajeno@example.test", password="prueba", role=PROFESOR)
    admin = CustomUser.objects.create_user(email="administracion@example.test", password="prueba", role=ADMIN)
    estudiante = CustomUser.objects.create_user(email="estudiante-gestion@example.test", password="prueba", role=ESTUDIANTE)
    rubrica = Rubric.objects.create(name="Rúbrica", created_by=docente)
    criterio = RubricCriterion.objects.create(rubric=rubrica, competency="EMPATIA", title="Escucha", weight=100)
    cliente = APIClient()
    cliente.force_authenticate(docente)
    return locals()


def test_listado_con_contrato_y_visibilidad(escenario):
    Rubric.objects.create(name="Ajena", created_by=escenario["otro"])
    Rubric.objects.create(name="Global", created_by=escenario["admin"])
    respuesta = escenario["cliente"].get("/api/rubrics/")
    assert respuesta.status_code == 200
    datos = respuesta.data["data"]
    assert {item["name"] for item in datos} == {"Rúbrica", "Global"}
    propia = next(item for item in datos if item["id"] == escenario["rubrica"].pk)
    assert propia["editable"] is True and propia["totalWeight"] == 100
    assert propia["usage"] == {"caseVersions": 0, "evaluations": 0}
    assert isinstance(propia["criteriaCount"], int)


def test_edita_y_conserva_descriptores_ausentes(escenario):
    ruta = f"/api/rubrics/{escenario['rubrica'].pk}"
    criterio = {"id": escenario["criterio"].pk, "title": "Escucha", "competency": "EMPATIA", "weight": 100,
                "levelDescriptors": {"LOGRADO": "  Escucha activa  ", "EN_INICIO": ""}}
    respuesta = escenario["cliente"].put(ruta, {"criteria": [criterio]}, format="json")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["criteria"][0]["levelDescriptors"] == {"LOGRADO": "Escucha activa"}
    criterio.pop("levelDescriptors")
    respuesta = escenario["cliente"].put(ruta, {"criteria": [criterio]}, format="json")
    assert respuesta.data["data"]["criteria"][0]["levelDescriptors"] == {"LOGRADO": "Escucha activa"}


@pytest.mark.parametrize("descriptores", [{"OTRO": "Texto"}, {"LOGRADO": 7}, {"LOGRADO": "x" * 601}, []])
def test_rechaza_descriptores_invalidos(escenario, descriptores):
    cuerpo = {"criteria": [{"id": escenario["criterio"].pk, "title": "Escucha", "weight": 100,
                            "levelDescriptors": descriptores}]}
    respuesta = escenario["cliente"].put(f"/api/rubrics/{escenario['rubrica'].pk}", cuerpo, format="json")
    assert respuesta.status_code == 400 and respuesta.data["success"] is False


def test_ciclo_duplicado_y_predeterminada(escenario):
    cliente, rubrica = escenario["cliente"], escenario["rubrica"]
    copia = cliente.post(f"/api/rubrics/{rubrica.pk}/duplicate", {}, format="json")
    assert copia.status_code == 200 and copia.data["data"]["active"] is False
    copia_id = copia.data["data"]["id"]
    assert cliente.post(f"/api/rubrics/{copia_id}/activate", {}, format="json").status_code == 200
    assert cliente.post(f"/api/rubrics/{copia_id}/default", {}, format="json").status_code == 403
    cliente.force_authenticate(escenario["admin"])
    assert cliente.post(f"/api/rubrics/{rubrica.pk}/default", {}, format="json").status_code == 200
    assert cliente.post(f"/api/rubrics/{copia_id}/default", {}, format="json").status_code == 200
    assert list(Rubric.objects.filter(is_default=True).values_list("id", flat=True)) == [copia_id]
    assert cliente.post(f"/api/rubrics/{copia_id}/deactivate", {}, format="json").data["data"]["isDefault"] is False


def test_permisos_de_propiedad_y_rol(escenario):
    cliente, rubrica = escenario["cliente"], escenario["rubrica"]
    cliente.force_authenticate(escenario["otro"])
    assert cliente.put(f"/api/rubrics/{rubrica.pk}", {"name": "Cambio"}, format="json").status_code == 404
    assert cliente.post(f"/api/rubrics/{rubrica.pk}/duplicate", {}, format="json").status_code == 404
    cliente.force_authenticate(escenario["estudiante"])
    assert cliente.get("/api/rubrics/").status_code == 403
    assert cliente.post(f"/api/rubrics/{rubrica.pk}/activate", {}, format="json").status_code == 403


def test_pesos_invalidos_no_alteran_rubrica(escenario):
    respuesta = escenario["cliente"].put(f"/api/rubrics/{escenario['rubrica'].pk}", {"criteria": []}, format="json")
    assert respuesta.status_code == 400
    escenario["criterio"].refresh_from_db()
    assert escenario["criterio"].active


def test_creacion_y_detalle_con_descriptores(escenario):
    cuerpo = {"name": "Nueva", "criteria": [{"competency": "ÉTICA", "description": "Respeto", "weight": 100,
                 "levelDescriptors": {"LOGRADO": "Actúa con respeto"}}]}
    respuesta = escenario["cliente"].post("/api/rubrics", cuerpo, format="json")
    assert respuesta.status_code == 201
    assert respuesta.data["data"]["criteria"][0]["levelDescriptors"] == {"LOGRADO": "Actúa con respeto"}
    detalle = escenario["cliente"].get(f"/api/rubrics/{respuesta.data['data']['id']}")
    assert detalle.data["data"]["criteria"][0]["levelDescriptors"] == {"LOGRADO": "Actúa con respeto"}


def test_auditoria_registra_accion_y_origen(escenario):
    import json
    from apps.simulation.models import AuditLog

    respuesta = escenario["cliente"].post(f"/api/rubrics/{escenario['rubrica'].pk}/duplicate", {}, format="json")
    registro = AuditLog.objects.filter(action="RUBRIC_CREATED", resource_id=str(respuesta.data["data"]["id"])).get()
    contexto = json.loads(registro.context_json)
    assert contexto["sourceId"] == escenario["rubrica"].pk
    assert contexto["rubricId"] == respuesta.data["data"]["id"]


def test_descriptor_no_admite_marcado(escenario):
    cuerpo = {"criteria": [{"id": escenario["criterio"].pk, "title": "Escucha", "weight": 100,
                            "levelDescriptors": {"LOGRADO": "<b>Texto</b>"}}]}
    respuesta = escenario["cliente"].put(f"/api/rubrics/{escenario['rubrica'].pk}", cuerpo, format="json")
    assert respuesta.status_code == 400 and respuesta.data["field"] == "levelDescriptors"


def test_plantilla_global_es_visible_y_solo_lectura(escenario):
    rubrica = Rubric.objects.create(name="Plantilla", created_by=escenario["admin"])
    RubricCriterion.objects.create(rubric=rubrica, competency="ÉTICA", title="Respeto", weight=100)
    cliente = escenario["cliente"]
    assert cliente.put(f"/api/rubrics/{rubrica.pk}", {"name": "Cambio"}, format="json").status_code == 403
    respuesta = cliente.post(f"/api/rubrics/{rubrica.pk}/duplicate", {}, format="json")
    assert respuesta.status_code == 200 and respuesta.data["data"]["ownerId"] == escenario["docente"].pk


def test_duplicado_preserva_descriptores_y_estado_del_criterio(escenario):
    criterio = escenario["criterio"]
    criterio.level_descriptors_json = '{"LOGRADO": "Escucha activa"}'
    criterio.save(update_fields=["level_descriptors_json"])
    respuesta = escenario["cliente"].post(f"/api/rubrics/{escenario['rubrica'].pk}/duplicate", {}, format="json")
    assert respuesta.data["data"]["criteria"][0]["levelDescriptors"] == {"LOGRADO": "Escucha activa"}
    assert respuesta.data["data"]["criteria"][0]["active"] is True


def test_predeterminada_inactiva_y_activacion_sin_pesos_validos(escenario):
    rubrica = escenario["rubrica"]
    rubrica.active = False
    rubrica.save(update_fields=["active"])
    escenario["criterio"].weight = 50
    escenario["criterio"].save(update_fields=["weight"])
    cliente = escenario["cliente"]
    assert cliente.post(f"/api/rubrics/{rubrica.pk}/activate", {}, format="json").status_code == 400
    cliente.force_authenticate(escenario["admin"])
    assert cliente.post(f"/api/rubrics/{rubrica.pk}/default", {}, format="json").status_code == 400


def test_migracion_conserva_un_valor_predeterminado_en_base(escenario):
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute("SELECT column_default FROM information_schema.columns WHERE table_name = %s AND column_name = %s", ["rubric_criteria", "level_descriptors_json"])
        assert "{}" in cursor.fetchone()[0]
    assert escenario["criterio"].level_descriptors_json == "{}"


def test_esquema_documenta_contrato_de_gestion():
    from drf_spectacular.generators import SchemaGenerator

    esquema = SchemaGenerator().get_schema(public=True)
    operacion = esquema["paths"]["/api/rubrics"]["get"]
    referencia = operacion["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    assert "RubricaGestionListEnvelope" in referencia
    assert "put" in esquema["paths"]["/api/rubrics/{rubric_id}"]
    assert "post" in esquema["paths"]["/api/rubrics/{rubric_id}/duplicate"]
