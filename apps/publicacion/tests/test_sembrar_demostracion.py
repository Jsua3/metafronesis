import secrets
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.publicacion.huella import huella_de
from apps.simulation.models import CaseVersion, SimulationAttempt, SimulationRubricAssignment
from apps.users.models import CustomUser, PermisoDeAutoria
from shared.policies import ADMIN, ESTUDIANTE, PROFESOR

pytestmark = pytest.mark.django_db
DOMINIO = "@demo.metafronesis.test"


@pytest.fixture
def clave(monkeypatch):
    valor = "Sm" + secrets.token_urlsafe(18) + "9"
    monkeypatch.setenv("SIEP_SEMILLA_CLAVE", valor)
    return valor


@pytest.fixture
def admin():
    return CustomUser.objects.create_user(email="administracion@example.test", password=secrets.token_urlsafe(20), role=ADMIN,
                                          nombre="Admin", apellido="Prueba")


def sembrar(admin, *extra):
    salida = StringIO()
    call_command("sembrar_demostracion", "--publicador", admin.email, *extra, stdout=salida)
    return salida.getvalue()


def cuentas_demo():
    return CustomUser.objects.filter(email__endswith=DOMINIO)


@pytest.mark.req("SIEP-234")
def test_sin_confirmar_se_niega_y_no_escribe(admin, clave):
    with pytest.raises(CommandError, match="--confirmar"):
        sembrar(admin)
    assert not cuentas_demo().exists() and not Grupo.objects.exists()


@pytest.mark.req("SIEP-234")
@pytest.mark.parametrize("valor", [None, "corta"])
def test_sin_clave_o_con_clave_debil_se_niega(admin, monkeypatch, valor):
    if valor is None:
        monkeypatch.delenv("SIEP_SEMILLA_CLAVE", raising=False)
    else:
        monkeypatch.setenv("SIEP_SEMILLA_CLAVE", valor)
    with pytest.raises(CommandError, match="SIEP_SEMILLA_CLAVE"):
        sembrar(admin, "--confirmar")
    assert not cuentas_demo().exists() and not Grupo.objects.exists() and not CaseVersion.objects.exists()


@pytest.mark.req("SIEP-234")
def test_el_publicador_debe_ser_un_admin_existente(clave):
    with pytest.raises(CommandError, match="administrador"):
        call_command("sembrar_demostracion", "--confirmar", "--publicador", "nadie@example.test")
    assert not cuentas_demo().exists()


@pytest.mark.req("SIEP-234")
def test_siembra_completa(admin, clave):
    sembrar(admin, "--confirmar")
    assert cuentas_demo().filter(role=PROFESOR).count() == 3
    assert cuentas_demo().filter(role=ESTUDIANTE).count() == 12
    assert not CustomUser.objects.filter(role=ADMIN).exclude(pk=admin.pk).exists()
    assert PermisoDeAutoria.objects.filter(docente__in=cuentas_demo().filter(role=PROFESOR)).count() == 3
    for cuenta in cuentas_demo():
        assert cuenta.must_change_password and cuenta.temp_password_set_at is not None
        assert cuenta.check_password(clave)
    grupos = Grupo.objects.filter(codigo__startswith="DEMO-")
    assert grupos.count() == 3
    assert set(grupos.values_list("nombre", flat=True)) == {
        "Psicología Social · Grupo A", "Psicología Social · Grupo B", "Práctica en Atención Psicosocial"}
    for grupo in grupos:
        assert grupo.profesor.role == PROFESOR and grupo.profesor.email.endswith(DOMINIO)
        assert GrupoEstudiante.objects.filter(grupo=grupo, status="ACTIVE").count() >= 4


@pytest.mark.req("SIEP-234")
def test_caso_insignia_publicado_con_rubrica_y_asignado(admin, clave):
    sembrar(admin, "--confirmar")
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-002")
    assert version.status == "PUBLISHED" and version.estimated_minutes == 40
    assert version.definition_hash == huella_de(version)
    asignacion = SimulationRubricAssignment.objects.get(case_version=version, active=True)
    criterios = list(asignacion.rubric.criteria.order_by("display_order"))
    assert [c.title for c in criterios] == [
        "Primeros auxilios psicológicos", "Valoración del riesgo", "Información de derechos y rutas de atención",
        "Derivación", "Escucha sin revictimización"]
    assert sum(c.weight for c in criterios) == 100
    assert all(c.competency_ref_id and len(c.level_descriptors_json) > 50 for c in criterios)
    asignados = CaseAssignment.objects.filter(case_version=version, active=True)
    assert set(asignados.values_list("grupo__codigo", flat=True)) == set(Grupo.objects.filter(codigo__startswith="DEMO-").values_list("codigo", flat=True))


@pytest.mark.req("SIEP-234")
def test_un_estudiante_sembrado_puede_empezar_el_caso(admin, clave):
    sembrar(admin, "--confirmar")
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-002")
    for estudiante in cuentas_demo().filter(role=ESTUDIANTE):
        cliente = APIClient()
        cliente.force_authenticate(estudiante)
        casos = cliente.get("/api/simulation/cases")
        assert casos.status_code == 200 and any(c.get("code") == "SIM-VBG-002" or c.get("simulation_case") for c in casos.data)
        inicio = cliente.post("/api/simulation/attempts", {"case_version_id": version.pk}, format="json")
        assert inicio.status_code == 201, inicio.data
        estado = cliente.get(f"/api/simulation/attempts/{inicio.data['id']}/state")
        assert estado.status_code == 200, estado.data
        intento = SimulationAttempt.objects.get(pk=inicio.data["id"])
        assert intento.current_node.start_node and intento.case_version_id == version.pk


@pytest.mark.req("SIEP-234")
def test_es_idempotente_y_no_cambia_claves_existentes(admin, clave, monkeypatch):
    sembrar(admin, "--confirmar")
    foto = {
        "cuentas": CustomUser.objects.count(), "hashes": dict(cuentas_demo().values_list("email", "password")),
        "grupos": Grupo.objects.count(), "miembros": GrupoEstudiante.objects.count(),
        "versiones": CaseVersion.objects.count(), "asignaciones": CaseAssignment.objects.count(),
        "rubricas": SimulationRubricAssignment.objects.count(),
    }
    monkeypatch.setenv("SIEP_SEMILLA_CLAVE", "Otra" + secrets.token_urlsafe(18) + "7")
    salida = sembrar(admin, "--confirmar")
    assert foto == {
        "cuentas": CustomUser.objects.count(), "hashes": dict(cuentas_demo().values_list("email", "password")),
        "grupos": Grupo.objects.count(), "miembros": GrupoEstudiante.objects.count(),
        "versiones": CaseVersion.objects.count(), "asignaciones": CaseAssignment.objects.count(),
        "rubricas": SimulationRubricAssignment.objects.count(),
    }
    assert "Creado (0)" in salida


@pytest.mark.req("SIEP-234")
def test_la_salida_no_contiene_la_clave_y_si_los_correos(admin, clave):
    salida = sembrar(admin, "--confirmar")
    assert clave not in salida
    assert "laura.mendoza" + DOMINIO in salida and "valentina.rios" + DOMINIO in salida
