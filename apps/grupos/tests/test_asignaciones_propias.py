"""P6 · «Lo siguiente» del docente se calcula con ``GET /api/assignments`` sin ``groupId``.

El inicio del docente necesita saber qué casos publicados no están asignados a ningún grupo suyo. Para eso lee todas
sus asignaciones de una vez. Lo que se prueba aquí es el límite que lo hace seguro: un PROFESOR solo ve las de SUS
grupos (nunca las de otro docente) y un estudiante no las lista.
"""
import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

pytestmark = [pytest.mark.req("RF-14"), pytest.mark.security]

User = get_user_model()
GRUPOS = "/api/grupos"
ASIGNACIONES = "/api/assignments"


def _usuario(correo, rol):
    return User.objects.create_user(
        email=correo, password=secrets.token_urlsafe(24), nombre="N", apellido="A", role=rol
    )


def _cliente(usuario):
    client = APIClient()
    client.force_authenticate(user=usuario)
    return client


def _grupo(cliente, nombre):
    resp = cliente.post(GRUPOS, {"nombre": nombre, "codigo": "P6-" + secrets.token_hex(4)}, format="json")
    assert resp.status_code == 201, resp.data
    return resp.data["id"] if "id" in resp.data else resp.data["data"]["id"]


def _asignar(cliente, grupo_id, version_id):
    resp = cliente.post(
        ASIGNACIONES,
        {"caseVersionId": version_id, "target": {"type": "GROUP", "groupId": grupo_id}},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    return resp.data["data"]["id"]


def test_sin_grupo_el_docente_recibe_las_asignaciones_de_todos_sus_grupos(db, caso_publicado):
    docente = _usuario("p6_docente@example.test", "PROFESOR")
    cliente = _cliente(docente)
    primera = _asignar(cliente, _grupo(cliente, "Grupo A"), caso_publicado.id)
    segunda = _asignar(cliente, _grupo(cliente, "Grupo B"), caso_publicado.id)

    resp = cliente.get(ASIGNACIONES)

    assert resp.status_code == 200, resp.data
    assert sorted(item["id"] for item in resp.data["data"]) == sorted([primera, segunda])


def test_sin_grupo_el_docente_no_ve_las_asignaciones_de_otro_docente(db, caso_publicado):
    mio = _cliente(_usuario("p6_mio@example.test", "PROFESOR"))
    ajeno = _cliente(_usuario("p6_ajeno@example.test", "PROFESOR"))
    _asignar(ajeno, _grupo(ajeno, "Grupo ajeno"), caso_publicado.id)
    propia = _asignar(mio, _grupo(mio, "Grupo propio"), caso_publicado.id)

    resp = mio.get(ASIGNACIONES)

    assert resp.status_code == 200, resp.data
    assert [item["id"] for item in resp.data["data"]] == [propia]


def test_un_docente_sin_grupos_recibe_una_lista_vacia(db):
    resp = _cliente(_usuario("p6_sin_grupos@example.test", "PROFESOR")).get(ASIGNACIONES)

    assert resp.status_code == 200, resp.data
    assert resp.data["data"] == []


def test_un_estudiante_no_lista_asignaciones(db):
    resp = _cliente(_usuario("p6_estudiante@example.test", "ESTUDIANTE")).get(ASIGNACIONES)

    assert resp.status_code == 403
