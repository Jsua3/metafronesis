import json
import logging
import re
import secrets
import sys
import types
from pathlib import Path

import pytest
from django.db import OperationalError
from django.test import Client

from shared import security_events
from shared.jsonlog import JsonFormatter, RequestIdFilter
from shared.security_events import log_security_event

ROOT = Path(__file__).resolve().parents[3]  # raíz del repositorio
IP_DE_PRUEBA = "203.0.113.9"  # bloque de documentación (RFC 5737): no es una dirección real

pytestmark = pytest.mark.req("RNF-06")


@pytest.mark.django_db
def test_health_responde_200_sin_autenticacion():
    response = Client().get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"success": True, "data": {"status": "ok", "db": "ok"}}


def test_health_responde_503_sin_filtrar_el_error_de_la_bd(monkeypatch):
    clave = secrets.token_urlsafe(24)

    def broken(*args, **kwargs):
        raise OperationalError(f"could not connect: host=db user=psychosim password={clave}")

    monkeypatch.setattr("shared.health.connection.cursor", broken)

    response = Client().get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"success": False, "data": {"status": "degraded", "db": "error"}}
    assert clave not in response.content.decode()


@pytest.mark.django_db
def test_toda_respuesta_trae_x_request_id_generado():
    response = Client().get("/api/health")

    assert re.fullmatch(r"[0-9a-f]{32}", response["X-Request-Id"])


@pytest.mark.django_db
def test_un_x_request_id_valido_se_conserva_y_uno_invalido_se_reemplaza():
    kept = Client().get("/api/health", HTTP_X_REQUEST_ID="trace-abc12345")
    replaced = Client().get("/api/health", HTTP_X_REQUEST_ID="<script>alert(1)</script>")

    assert kept["X-Request-Id"] == "trace-abc12345"
    assert re.fullmatch(r"[0-9a-f]{32}", replaced["X-Request-Id"])


@pytest.mark.django_db
def test_el_log_de_request_es_json_con_duracion_y_sin_query_string(caplog):
    valor = secrets.token_urlsafe(24)
    with caplog.at_level(logging.INFO, logger="siep.request"):
        response = Client().get(f"/api/health?token={valor}")

    record = next(r for r in caplog.records if r.name == "siep.request")
    line = json.loads(JsonFormatter().format(record))
    assert line["path"] == "/api/health"
    assert line["method"] == "GET"
    assert line["status"] == 200
    assert line["request_id"] == response["X-Request-Id"]
    assert isinstance(line["duration_ms"], (int, float)) and line["duration_ms"] >= 0
    assert valor not in json.dumps(line)


def test_json_formatter_incluye_la_excepcion():
    try:
        raise ValueError("boom")
    except ValueError:
        record = logging.getLogger("siep.test").makeRecord(
            "siep.test", logging.ERROR, __file__, 1, "falló", (), sys.exc_info()
        )
    line = json.loads(JsonFormatter().format(record))
    assert line["level"] == "ERROR"
    assert "ValueError: boom" in line["exc"]


def test_gunicorn_registra_accesos_y_errores_en_stdout():
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    assert "--access-logfile -" in dockerfile
    assert "--error-logfile -" in dockerfile


def test_railway_usa_el_healthcheck_y_reinicia_siempre():
    deploy = json.loads((ROOT / "railway.json").read_text(encoding="utf-8"))["deploy"]
    assert deploy["healthcheckPath"] == "/api/health"
    assert deploy["restartPolicyType"] == "ALWAYS"


def test_el_filtro_toma_el_request_id_de_la_request_del_registro():
    # Django registra las respuestas 4xx/5xx de django.request fuera del middleware, con la
    # request en el registro y el ContextVar ya restablecido.
    record = logging.getLogger("django.request").makeRecord(
        "django.request", logging.WARNING, __file__, 1, "Not Found", (), None
    )
    record.request = types.SimpleNamespace(request_id="trace-abc12345")

    RequestIdFilter().filter(record)

    assert record.request_id == "trace-abc12345"


# ── S4-3 · las líneas security_event llevan solo los campos fijos ────────────────────────────────────


def _ultimo_security_event(caplog):
    return next(r for r in caplog.records if r.name == "siep.security" and r.getMessage() == "security_event")


def _afirmar_campos_fijos(registro, correo):
    assert registro.fields == {"event": "bloqueo_de_prueba", "scope": "login_ip", "actor_id": 7, "reason": "limite"}
    linea = JsonFormatter().format(registro)
    assert correo not in linea
    assert IP_DE_PRUEBA not in linea


@pytest.mark.security
def test_security_event_solo_registra_los_campos_fijos(caplog):
    correo = f"{secrets.token_hex(6)}@prueba.test"

    with caplog.at_level(logging.INFO, logger="siep.security"):
        log_security_event(
            "bloqueo_de_prueba", scope="login_ip", actor_id=7, reason="limite", email=correo, ip=IP_DE_PRUEBA
        )

    _afirmar_campos_fijos(_ultimo_security_event(caplog), correo)


@pytest.mark.security
def test_control_negativo_sin_el_filtro_el_correo_sale(caplog, monkeypatch):
    monkeypatch.setattr(security_events, "_campos_permitidos", lambda event, fields: {"event": event, **fields})
    correo = f"{secrets.token_hex(6)}@prueba.test"

    with caplog.at_level(logging.INFO, logger="siep.security"):
        log_security_event(
            "bloqueo_de_prueba", scope="login_ip", actor_id=7, reason="limite", email=correo, ip=IP_DE_PRUEBA
        )

    with pytest.raises(AssertionError):
        _afirmar_campos_fijos(_ultimo_security_event(caplog), correo)
