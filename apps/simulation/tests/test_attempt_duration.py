from datetime import datetime, timedelta, timezone

from apps.simulation.services.attempt_duration import IDLE_CAP_SECONDS, active_duration_seconds

T0 = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)


def at(seconds):
    return T0 + timedelta(seconds=seconds)


def test_intento_sin_terminar_no_informa_tiempo():
    assert active_duration_seconds(T0, None, [("DECISION_MADE", at(60))]) is None


def test_actividad_continua_suma_los_intervalos():
    events = [("DECISION_MADE", at(60)), ("DECISION_MADE", at(120))]
    assert active_duration_seconds(T0, at(180), events) == 180


def test_una_espera_larga_cuenta_como_maximo_el_tope():
    events = [("DECISION_MADE", at(60))]
    assert active_duration_seconds(T0, at(60 + 3600), events) == 60 + IDLE_CAP_SECONDS


def test_el_tiempo_en_pausa_segura_no_cuenta():
    day = 86_400
    events = [
        ("DECISION_MADE", at(60)),
        ("SAFE_EXIT_REQUESTED", at(120)),
        ("ATTEMPT_RESUMED", at(120 + day)),
        ("DECISION_MADE", at(180 + day)),
    ]
    assert active_duration_seconds(T0, at(240 + day), events) == 60 + 60 + 60 + 60


def test_intervalos_nulos_o_negativos_se_ignoran():
    events = [("DECISION_MADE", at(0)), ("DECISION_MADE", at(0))]
    assert active_duration_seconds(T0, at(30), events) == 30
