"""P7 · La invitación dice cuántos casos tiene el grupo (solo a quien ya es miembro).

Con esto la pantalla del estudiante distingue «aceptaste y el grupo aún no tiene casos» de «aceptaste y ya hay casos», sin
adivinar con el catálogo (que mezcla todos sus grupos y sus asignaciones directas). El número es el mismo criterio del
catálogo: asignación activa, versión publicada y validada, caso activo, una vez por versión.
"""

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante, MembershipStatus
from apps.simulation.models import CaseVersion, SimulationCase

User = get_user_model()
HASH = "sha256:" + "a" * 64


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def docente(db):
    return User.objects.create_user(email="doc_p7@x.com", password="pass1234", nombre="Paula", apellido="Ríos", role="PROFESOR")


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(email="est_p7@x.com", password="pass1234", nombre="E", apellido="S", role="ESTUDIANTE")


@pytest.fixture
def otra_estudiante(db):
    return User.objects.create_user(email="est2_p7@x.com", password="pass1234", nombre="O", apellido="T", role="ESTUDIANTE")


def _grupo(docente, nombre, codigo, **extra):
    return Grupo.objects.create(nombre=nombre, codigo=codigo, profesor=docente, **extra)


def _version(docente, codigo, *, publicada=True, caso_activo=True):
    caso = SimulationCase.objects.create(code=codigo, title=f"Caso {codigo}", created_by=docente, active=caso_activo)
    datos = {"validated_at": timezone.now(), "definition_hash": HASH} if publicada else {}
    return CaseVersion.objects.create(
        simulation_case=caso, semantic_version="1.0.0", status="PUBLISHED" if publicada else "DRAFT", created_by=docente, **datos
    )


def _asignar(grupo, version, **extra):
    return CaseAssignment.objects.create(grupo=grupo, case_version=version, **extra)


def _membresia(grupo, estudiante, status):
    return GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante, status=status, invited_at=timezone.now())


def _lista(estudiante):
    return {fila["groupId"]: fila for fila in cl(estudiante).get("/api/me/invitations").data["data"]}


def test_el_miembro_ve_cuantos_casos_tiene_su_grupo(docente, estudiante):
    grupo = _grupo(docente, "Grupo con casos", "P7A")
    _asignar(grupo, _version(docente, "P7-1"), sort_order=1)
    _asignar(grupo, _version(docente, "P7-2"), sort_order=2)
    _membresia(grupo, estudiante, MembershipStatus.ACTIVE)

    assert _lista(estudiante)[grupo.id]["casesCount"] == 2


def test_un_grupo_sin_casos_dice_cero_y_no_nulo(docente, estudiante):
    grupo = _grupo(docente, "Grupo vacío", "P7B")
    _membresia(grupo, estudiante, MembershipStatus.ACTIVE)

    assert _lista(estudiante)[grupo.id]["casesCount"] == 0


def test_antes_de_aceptar_no_se_adelanta_lo_que_el_grupo_contiene(docente, estudiante):
    grupo = _grupo(docente, "Pendiente", "P7C")
    _asignar(grupo, _version(docente, "P7-3"))
    _membresia(grupo, estudiante, MembershipStatus.INVITED)

    assert _lista(estudiante)[grupo.id]["casesCount"] is None


def test_solo_cuentan_los_casos_que_el_catalogo_si_mostraria(docente, estudiante):
    grupo = _grupo(docente, "Mezcla", "P7D")
    _asignar(grupo, _version(docente, "P7-OK"))
    _asignar(grupo, _version(docente, "P7-BORRADOR", publicada=False))
    _asignar(grupo, _version(docente, "P7-INACTIVO", caso_activo=False))
    _asignar(grupo, _version(docente, "P7-PAUSA"), active=False)
    _asignar(grupo, _version(docente, "P7-DOS"), sort_order=2)
    _membresia(grupo, estudiante, MembershipStatus.ACTIVE)

    assert _lista(estudiante)[grupo.id]["casesCount"] == 2


def test_un_grupo_desactivado_no_cuenta_casos(docente, estudiante):
    grupo = _grupo(docente, "Apagado", "P7E", activo=False)
    _asignar(grupo, _version(docente, "P7-4"))
    _membresia(grupo, estudiante, MembershipStatus.ACTIVE)

    assert _lista(estudiante)[grupo.id]["casesCount"] == 0


def test_cada_grupo_cuenta_lo_suyo_y_no_lo_de_otros(docente, estudiante, otra_estudiante):
    uno = _grupo(docente, "Uno", "P7F")
    dos = _grupo(docente, "Dos", "P7G")
    _asignar(uno, _version(docente, "P7-5"))
    _asignar(dos, _version(docente, "P7-6"))
    _asignar(dos, _version(docente, "P7-7"))
    _membresia(uno, estudiante, MembershipStatus.ACTIVE)
    _membresia(dos, otra_estudiante, MembershipStatus.ACTIVE)

    lista = _lista(estudiante)
    assert set(lista) == {uno.id}
    assert lista[uno.id]["casesCount"] == 1


def test_aceptar_devuelve_el_conteo_del_grupo_en_la_misma_respuesta(docente, estudiante):
    con_casos = _grupo(docente, "Con casos", "P7H")
    _asignar(con_casos, _version(docente, "P7-8"))
    vacio = _grupo(docente, "Sin casos", "P7I")
    _membresia(con_casos, estudiante, MembershipStatus.INVITED)
    _membresia(vacio, estudiante, MembershipStatus.INVITED)

    primera = cl(estudiante).post(f"/api/me/invitations/{con_casos.id}/accept", {}, format="json")
    segunda = cl(estudiante).post(f"/api/me/invitations/{vacio.id}/accept", {}, format="json")

    assert primera.status_code == segunda.status_code == 200
    assert primera.data["data"]["status"] == "ACTIVE"
    assert primera.data["data"]["casesCount"] == 1
    assert segunda.data["data"]["casesCount"] == 0


def test_rechazar_y_salir_no_traen_conteo(docente, estudiante):
    grupo = _grupo(docente, "Rechazado", "P7J")
    _asignar(grupo, _version(docente, "P7-9"))
    _membresia(grupo, estudiante, MembershipStatus.INVITED)

    rechazo = cl(estudiante).post(f"/api/me/invitations/{grupo.id}/decline", {}, format="json")

    assert rechazo.data["data"]["status"] == "DECLINED"
    assert rechazo.data["data"]["casesCount"] is None


def test_la_lista_no_pregunta_los_casos_fila_por_fila(docente, estudiante, django_assert_max_num_queries):
    for n in range(5):
        grupo = _grupo(docente, f"G{n}", f"P7K{n}")
        _asignar(grupo, _version(docente, f"P7-L{n}"))
        _membresia(grupo, estudiante, MembershipStatus.ACTIVE)

    # Una consulta de sesión/usuario, una de membresías y una de conteos: el número no crece con los grupos.
    with django_assert_max_num_queries(6):
        resp = cl(estudiante).get("/api/me/invitations")

    assert [fila["casesCount"] for fila in resp.data["data"]] == [1] * 5
