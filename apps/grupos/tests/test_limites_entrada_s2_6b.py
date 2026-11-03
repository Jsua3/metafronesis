"""S2-6b · Límites de entrada de los grupos y de las fechas de las asignaciones.

- Grupos (SF-22, SF-23): ``nombre`` y ``codigo`` tienen el tope de su columna (un campo más largo es un 400 con
  el campo, no un 500); el nombre es texto plano (sale en los correos de invitación); el código solo lleva letras,
  números, guion y guion bajo.
- Asignaciones (500 diferidos de E3): una fecha de año 0001 o 9999, o que se sale de rango al pasar a Bogotá, es un
  400 con el campo. El rango razonable es el año 2000 a 2100 (hora de Bogotá).
"""
import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo
from apps.simulation.models import CaseVersion

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security]

User = get_user_model()
GRUPOS = "/api/grupos"
ASIGNACIONES = "/api/assignments"


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="limites_prof@x.com", password=secrets.token_urlsafe(24),
        nombre="P", apellido="L", role="PROFESOR",
    )


@pytest.fixture
def cliente(profesor):
    client = APIClient()
    client.force_authenticate(user=profesor)
    return client


@pytest.fixture
def caso_publicado(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


def _codigo():
    """Un código único y válido para cada grupo de la prueba (el código es único en la base)."""
    return "LIM-" + secrets.token_hex(4)


def _crear(cliente, **campos):
    datos = {"nombre": "Grupo límites", "codigo": _codigo(), **campos}
    return cliente.post(GRUPOS, datos, format="json")


# ─── Grupos: tope de largo (SF-22) ──────────────────────────────────────────────────────
def test_codigo_de_51_caracteres_da_400_con_el_campo(cliente):
    resp = _crear(cliente, codigo="C" * 51)

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "codigo"


def test_codigo_de_50_caracteres_sigue_valido(cliente):
    resp = _crear(cliente, codigo="C" * 50)

    assert resp.status_code == 201, resp.data


def test_nombre_de_256_caracteres_da_400_con_el_campo(cliente):
    resp = _crear(cliente, nombre="N" * 256)

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "nombre"


def test_nombre_de_255_caracteres_sigue_valido(cliente):
    resp = _crear(cliente, nombre="N" * 255)

    assert resp.status_code == 201, resp.data


def test_actualizar_con_nombre_de_256_caracteres_da_400(cliente):
    grupo = _crear(cliente).data["data"]

    resp = cliente.put(f"{GRUPOS}/{grupo['id']}", {"nombre": "N" * 256}, format="json")

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "nombre"


def test_actualizar_con_codigo_de_51_caracteres_da_400(cliente):
    grupo = _crear(cliente).data["data"]

    resp = cliente.put(f"{GRUPOS}/{grupo['id']}", {"codigo": "C" * 51}, format="json")

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "codigo"


# ─── Grupos: el nombre es texto plano (SF-23) ───────────────────────────────────────────
@pytest.mark.parametrize("nombre", ["Grupo\nFalso", "<b>Grupo</b>", "Grupo https://evil.test/x", "Grupo\u0007"])
def test_nombre_con_salto_de_linea_etiqueta_enlace_o_control_da_400(cliente, nombre):
    resp = _crear(cliente, nombre=nombre)

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "nombre"


def test_actualizar_con_nombre_con_etiqueta_da_400(cliente):
    grupo = _crear(cliente).data["data"]

    resp = cliente.put(f"{GRUPOS}/{grupo['id']}", {"nombre": "<i>Grupo</i>"}, format="json")

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "nombre"


def test_nombre_con_espacios_y_acentos_sigue_funcionando(cliente):
    resp = _crear(cliente, nombre="Grupo Demo SIEP", codigo="SIEP-DEMO")

    assert resp.status_code == 201, resp.data
    assert resp.data["data"]["nombre"] == "Grupo Demo SIEP"
    assert resp.data["data"]["codigo"] == "SIEP-DEMO"


# ─── Grupos: forma del código ───────────────────────────────────────────────────────────
@pytest.mark.parametrize("codigo", ["A B", "a.b", "G/1", "ñandu", "<x>", "SIEP;DROP"])
def test_codigo_fuera_de_letras_numeros_guion_y_guion_bajo_da_400(cliente, codigo):
    resp = _crear(cliente, codigo=codigo)

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "codigo"


@pytest.mark.parametrize("codigo", ["DEMO1", "ABC_1", "a-b_c", "SIEP-DEMO"])
def test_codigo_con_letras_numeros_guion_y_guion_bajo_tiene_forma_valida(codigo):
    # Se mira el formato con el serializador: «DEMO1» ya lo siembra bootstrap_dev_db y chocaría con el código único.
    from apps.grupos.serializers import CrearGrupoSerializer

    assert CrearGrupoSerializer(data={"nombre": "Grupo", "codigo": codigo}).is_valid(), codigo


# ─── Asignaciones: fechas que desbordan (500 diferidos de E3) ──────────────────────────
def _asignar(cliente, profesor, caso, campo, valor):
    grupo = Grupo.objects.create(nombre="Grupo fechas", codigo=_codigo(), profesor=profesor)
    cuerpo = {"caseVersionId": caso.id, "target": {"type": "GROUP", "groupId": grupo.id}, campo: valor}
    return cliente.post(ASIGNACIONES, cuerpo, format="json")


@pytest.mark.parametrize("campo", ["opensAt", "closesAt"])
@pytest.mark.parametrize(
    "valor",
    [
        "0001-01-01T00:00:00+01:00",  # año 1 con desfase: al pasar a Bogotá queda en el año 0
        "0001-01-01T00:00:00Z",       # UTC: lo mismo
        "9999-12-31T23:59:59-01:00",  # al pasar a Bogotá se sale por arriba
    ],
)
def test_fecha_que_desborda_al_pasar_a_bogota_da_400_con_el_campo(cliente, profesor, caso_publicado, campo, valor):
    resp = _asignar(cliente, profesor, caso_publicado, campo, valor)

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == campo


@pytest.mark.parametrize(
    "valor",
    [
        "0001-01-01T00:00:00",        # año 1 sin desfase
        "9999-12-31T23:59:59",        # año 9999 sin desfase
        "1999-12-31T23:59:59-05:00",  # antes de 2000
        "2101-01-01T00:00:00-05:00",  # después de 2100
    ],
)
def test_fecha_fuera_del_rango_2000_a_2100_da_400_con_el_campo(cliente, profesor, caso_publicado, valor):
    resp = _asignar(cliente, profesor, caso_publicado, "opensAt", valor)

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "opensAt"


@pytest.mark.parametrize("valor", ["2000-01-01T00:00:00-05:00", "2026-10-20T08:00:00-05:00", "2100-12-31T23:59:59-05:00"])
def test_fecha_dentro_del_rango_2000_a_2100_se_acepta(cliente, profesor, caso_publicado, valor):
    resp = _asignar(cliente, profesor, caso_publicado, "opensAt", valor)

    assert resp.status_code == 201, resp.data


def test_parchear_una_fecha_que_desborda_da_400_con_el_campo(cliente, profesor, caso_publicado):
    grupo = Grupo.objects.create(nombre="Grupo parche", codigo=_codigo(), profesor=profesor)
    asignacion = CaseAssignment.objects.create(grupo=grupo, case_version=caso_publicado, assigned_by=profesor)

    resp = cliente.patch(
        f"{ASIGNACIONES}/{asignacion.id}", {"opensAt": "0001-01-01T00:00:00+01:00"}, format="json"
    )

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "opensAt"
