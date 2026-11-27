"""Invitar por correo o por nombre de usuario, con sugerencias mientras el docente escribe."""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.grupos.models import Grupo, GrupoEstudiante, MembershipStatus
from apps.simulation.models import AuditLog

User = get_user_model()


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _usuario(email, role="ESTUDIANTE", **extra):
    return User.objects.create_user(
        email=email, password="pass1234", nombre=extra.pop("nombre", "Ana"),
        apellido=extra.pop("apellido", "Rojas"), role=role, **extra,
    )


@pytest.fixture
def profesor(db):
    return _usuario("prof_sug@x.com", role="PROFESOR")


@pytest.fixture
def grupo(profesor):
    return Grupo.objects.create(nombre="G", codigo="SUG1", profesor=profesor)


def _sugerencias(user, grupo, q):
    return cl(user).get(f"/api/grupos/{grupo.id}/estudiantes/sugerencias", {"q": q})


def test_sugiere_estudiantes_por_correo_o_usuario_con_solo_nombre_usuario_y_correo(profesor, grupo):
    _usuario("eangel@uni.edu", nombre="Emerson", apellido="Ángel")
    _usuario("otra@uni.edu")

    resp = _sugerencias(profesor, grupo, "eang")

    assert resp.status_code == 200
    assert resp.data["data"] == [{"nombre": "Emerson Ángel", "usuario": "eangel", "email": "eangel@uni.edu"}]
    assert AuditLog.objects.filter(action="STUDENT_SUGGESTIONS_VIEWED").exists()


def test_con_menos_de_dos_caracteres_no_sugiere_nada(profesor, grupo):
    _usuario("eangel@uni.edu")
    assert _sugerencias(profesor, grupo, "e").data["data"] == []
    assert _sugerencias(profesor, grupo, "  ").data["data"] == []


def test_no_sugiere_docentes_cuentas_inactivas_ni_quienes_ya_estan_en_el_grupo(profesor, grupo):
    _usuario("doc_ana@uni.edu", role="PROFESOR")
    _usuario("inactiva_ana@uni.edu", activo=False)
    miembro = _usuario("miembro_ana@uni.edu")
    invitada = _usuario("invitada_ana@uni.edu")
    retirada = _usuario("retirada_ana@uni.edu")
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=miembro, status=MembershipStatus.ACTIVE)
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=invitada, status=MembershipStatus.INVITED)
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=retirada, status=MembershipStatus.REMOVED)

    correos = [s["email"] for s in _sugerencias(profesor, grupo, "ana@").data["data"]]

    assert correos == ["retirada_ana@uni.edu"]


def test_devuelve_pocos_resultados(profesor, grupo):
    for i in range(12):
        _usuario(f"est{i:02d}@uni.edu")
    assert len(_sugerencias(profesor, grupo, "est").data["data"]) == 8


def test_solo_el_docente_del_grupo_puede_pedir_sugerencias(profesor, grupo):
    _usuario("eangel@uni.edu")
    estudiante = _usuario("curioso@uni.edu")
    otro = _usuario("prof_otro@x.com", role="PROFESOR")

    assert _sugerencias(estudiante, grupo, "eang").status_code == 403
    assert _sugerencias(otro, grupo, "eang").status_code == 400
    assert APIClient().get(f"/api/grupos/{grupo.id}/estudiantes/sugerencias", {"q": "eang"}).status_code == 401


@pytest.mark.parametrize("identificador", ["eangel", "EAngel", "eangel@uni.edu"])
def test_invita_por_nombre_de_usuario_o_por_correo(profesor, grupo, identificador):
    estudiante = _usuario("eangel@uni.edu")

    resp = cl(profesor).post(f"/api/grupos/{grupo.id}/estudiantes", {"email": identificador}, format="json")

    assert resp.status_code == 200
    assert GrupoEstudiante.objects.get(grupo=grupo, estudiante=estudiante).status == MembershipStatus.INVITED
    assert AuditLog.objects.filter(action="MEMBERSHIP_INVITED").exists()


def test_un_usuario_ambiguo_o_inexistente_no_invita_a_nadie_y_responde_igual(profesor, grupo):
    _usuario("ana@uni.edu")
    _usuario("ana@otra.edu")

    ambiguo = cl(profesor).post(f"/api/grupos/{grupo.id}/estudiantes", {"email": "ana"}, format="json")
    inexistente = cl(profesor).post(f"/api/grupos/{grupo.id}/estudiantes", {"email": "nadie"}, format="json")

    assert ambiguo.status_code == inexistente.status_code == 200
    assert ambiguo.data["message"] == inexistente.data["message"]
    assert not GrupoEstudiante.objects.filter(grupo=grupo).exists()


@pytest.mark.parametrize("identificador", ["", "con espacio", "a@b"])
def test_rechaza_lo_que_no_es_correo_ni_usuario(profesor, grupo, identificador):
    resp = cl(profesor).post(f"/api/grupos/{grupo.id}/estudiantes", {"email": identificador}, format="json")
    assert resp.status_code == 400
