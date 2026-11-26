"""F2 · el orden en que un grupo hace los casos lo ve y lo decide su docente (RN-04, RF-14, RF-15).

Cada asignación guarda su lugar en la secuencia (``sort_order``) y el estudiante solo empieza un caso cuando terminó el
anterior (``apps/progression/access.py``). Antes, un caso recién asignado quedaba con orden 0, empatado con los demás, y
el docente no tenía cómo ordenarlos de una vez ni quién cerraba una lista ajena. Aquí se prueba que:

* un caso nuevo va al FINAL de la secuencia (no empata en 0);
* ``PUT /api/grupos/{id}/casos/orden`` fija el orden completo y el estudiante lo ve en su catálogo;
* un docente no reordena el grupo de otro, el ADMIN no escribe (la política de ``assignment.manage``) y una lista que no
  es la del grupo no cambia nada;
* el cambio deja su huella en la auditoría.
"""
import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, GrupoEstudiante
from apps.progression.access import catalog
from apps.simulation.models import CaseVersion, SimulationCase

pytestmark = [pytest.mark.req("RF-14"), pytest.mark.req("RN-04")]

User = get_user_model()
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
    resp = cliente.post("/api/grupos", {"nombre": nombre, "codigo": "F2-" + secrets.token_hex(4)}, format="json")
    assert resp.status_code == 201, resp.data
    return resp.data["data"]["id"]


def _version(autor, codigo, titulo):
    caso = SimulationCase.objects.create(code=codigo, title=titulo, created_by=autor)
    from django.utils import timezone

    return CaseVersion.objects.create(
        simulation_case=caso,
        semantic_version="1.0.0",
        status="PUBLISHED",
        created_by=autor,
        validated_at=timezone.now(),
        definition_hash="h" * 64,
    )


def _asignar(cliente, grupo_id, version_id, **extra):
    resp = cliente.post(
        ASIGNACIONES,
        {"caseVersionId": version_id, "target": {"type": "GROUP", "groupId": grupo_id}, **extra},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    return resp.data["data"]


@pytest.fixture
def escena(db):
    docente = _usuario("f2_docente@example.test", "PROFESOR")
    cliente = _cliente(docente)
    grupo_id = _grupo(cliente, "Grupo A")
    versiones = [_version(docente, f"F2-{n}", f"Caso {n}") for n in (1, 2, 3)]
    return docente, cliente, grupo_id, versiones


def test_un_caso_nuevo_va_al_final_de_la_secuencia_y_la_asignacion_trae_su_titulo(escena):
    _, cliente, grupo_id, versiones = escena

    primera = _asignar(cliente, grupo_id, versiones[0].id)
    segunda = _asignar(cliente, grupo_id, versiones[1].id)
    tercera = _asignar(cliente, grupo_id, versiones[2].id)

    assert [primera["sortOrder"], segunda["sortOrder"], tercera["sortOrder"]] == [1, 2, 3]
    assert segunda["caseTitle"] == "Caso 2"
    listado = cliente.get(ASIGNACIONES, {"groupId": grupo_id}).data["data"]
    assert [item["caseTitle"] for item in listado] == ["Caso 1", "Caso 2", "Caso 3"]


def test_un_orden_pedido_a_mano_se_respeta_y_el_siguiente_va_despues(escena):
    _, cliente, grupo_id, versiones = escena

    _asignar(cliente, grupo_id, versiones[0].id, sortOrder=40)
    siguiente = _asignar(cliente, grupo_id, versiones[1].id)

    assert siguiente["sortOrder"] == 41


def test_la_ruta_heredada_de_asignar_tambien_agrega_al_final(escena):
    _, cliente, grupo_id, versiones = escena
    _asignar(cliente, grupo_id, versiones[0].id)

    resp = cliente.post(f"/api/grupos/{grupo_id}/casos", {"caseVersionId": versiones[1].id}, format="json")

    assert resp.status_code == 200, resp.data
    orden = dict(CaseAssignment.objects.filter(grupo_id=grupo_id).values_list("case_version_id", "sort_order"))
    assert orden[versiones[1].id] > orden[versiones[0].id]


def test_reordenar_fija_el_orden_completo_y_lo_ve_el_estudiante(escena):
    docente, cliente, grupo_id, versiones = escena
    ids = [_asignar(cliente, grupo_id, v.id)["id"] for v in versiones]
    estudiante = _usuario("f2_estudiante@example.test", "ESTUDIANTE")
    GrupoEstudiante.objects.create(grupo_id=grupo_id, estudiante=estudiante, status="ACTIVE")

    nuevo = [ids[2], ids[0], ids[1]]
    resp = cliente.put(f"/api/grupos/{grupo_id}/casos/orden", {"assignmentIds": nuevo, "previousAssignmentIds": ids}, format="json")

    assert resp.status_code == 200, resp.data
    assert [(item["id"], item["sortOrder"]) for item in resp.data["data"]] == [(nuevo[0], 1), (nuevo[1], 2), (nuevo[2], 3)]
    assert [item["title"] for item in catalog(estudiante)] == ["Caso 3", "Caso 1", "Caso 2"]
    assert [item["allowed"] for item in catalog(estudiante)] == [True, False, False]


def test_reordenar_incluye_las_asignaciones_en_pausa(escena):
    _, cliente, grupo_id, versiones = escena
    ids = [_asignar(cliente, grupo_id, v.id)["id"] for v in versiones]
    assert cliente.patch(f"{ASIGNACIONES}/{ids[1]}", {"active": False}, format="json").status_code == 200

    resp = cliente.put(f"/api/grupos/{grupo_id}/casos/orden", {"assignmentIds": [ids[1], ids[2], ids[0]], "previousAssignmentIds": ids}, format="json")

    assert resp.status_code == 200, resp.data
    assert [item["id"] for item in resp.data["data"]] == [ids[1], ids[2], ids[0]]


@pytest.mark.parametrize("construir", ["falta una", "sobra una ajena", "repetida", "vacía"])
def test_una_lista_que_no_es_la_del_grupo_no_cambia_nada(escena, construir):
    docente, cliente, grupo_id, versiones = escena
    ids = [_asignar(cliente, grupo_id, v.id)["id"] for v in versiones]
    otro_grupo = _grupo(cliente, "Grupo B")
    ajena = _asignar(cliente, otro_grupo, versiones[0].id)["id"]
    lista = {
        "falta una": ids[:2],
        "sobra una ajena": [*ids, ajena],
        "repetida": [ids[0], ids[0], ids[1]],
        "vacía": [],
    }[construir]

    resp = cliente.put(f"/api/grupos/{grupo_id}/casos/orden", {"assignmentIds": lista, "previousAssignmentIds": ids}, format="json")

    assert resp.status_code in (400, 409), resp.data
    assert list(CaseAssignment.objects.filter(grupo_id=grupo_id).order_by("id").values_list("sort_order", flat=True)) == [1, 2, 3]


def test_un_docente_no_reordena_el_grupo_de_otro(escena):
    _, cliente, grupo_id, versiones = escena
    ids = [_asignar(cliente, grupo_id, v.id)["id"] for v in versiones]
    ajeno = _cliente(_usuario("f2_ajeno@example.test", "PROFESOR"))

    resp = ajeno.put(f"/api/grupos/{grupo_id}/casos/orden", {"assignmentIds": ids[::-1], "previousAssignmentIds": ids}, format="json")

    assert resp.status_code == 403
    assert list(CaseAssignment.objects.filter(grupo_id=grupo_id).order_by("id").values_list("sort_order", flat=True)) == [1, 2, 3]


@pytest.mark.parametrize("rol", ["ADMIN", "ESTUDIANTE"])
def test_ni_la_administracion_ni_un_estudiante_reordenan(escena, rol):
    _, cliente, grupo_id, versiones = escena
    ids = [_asignar(cliente, grupo_id, v.id)["id"] for v in versiones]
    otro = _cliente(_usuario(f"f2_{rol.lower()}@example.test", rol))

    resp = otro.put(f"/api/grupos/{grupo_id}/casos/orden", {"assignmentIds": ids[::-1], "previousAssignmentIds": ids}, format="json")

    assert resp.status_code == 403


def test_sin_sesion_no_se_reordena(escena):
    _, _, grupo_id, _ = escena

    assert APIClient().put(f"/api/grupos/{grupo_id}/casos/orden", {"assignmentIds": [1], "previousAssignmentIds": [1]}, format="json").status_code in (401, 403)


def test_un_grupo_que_no_existe_da_404(escena):
    _, cliente, _, _ = escena

    assert cliente.put("/api/grupos/999999/casos/orden", {"assignmentIds": [1], "previousAssignmentIds": [1]}, format="json").status_code == 404


def test_reordenar_deja_huella_en_la_auditoria(escena):
    from apps.simulation.models import AuditLog

    _, cliente, grupo_id, versiones = escena
    ids = [_asignar(cliente, grupo_id, v.id)["id"] for v in versiones]

    cliente.put(f"/api/grupos/{grupo_id}/casos/orden", {"assignmentIds": ids[::-1], "previousAssignmentIds": ids}, format="json")

    assert AuditLog.objects.filter(action="asignacion.reordenar").exists()



def test_reordenamiento_obsoleto_devuelve_orden_vigente(escena):
    _, cliente, grupo_id, versiones = escena
    ids = [_asignar(cliente, grupo_id, v.id)["id"] for v in versiones]
    url = f"/api/grupos/{grupo_id}/casos/orden"
    primera = cliente.put(url, {"assignmentIds": ids[::-1], "previousAssignmentIds": ids}, format="json")
    assert primera.status_code == 200, primera.data
    obsoleta = cliente.put(url, {"assignmentIds": [ids[1], ids[0], ids[2]], "previousAssignmentIds": ids}, format="json")
    assert obsoleta.status_code == 409
    assert obsoleta.data["code"] == "ASSIGNMENT_ORDER_STALE"
    assert obsoleta.data["currentAssignmentIds"] == ids[::-1]


def test_empate_usa_id_del_caso_tambien_al_renumerar(escena):
    from apps.grupos.assignment_service import next_sort_order
    from django.db import transaction

    _, cliente, grupo_id, versiones = escena
    # La versión del caso más antiguo puede ser posterior a la del segundo.
    clon = _version(versiones[0].created_by, "F2-CLON", "Auxiliar")
    clon.simulation_case = versiones[0].simulation_case
    clon.semantic_version = "2.0.0"
    clon.save(update_fields=["simulation_case", "semantic_version"])
    a = _asignar(cliente, grupo_id, clon.id, sortOrder=0)
    b = _asignar(cliente, grupo_id, versiones[1].id, sortOrder=0)
    _asignar(cliente, grupo_id, versiones[2].id, sortOrder=1000)
    listado = cliente.get(ASIGNACIONES, {"groupId": grupo_id}).data["data"]
    assert [x["id"] for x in listado[:2]] == [a["id"], b["id"]]
    assert listado[0]["caseId"] == versiones[0].simulation_case_id
    with transaction.atomic():
        next_sort_order(grupo_id)
    assert list(CaseAssignment.objects.filter(id__in=[a["id"], b["id"]]).order_by("sort_order").values_list("id", flat=True)) == [a["id"], b["id"]]


def test_dos_creaciones_concurrentes_no_comparten_orden(monkeypatch, real_commits):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier, Event
    from django.db import close_old_connections
    from apps.grupos import assignment_service

    sufijo = secrets.token_hex(6)
    docente = _usuario(f"f5_{sufijo}@example.test", "PROFESOR")
    grupo_id = _grupo(_cliente(docente), "Concurrente")
    versiones = [_version(docente, f"F5-{sufijo}-{n}", f"Caso {n}") for n in (1, 2)]
    inicio = Barrier(2)
    calculado = Event()
    original = assignment_service.next_sort_order

    def retardar(grupo):
        orden = original(grupo)
        if not calculado.is_set():
            calculado.set()
            # Sin el bloqueo del grupo, la otra transacción calcula el mismo número durante esta espera.
            segundo_calculo.wait(1)
        else:
            segundo_calculo.set()
        return orden

    segundo_calculo = Event()
    monkeypatch.setattr(assignment_service, "next_sort_order", retardar)

    def crear(version_id):
        close_old_connections()
        try:
            inicio.wait(timeout=5)
            return assignment_service.create_assignment(docente, {
                "caseVersionId": version_id, "target": {"type": "GROUP", "groupId": grupo_id}
            }).sort_order
        finally:
            close_old_connections()

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            ordenes = list(executor.map(crear, [v.id for v in versiones]))
        assert sorted(ordenes) == [1, 2]
    finally:
        from apps.grupos.models import Grupo
        from apps.simulation.models import AuditLog
        from shared.testing import purge_audit_rows
        Grupo.objects.filter(pk=grupo_id).delete()
        SimulationCase.objects.filter(pk__in=[v.simulation_case_id for v in versiones]).delete()
        purge_audit_rows(AuditLog.objects.filter(actor_id=docente.pk))
        docente.delete()
