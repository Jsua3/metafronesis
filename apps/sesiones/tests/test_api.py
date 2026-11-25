from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.users.models import CustomUser
from shared.policies import ESTUDIANTE, PROFESOR

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-35", "SIEP-36")]


@pytest.fixture
def cuerpo(grupo, version):
    inicio = timezone.now().replace(microsecond=0)
    return {
        "grupoId": grupo.pk, "caseVersionId": version.pk, "espacioAcademico": "Psicología clínica",
        "inicio": inicio.isoformat(), "fin": (inicio + timedelta(hours=1)).isoformat(), "tiempoMaximoMin": 30,
        "lugar": "Aula 3", "mensaje": "",
    }


def crear(cliente, cuerpo):
    respuesta = cliente.post("/api/sesiones", cuerpo, format="json")
    assert respuesta.status_code == 201, respuesta.data
    return respuesta.data["data"]


def test_crear_y_ver_detalle(cliente_docente, cuerpo, estudiantes):
    sesion = crear(cliente_docente, cuerpo)
    assert sesion["estado"] == "PROGRAMADA"
    assert sesion["acciones"] == ["iniciar", "cancelar", "editar", "gestionarConvocados"]
    assert sesion["grupo"]["nombre"] == "Psicología 1" and sesion["totalConvocados"] == 2
    assert {fila["email"] for fila in sesion["convocados"]} == {e.email for e in estudiantes[:2]}
    detalle = cliente_docente.get(f"/api/sesiones/{sesion['id']}").data["data"]
    assert detalle["id"] == sesion["id"]


def test_validaciones_de_crear(cliente_docente, cuerpo):
    for cambios in ({"fin": cuerpo["inicio"]}, {"tiempoMaximoMin": 0}, {"grupoId": None}):
        assert cliente_docente.post("/api/sesiones", {**cuerpo, **cambios}, format="json").status_code == 400
    respuesta = cliente_docente.post("/api/sesiones", {**cuerpo, "tiempoMaximoMin": 46}, format="json")
    assert respuesta.status_code == 400 and respuesta.data["field"] == "tiempoMaximoMin"


def test_lista_filtra_por_estado(cliente_docente, cuerpo):
    sesion = crear(cliente_docente, cuerpo)
    assert len(cliente_docente.get("/api/sesiones?estado=PROGRAMADA").data["data"]) == 1
    assert cliente_docente.get("/api/sesiones?estado=EN_CURSO,PAUSADA").data["data"] == []
    cliente_docente.post(f"/api/sesiones/{sesion['id']}/iniciar")
    assert [s["id"] for s in cliente_docente.get("/api/sesiones?estado=EN_CURSO,PAUSADA").data["data"]] == [sesion["id"]]


def test_transiciones_por_api(cliente_docente, cuerpo):
    url = f"/api/sesiones/{crear(cliente_docente, cuerpo)['id']}"
    assert cliente_docente.post(url + "/pausar").data["code"] == "INVALID_TRANSITION"
    for accion, estado in (("iniciar", "EN_CURSO"), ("pausar", "PAUSADA"), ("reanudar", "EN_CURSO"), ("finalizar", "FINALIZADA")):
        respuesta = cliente_docente.post(url + "/" + accion)
        assert respuesta.status_code == 200 and respuesta.data["data"]["estado"] == estado


def test_editar_y_sincronizar(cliente_docente, cuerpo):
    url = f"/api/sesiones/{crear(cliente_docente, cuerpo)['id']}"
    assert cliente_docente.patch(url, {"lugar": "Aula 9"}, format="json").data["data"]["lugar"] == "Aula 9"
    assert cliente_docente.post(url + "/sincronizar").data["data"] == {"agregados": 0}


def test_biblioteca_no_expone_el_contenido(cliente_docente, version):
    casos = cliente_docente.get("/api/sesiones/casos").data["data"]
    assert [c["caseVersionId"] for c in casos] == [version.pk]
    assert set(casos[0]) == {"caseVersionId", "titulo", "version", "autor", "editadoPor", "tiempoEstimadoMin", "descripcion"}


def test_permisos(cuerpo, cliente_docente):
    pk = crear(cliente_docente, cuerpo)["id"]
    estudiante = APIClient()
    estudiante.force_authenticate(CustomUser.objects.create_user("ses-api-est@example.test", None, role=ESTUDIANTE))
    assert estudiante.get("/api/sesiones").status_code == 403
    assert estudiante.get("/api/sesiones/casos").status_code == 403
    otro = APIClient()
    otro.force_authenticate(CustomUser.objects.create_user("ses-api-otro@example.test", None, role=PROFESOR))
    assert otro.get("/api/sesiones").data["data"] == []
    for metodo, ruta in (("get", ""), ("patch", ""), ("post", "/iniciar"), ("post", "/sincronizar")):
        assert getattr(otro, metodo)(f"/api/sesiones/{pk}{ruta}", {}, format="json").status_code == 404


def test_ya_no_se_convoca_por_correos(cliente_docente, cuerpo):
    pk = crear(cliente_docente, cuerpo)["id"]
    assert cliente_docente.post(f"/api/sesiones/{pk}/convocados", {"emails": ["x@example.test"]}, format="json").status_code in (404, 405)


def test_fechas_con_desfase_se_guardan_en_hora_de_bogota(cliente_docente, cuerpo):
    from datetime import datetime
    from apps.sesiones.models import Sesion
    cuerpo = {**cuerpo, "inicio": "2026-11-24T14:00:00-05:00", "fin": "2026-11-24T17:00:00-05:00"}
    sesion = crear(cliente_docente, cuerpo)
    fila = Sesion.objects.get(pk=sesion["id"])
    assert fila.inicio == datetime(2026, 11, 24, 14, 0) and fila.fin == datetime(2026, 11, 24, 17, 0)
    assert sesion["inicio"] == "2026-11-24T14:00:00-05:00" and sesion["fin"] == "2026-11-24T17:00:00-05:00"
    detalle = cliente_docente.get(f"/api/sesiones/{sesion['id']}").data["data"]
    assert detalle["inicio"] == "2026-11-24T14:00:00-05:00"


def test_un_instante_en_z_se_convierte_a_bogota(cliente_docente, cuerpo):
    cuerpo = {**cuerpo, "inicio": "2026-11-24T19:00:00Z", "fin": "2026-11-24T22:00:00.000Z"}
    sesion = crear(cliente_docente, cuerpo)
    assert sesion["inicio"] == "2026-11-24T14:00:00-05:00" and sesion["fin"] == "2026-11-24T17:00:00-05:00"


def test_fecha_invalida_senala_el_campo(cliente_docente, cuerpo):
    respuesta = cliente_docente.post("/api/sesiones", {**cuerpo, "inicio": "mañana"}, format="json")
    assert respuesta.status_code == 400 and respuesta.data["field"] == "inicio"
