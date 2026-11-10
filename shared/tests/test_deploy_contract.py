"""E0-10 · Contrato de despliegue: el esquema lo construye ``migrate``, no un volcado."""
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]  # raíz del repositorio

pytestmark = pytest.mark.req("REGLA-002")


def _cmd_line():
    lines = (ROOT / "Dockerfile").read_text(encoding="utf-8").splitlines()
    return next(line for line in reversed(lines) if line.startswith("CMD "))


def test_el_contenedor_migra_antes_de_arrancar_gunicorn():
    cmd = _cmd_line()

    assert "manage.py migrate --noinput" in cmd
    assert cmd.index("migrate") < cmd.index("gunicorn")


def test_ya_no_hay_volcado_ni_scripts_de_esquema_versionados():
    assert not (ROOT / "deploy" / "db_seed.sql").exists()
    assert not list((ROOT / "deploy").glob("upgrades/*.sql"))


def test_la_siembra_ya_no_crea_tablas_con_sql():
    command = ROOT / "backend_django" / "apps" / "simulation" / "management" / "commands" / "bootstrap_dev_db.py"
    source = command.read_text(encoding="utf-8")

    assert "SCHEMA_STATEMENTS" not in source
    assert "CREATE TABLE" not in source


def test_gunicorn_es_el_proceso_principal_del_contenedor():
    # Con `exec`, gunicorn recibe SIGTERM en los redespliegues y drena las peticiones en vuelo.
    assert "exec gunicorn" in _cmd_line()
