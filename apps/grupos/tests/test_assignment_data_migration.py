"""E3-1 · La copia de ``grupo_case_version`` a ``case_assignments`` corre sobre filas reales (Review Focus 6).

Las migraciones 0004 (datos) y 0005 (retiro de la tabla vieja) se prueban con el ejecutor de
migraciones sobre la base de la propia prueba: se vuelve a la 0003 (que recrea la tabla vieja),
se siembran filas **de verdad** en ella y se avanza otra vez. Todo ocurre dentro de la transacción
de la prueba (el DDL de PostgreSQL es transaccional), así que la siembra de la base no se toca.
"""
import datetime

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from apps.grupos.models import CaseAssignment, Grupo
from apps.simulation.models import CaseVersion, SimulationCase

pytestmark = [pytest.mark.django_db, pytest.mark.req("RF-14"), pytest.mark.req("RNF-08")]

User = get_user_model()
BEFORE_COPY = [("grupos", "0003_case_assignments")]
AFTER_RETIRE = [("grupos", "0005_drop_grupo_case_version")]


def _migrate(targets):
    executor = MigrationExecutor(connection)
    executor.migrate(targets)
    return MigrationExecutor(connection)  # el grafo y el estado ya recargados


@pytest.fixture
def populated():
    """Dos grupos y dos versiones, con las asignaciones de hoy ya borradas del nuevo esquema."""
    owner = User.objects.create_user(
        email="mig_owner@x.com", password="x", nombre="Mi", apellido="Gr", role="PROFESOR"
    )
    groups = [
        Grupo.objects.create(nombre=f"Mig {n}", codigo=f"MIG{n}", profesor=owner) for n in (1, 2)
    ]
    versions = []
    for n in (1, 2):
        case = SimulationCase.objects.create(code=f"MIG-CASE-{n}", title=f"Caso {n}", created_by=owner)
        versions.append(
            CaseVersion.objects.create(
                simulation_case=case, semantic_version="1.0.0", status="PUBLISHED", created_by=owner
            )
        )
    CaseAssignment.objects.all().delete()
    return groups, versions


def test_old_group_rows_become_group_assignments_and_the_old_table_goes_away(populated):
    groups, versions = populated
    executor = _migrate(BEFORE_COPY)  # recrea ``grupo_case_version`` (y copia hacia atrás lo que hubiera)
    old_apps = executor.loader.project_state(BEFORE_COPY).apps
    Old = old_apps.get_model("grupos", "GrupoCaseVersion")
    when = datetime.datetime(2026, 9, 1, 8, 30, 0)
    Old.objects.bulk_create([
        Old(grupo_id=groups[0].id, case_version_id=versions[0].id, assigned_at=when),
        Old(grupo_id=groups[0].id, case_version_id=versions[1].id, assigned_at=None),
        Old(grupo_id=groups[1].id, case_version_id=versions[0].id, assigned_at=when),
    ])
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")  # sin eventos de FK pendientes antes del DDL

    _migrate(AFTER_RETIRE)

    mine = CaseAssignment.objects.filter(grupo_id__in=[g.id for g in groups]).order_by("grupo_id", "case_version_id")
    assert [(a.grupo_id, a.case_version_id) for a in mine] == [
        (groups[0].id, versions[0].id), (groups[0].id, versions[1].id), (groups[1].id, versions[0].id),
    ]
    assert all(a.estudiante_id is None and a.active and a.sort_order == 0 for a in mine)
    assert all(a.opens_at is None and a.closes_at is None for a in mine)
    assert mine[0].assigned_at == when and mine[2].assigned_at == when
    assert mine[1].assigned_at is None  # lo que no tenía fecha sigue sin fecha
    with connection.cursor() as cursor:
        cursor.execute("SELECT to_regclass('grupo_case_version')")
        assert cursor.fetchone()[0] is None


def test_running_the_copy_twice_does_not_duplicate_assignments(populated):
    groups, versions = populated
    executor = _migrate(BEFORE_COPY)
    Old = executor.loader.project_state(BEFORE_COPY).apps.get_model("grupos", "GrupoCaseVersion")
    Old.objects.bulk_create([Old(grupo_id=groups[0].id, case_version_id=versions[0].id)])
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
    _migrate(AFTER_RETIRE)
    first = CaseAssignment.objects.filter(grupo_id=groups[0].id).count()

    executor = _migrate(BEFORE_COPY)  # hacia atrás: devuelve la fila a la tabla vieja
    Old = executor.loader.project_state(BEFORE_COPY).apps.get_model("grupos", "GrupoCaseVersion")
    assert Old.objects.filter(grupo_id=groups[0].id, case_version_id=versions[0].id).count() == 1
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
    _migrate(AFTER_RETIRE)

    assert first == 1
    assert CaseAssignment.objects.filter(grupo_id=groups[0].id).count() == 1
