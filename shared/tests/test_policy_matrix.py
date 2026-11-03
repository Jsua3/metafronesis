"""La matriz de políticas (E2-1, §2.5 del plan estructural) como tabla ejecutable.

La tabla ``EXPECTED`` está escrita **a mano aquí** (es la matriz base de §2.5) y se
contrasta con la implementación: cambiar un permiso sin cambiar esta tabla falla, y la
evidencia versionada (``shared/policy-matrix.json``) debe coincidir con lo que rinde
``render_matrix()``.
"""
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.views import APIView

from shared import policies
from shared.permissions import policy_permission

pytestmark = [pytest.mark.req("RF-02"), pytest.mark.req("RNF-002")]

ADMIN, PROFESOR, ESTUDIANTE = "ADMIN", "PROFESOR", "ESTUDIANTE"
ME = 7  # id del actor en toda la tabla


def actor(role):
    return SimpleNamespace(id=ME, role=role, is_authenticated=True)


# (recurso, acción, rol, hechos, ¿permitido?) — matriz base de §2.5, transcrita a mano.
EXPECTED = [
    # Intento propio: jugar, pausar, bitácora, reporte → solo su dueño estudiante.
    ("attempt", "play", ESTUDIANTE, {"owner_id": ME}, True),
    ("attempt", "play", ESTUDIANTE, {"owner_id": 99}, False),
    ("attempt", "play", PROFESOR, {"owner_id": ME}, False),
    ("attempt", "play", ADMIN, {"owner_id": ME}, False),
    # Intento ajeno: traza y evaluación → profesor solo con alcance (membresía ACTIVE); ADMIN todos.
    ("attempt", "review", ESTUDIANTE, {"member": True}, False),
    ("attempt", "review", PROFESOR, {"member": True}, True),
    ("attempt", "review", PROFESOR, {"member": False}, False),
    ("attempt", "review", ADMIN, {}, True),
    # Reporte de finalización de un intento: su dueño, el docente con alcance o el ADMIN.
    ("attempt", "report", ESTUDIANTE, {"owner_id": ME}, True),
    ("attempt", "report", ESTUDIANTE, {"owner_id": 99}, False),
    ("attempt", "report", PROFESOR, {"member": True}, True),
    ("attempt", "report", PROFESOR, {"member": False}, False),
    ("attempt", "report", ADMIN, {}, True),
    # Caso: crear/editar, enviar a revisión y archivar → profesor sus casos; ADMIN todos.
    ("case", "author", ESTUDIANTE, {"owner_id": ME}, False),
    ("case", "author", PROFESOR, {"owner_id": ME}, True),
    ("case", "author", PROFESOR, {"owner_id": 99}, False),
    ("case", "author", ADMIN, {"owner_id": 99}, True),
    ("case", "submit", PROFESOR, {"owner_id": ME}, True),
    ("case", "submit", PROFESOR, {"owner_id": 99}, False),
    ("case", "submit", ADMIN, {"owner_id": 99}, True),
    ("case", "archive", PROFESOR, {"owner_id": ME}, True),
    ("case", "archive", PROFESOR, {"owner_id": 99}, False),
    ("case", "archive", ADMIN, {"owner_id": 99}, True),
    ("case", "archive", ESTUDIANTE, {"owner_id": ME}, False),
    # Caso: publicar → solo ADMIN (tras revisión).
    ("case", "publish", PROFESOR, {"owner_id": ME}, False),
    ("case", "publish", ESTUDIANTE, {}, False),
    ("case", "publish", ADMIN, {}, True),
    # Grupo: administrar → profesor los suyos; el ADMIN solo lista.
    ("group", "manage", PROFESOR, {"owner_id": ME}, True),
    ("group", "manage", PROFESOR, {"owner_id": 99}, False),
    ("group", "manage", ADMIN, {"owner_id": 99}, False),
    ("group", "manage", ESTUDIANTE, {"owner_id": ME}, False),
    ("group", "list", PROFESOR, {"owner_id": ME}, True),
    ("group", "list", PROFESOR, {"owner_id": 99}, False),
    ("group", "list", ADMIN, {}, True),
    ("group", "list", ESTUDIANTE, {}, False),
    # Membresía: invitar → profesor (sus grupos) o ADMIN; aceptar/rechazar → la propia o ADMIN.
    ("membership", "invite", PROFESOR, {"owner_id": ME}, True),
    ("membership", "invite", PROFESOR, {"owner_id": 99}, False),
    ("membership", "invite", ADMIN, {}, True),
    ("membership", "invite", ESTUDIANTE, {"owner_id": ME}, False),
    ("membership", "respond", ESTUDIANTE, {"owner_id": ME}, True),
    ("membership", "respond", ESTUDIANTE, {"owner_id": 99}, False),
    ("membership", "respond", PROFESOR, {"owner_id": ME}, False),
    ("membership", "respond", ADMIN, {}, True),
    # Asignación: crear/cerrar → profesor (sus grupos); el ADMIN solo lista.
    ("assignment", "manage", PROFESOR, {"owner_id": ME}, True),
    ("assignment", "manage", PROFESOR, {"owner_id": 99}, False),
    ("assignment", "manage", ADMIN, {"owner_id": ME}, False),
    ("assignment", "manage", ESTUDIANTE, {"owner_id": ME}, False),
    ("assignment", "list", PROFESOR, {"owner_id": ME}, True),
    ("assignment", "list", ADMIN, {}, True),
    ("assignment", "list", ESTUDIANTE, {}, False),
    # Rúbrica: leer → profesor y ADMIN; editar → las suyas (profesor) o todas (ADMIN).
    ("rubric", "read", PROFESOR, {}, True),
    ("rubric", "read", ADMIN, {}, True),
    ("rubric", "read", ESTUDIANTE, {}, False),
    ("rubric", "edit", PROFESOR, {"owner_id": ME}, True),
    ("rubric", "edit", PROFESOR, {"owner_id": 99}, False),
    ("rubric", "edit", ADMIN, {"owner_id": 99}, True),
    ("rubric", "edit", ESTUDIANTE, {"owner_id": ME}, False),
    # Rúbrica global por defecto: solo ADMIN.
    ("rubric", "default", ADMIN, {}, True),
    ("rubric", "default", PROFESOR, {"owner_id": ME}, False),
    ("rubric", "default", ESTUDIANTE, {}, False),
    # Competencias (E3-9): leer el catálogo → personal; ampliarlo → solo ADMIN.
    ("competency", "read", PROFESOR, {}, True),
    ("competency", "read", ADMIN, {}, True),
    ("competency", "read", ESTUDIANTE, {}, False),
    ("competency", "manage", ADMIN, {}, True),
    ("competency", "manage", PROFESOR, {}, False),
    ("competency", "manage", ESTUDIANTE, {}, False),
    # Usuario: crear, activar, cambiar rol → solo ADMIN.
    ("user", "manage", ADMIN, {}, True),
    ("user", "manage", PROFESOR, {}, False),
    ("user", "manage", ESTUDIANTE, {}, False),
    # Analítica: agregados → profesor sus grupos (k ≥ 5); ADMIN todos.
    ("analytics", "read", PROFESOR, {"member": True}, True),
    ("analytics", "read", PROFESOR, {"member": False}, False),
    ("analytics", "read", ADMIN, {}, True),
    ("analytics", "read", ESTUDIANTE, {"member": True}, False),
    # Auditoría: leer → solo ADMIN.
    ("audit", "read", ADMIN, {}, True),
    ("audit", "read", PROFESOR, {}, False),
    ("audit", "read", ESTUDIANTE, {}, False),
    # Consentimiento al aviso de contenido (S3-2a, C12): solo el estudiante y solo el suyo; el ADMIN y el docente no juegan.
    ("consent", "read", ESTUDIANTE, {"owner_id": ME}, True),
    ("consent", "read", ESTUDIANTE, {"owner_id": 99}, False),
    ("consent", "read", PROFESOR, {"owner_id": ME}, False),
    ("consent", "read", ADMIN, {"owner_id": ME}, False),
    ("consent", "record", ESTUDIANTE, {"owner_id": ME}, True),
    ("consent", "record", ESTUDIANTE, {"owner_id": 99}, False),
    ("consent", "record", PROFESOR, {"owner_id": ME}, False),
    ("consent", "record", ADMIN, {"owner_id": ME}, False),
    # Lecturas de todo usuario autenticado (catálogo, su propia cuenta).
    ("catalog", "read", ESTUDIANTE, {}, True),
    ("catalog", "read", PROFESOR, {}, True),
    ("catalog", "read", ADMIN, {}, True),
    ("account", "self", ESTUDIANTE, {}, True),
    ("account", "self", PROFESOR, {}, True),
    ("account", "self", ADMIN, {}, True),
]


@pytest.mark.parametrize("resource,action,role,facts,allowed", EXPECTED)
def test_matrix_matches_section_2_5(resource, action, role, facts, allowed):
    assert policies.can(actor(role), resource, action, **facts) is allowed


def test_every_matrix_row_is_covered_by_the_hand_written_table():
    """Agregar una fila a MATRIX sin transcribirla aquí (y en §2.5) falla."""
    covered = {(resource, action) for resource, action, *_ in EXPECTED}
    assert covered == set(policies.MATRIX)


@pytest.mark.parametrize("anonymous", [None, SimpleNamespace(is_authenticated=False, role=None, id=None)])
def test_anonymous_is_never_allowed(anonymous):
    for resource, action in policies.MATRIX:
        assert policies.can(anonymous, resource, action, owner_id=ME, member=True) is False


def test_unknown_role_is_never_allowed():
    ghost = SimpleNamespace(id=ME, role="ROOT", is_authenticated=True)
    for resource, action in policies.MATRIX:
        assert policies.can(ghost, resource, action, owner_id=ME, member=True) is False


def test_unknown_policy_is_a_programming_error_not_a_silent_deny():
    with pytest.raises(KeyError):
        policies.can(actor(ADMIN), "case", "transmute")


def test_allowed_roles_lists_the_roles_with_some_scope():
    assert policies.allowed_roles("case", "publish") == frozenset({ADMIN})
    assert policies.allowed_roles("group", "manage") == frozenset({PROFESOR})
    assert policies.allowed_roles("attempt", "play") == frozenset({ESTUDIANTE})


def test_committed_evidence_matches_the_executable_matrix():
    """``shared/policy-matrix.json`` es evidencia de RF-02/RNF-002: se regenera con
    ``python -m shared.policies --write`` y esta prueba falla si quedó desactualizada."""
    committed = json.loads(Path(policies.__file__).with_name("policy-matrix.json").read_text(encoding="utf-8"))
    assert committed == policies.render_matrix()


# ─── Las clases de permiso de DRF salen de la matriz ───────────────────────────────────
class _PublishView(APIView):
    permission_classes = [policy_permission("case", "publish")]

    def get(self, request):
        return Response({"ok": True})


@pytest.mark.parametrize(
    "role,expected",
    [(ADMIN, 200), (PROFESOR, 403), (ESTUDIANTE, 403)],
)
def test_policy_permission_gates_by_role(role, expected):
    request = APIRequestFactory().get("/x")
    force_authenticate(request, user=actor(role))
    assert _PublishView.as_view()(request).status_code == expected


def test_policy_permission_without_authentication_is_401():
    request = APIRequestFactory().get("/x")
    assert _PublishView.as_view()(request).status_code == 401


def test_policy_permission_exposes_its_policy_for_introspection():
    assert policy_permission("case", "publish").policy == ("case", "publish")
    assert _PublishView.permission_classes[0].policy == ("case", "publish")


def test_scope_of_exposes_the_role_scope_for_filtering_lists():
    assert policies.scope_of(actor(PROFESOR), "case", "author") == "own"
    assert policies.scope_of(actor(ADMIN), "case", "author") == "all"
    assert policies.scope_of(actor(ESTUDIANTE), "case", "author") is None
    assert policies.scope_of(None, "case", "author") is None
