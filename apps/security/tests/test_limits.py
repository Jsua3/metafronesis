"""Los límites son los de la especificación (S1-2, DJA-2; revisión de la ola A, hallazgo #9).

``limits.py`` dice que «las pruebas lo fijan». Esta prueba fija el diccionario completo: mover un valor pasa a ser una
decisión explícita (y se cambia aquí a la vez), no un efecto colateral.
"""
import pytest

from apps.security.limits import CONTADORES, LIMITS, Limit

pytestmark = [pytest.mark.req("DJA-2"), pytest.mark.security]

ESPERADOS = {
    "login_ip": Limit(300, 600),
    "login_fail_account_ip": Limit(5, 900),
    "login_fail_account": Limit(30, 900),
    "google_ip": Limit(300, 600),
    "access_request_ip": Limit(5, 3600),
    "access_request_email": Limit(2, 86400),
    "access_request_global": Limit(200, 86400),
    "access_request_notice": Limit(1, 600),
    "import_user": Limit(10, 3600),
    "heavy_user": Limit(30, 60),
    "csp_report_ip": Limit(60, 60),
    "password_change_user": Limit(10, 3600),
    "consent_user": Limit(30, 3600),
    "api_user": Limit(600, 60),
    "audit_failure": Limit(0, 3600),
    # S4-1 · tope de FILAS de auditoría por correo: diez ``sesion.fallar`` por hash de correo cada 15 minutos.
    "audit_login_fail": Limit(10, 900),
    "audit_login_fail_ip": Limit(20, 900),
    "audit_login_fail_global": Limit(300, 3600),
    # S7-2 (#2) · tope de FILAS de auditoría de juego por estudiante: 1200 por hora.
    "audit_game_user": Limit(1200, 3600),
}


def test_el_diccionario_de_limites_es_el_de_la_especificacion():
    assert LIMITS == ESPERADOS


def test_solo_audit_failure_es_un_contador_y_no_un_limite():
    assert CONTADORES == frozenset({"audit_failure"})
