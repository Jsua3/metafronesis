"""Una base con el historial de migraciones anterior a E0-8 se rechaza al migrar.

La baseline regenerada reutiliza los nombres ``0001_initial``: sobre una base restaurada
del volcado antiguo ``migrate`` no instalaría nada y el código asumiría restricciones que
no existen. El check de base de datos lo detiene con instrucciones.
"""
import pytest
from django.core.checks.registry import registry
from django.db import connection

from shared.checks import legacy_migration_history

pytestmark = [pytest.mark.django_db, pytest.mark.req("REGLA-002")]


def test_el_check_esta_registrado():
    assert legacy_migration_history in registry.registered_checks


def test_una_base_construida_por_migrate_pasa():
    assert legacy_migration_history(None, databases=["default"]) == []


@pytest.mark.parametrize(
    ("app", "name"),
    [
        ("simulation", "0004_simulationrubricassignment"),
        ("users", "0002_initial"),
        ("grupos", "0002_grupo_case_version"),
    ],
)
def test_una_base_con_el_historial_viejo_se_rechaza_y_explica_como_recrearla(app, name):
    with connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO django_migrations (app, name, applied) VALUES (%s, %s, now())", [app, name]
        )

    errors = legacy_migration_history(None, databases=["default"])

    assert [e.id for e in errors] == ["siep.E001"]
    assert f"{app}.{name}" in errors[0].msg
    assert "down -v" in errors[0].hint
