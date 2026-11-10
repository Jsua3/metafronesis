from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, Rubric, SimulationCase, SimulationRubricAssignment
from apps.users.models import CustomUser
from shared.policies import ADMIN, ESTUDIANTE, PROFESOR


pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-34")]


@pytest.fixture
def datos():
    docente = CustomUser.objects.create_user(email="rubricas@example.test", password="test-only", role=PROFESOR)
    otro = CustomUser.objects.create_user(email="otro-rubricas@example.test", password="test-only", role=PROFESOR)
    estudiante = CustomUser.objects.create_user(email="est-rubricas@example.test", password="test-only", role=ESTUDIANTE)
    admin = CustomUser.objects.create_user(email="admin-rubricas@example.test", password="test-only", role=ADMIN)
    caso = SimulationCase.objects.create(code="RUB", title="Caso", created_by=docente)
    version = CaseVersion.objects.create(simulation_case=caso, semantic_version="1.0.0", created_by=docente)
    cliente = APIClient()
    cliente.force_authenticate(docente)
    cuerpo = {"name": "Rúbrica", "criteria": [
        {"competency": "EMPATIA", "description": "Escucha", "weight": "60.00"},
        {"competency": "ETICA", "description": "Respeto", "weight": "40.00"},
    ]}
    return locals()


def test_crea_rubrica_con_pesos_100(datos):
    respuesta = datos["cliente"].post("/api/rubrics", datos["cuerpo"], format="json")
    assert respuesta.status_code == 201
    rubrica = Rubric.objects.get(pk=respuesta.data["data"]["id"])
    assert rubrica.created_by == datos["docente"]
    assert list(rubrica.criteria.values_list("weight", flat=True)) == [Decimal("60"), Decimal("40")]
    lectura = datos["cliente"].get(f"/api/rubrics/{rubrica.pk}")
    assert lectura.status_code == 200
    assert len(lectura.data["data"]["criteria"]) == 2


@pytest.mark.parametrize("pesos", [[], ["60", "30"]])
def test_pesos_que_no_suman_100(datos, pesos):
    datos["cuerpo"]["criteria"] = [dict(competency="X", description="X", weight=peso) for peso in pesos]
    respuesta = datos["cliente"].post("/api/rubrics", datos["cuerpo"], format="json")
    assert respuesta.status_code == 400
    assert respuesta.data["code"] == "RUBRIC_WEIGHTS"
    assert not Rubric.objects.exists()


def test_estudiante_no_crea_rubrica(datos):
    datos["cliente"].force_authenticate(datos["estudiante"])
    assert datos["cliente"].post("/api/rubrics", datos["cuerpo"], format="json").status_code == 403


def test_asocia_a_borrador(datos):
    from apps.simulation.services.rubricas import rubrica_activa_de

    cliente, version = datos["cliente"], datos["version"]
    primera = cliente.post("/api/rubrics", datos["cuerpo"], format="json").data["data"]["id"]
    segunda = cliente.post("/api/rubrics", datos["cuerpo"], format="json").data["data"]["id"]
    ruta = f"/api/rubrics/case-versions/{version.pk}"
    assert cliente.put(ruta, {"rubricId": primera}, format="json").status_code == 200
    assert cliente.put(ruta, {"rubricId": segunda}, format="json").status_code == 200
    assert rubrica_activa_de(version.pk).pk == segunda
    assert SimulationRubricAssignment.objects.filter(case_version=version, active=True).count() == 1
    assert SimulationRubricAssignment.objects.filter(case_version=version, active=False, rubric_id=primera).exists()
    assert rubrica_activa_de(999999) is None


@pytest.mark.parametrize("estado", ["IN_REVIEW", "PUBLISHED", "ARCHIVED"])
def test_no_asocia_a_publicada(datos, estado):
    version = datos["version"]
    version.status = estado
    version.save(update_fields=["status"])
    rubrica = Rubric.objects.create(name="R", created_by=datos["docente"])
    respuesta = datos["cliente"].put(f"/api/rubrics/case-versions/{version.pk}", {"rubricId": rubrica.pk}, format="json")
    assert respuesta.status_code == 409
    assert respuesta.data["code"] == "VERSION_NOT_EDITABLE"


def test_no_asocia_recursos_ajenos_o_inexistentes(datos):
    rubrica = Rubric.objects.create(name="Ajena", created_by=datos["otro"])
    ruta = f"/api/rubrics/case-versions/{datos['version'].pk}"
    assert datos["cliente"].put(ruta, {"rubricId": rubrica.pk}, format="json").status_code == 404
    datos["cliente"].force_authenticate(datos["otro"])
    assert datos["cliente"].put(ruta, {"rubricId": rubrica.pk}, format="json").status_code == 404
    assert datos["cliente"].put("/api/rubrics/case-versions/999999", {"rubricId": rubrica.pk}, format="json").status_code == 404
    datos["cliente"].force_authenticate(datos["admin"])
    assert datos["cliente"].put(ruta, {"rubricId": rubrica.pk}, format="json").status_code == 200
