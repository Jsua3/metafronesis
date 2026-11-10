"""El limitador compartido (S1-2, DJA-2): contadores atómicos en PostgreSQL, claves con hash y falla abierta."""
import logging
import secrets

import pytest
from django.db import DatabaseError

from apps.security import limiter
from apps.security.limits import LIMITS
from apps.security.models import RateLimitBucket
from shared.testing import run_concurrently

pytestmark = [pytest.mark.req("DJA-2"), pytest.mark.security]

# Múltiplo de 600 y de 3600: cada ventana de estas pruebas empieza justo en este instante.
INSTANTE = 1_800_000_000.0


@pytest.fixture
def reloj(monkeypatch):
    """Un reloj fijo que cada prueba mueve a su gusto (``reloj["t"] = …``)."""
    instante = {"t": INSTANTE}
    monkeypatch.setattr(limiter, "_now", lambda: instante["t"])
    return instante


@pytest.fixture
def limitador_encendido(settings):
    settings.SIEP_THROTTLE_ENABLED = True
    return settings


def _clave():
    return limiter.key_hash("prueba", secrets.token_urlsafe(16))


def test_hit_cuenta_las_peticiones_de_la_ventana(db, reloj, limitador_encendido):
    clave = _clave()

    assert [limiter.hit("login_ip", clave) for _ in range(3)] == [1, 2, 3]


def test_al_cambiar_de_ventana_el_contador_vuelve_a_uno(db, reloj, limitador_encendido):
    clave = _clave()
    limiter.hit("login_ip", clave)
    limiter.hit("login_ip", clave)

    reloj["t"] += LIMITS["login_ip"].window

    assert limiter.hit("login_ip", clave) == 1


def test_peek_lee_sin_sumar(db, reloj, limitador_encendido):
    clave = _clave()
    limiter.hit("login_ip", clave)

    assert limiter.peek("login_ip", clave) == 1
    assert limiter.peek("login_ip", clave) == 1
    assert limiter.hit("login_ip", clave) == 2


def test_peek_de_una_clave_sin_contador_es_cero(db, reloj, limitador_encendido):
    assert limiter.peek("login_ip", _clave()) == 0


def test_retry_after_es_lo_que_falta_para_que_acabe_la_ventana(reloj, limitador_encendido):
    reloj["t"] = INSTANTE + 200  # 200 s de los 600 de la ventana

    assert limiter.retry_after("login_ip") == 400


def test_retry_after_nunca_baja_de_un_segundo(reloj, limitador_encendido):
    reloj["t"] = INSTANTE + 599.5  # quedan medio segundo

    assert limiter.retry_after("login_ip") == 1


def test_key_hash_es_estable_distinto_por_parte_y_de_64_hex():
    assert limiter.key_hash("a@ejemplo.org", "203.0.113.5") == limiter.key_hash("a@ejemplo.org", "203.0.113.5")
    assert limiter.key_hash("a@ejemplo.org", "203.0.113.5") != limiter.key_hash("a@ejemplo.org", "203.0.113.6")
    # Con separador, ("ab", "c") y ("a", "bc") no colisionan.
    assert limiter.key_hash("ab", "c") != limiter.key_hash("a", "bc")
    assert len(limiter.key_hash("x")) == 64


def test_key_hash_no_lanza_con_un_sustituto_suelto():
    """Un correo con un sustituto suelto (el escape JSON ``\\ud800``) no puede tumbar la petición (hallazgo #8)."""
    assert len(limiter.key_hash("\ud800")) == 64
    assert limiter.key_hash("\ud800") != limiter.key_hash("\udfff")


def test_la_tabla_no_guarda_el_correo_ni_la_ip_en_claro(db, reloj, limitador_encendido):
    correo = "alumna.prueba@ejemplo.org"
    ip = "203.0.113.77"
    limiter.hit("login_fail_account", limiter.key_hash(correo))
    limiter.hit("login_fail_account_ip", limiter.key_hash(correo, ip))

    filas = " ".join(
        f"{fila.scope} {fila.key_hash} {fila.window_start} {fila.count}"
        for fila in RateLimitBucket.objects.all()
    )
    assert filas
    assert correo not in filas and ip not in filas


def test_con_la_bandera_apagada_no_se_abre_ningun_cursor(reloj, settings, monkeypatch):
    settings.SIEP_THROTTLE_ENABLED = False

    class SinBase:
        def cursor(self):
            raise AssertionError("con el limitador apagado no debe tocarse la base")

    monkeypatch.setattr(limiter, "connection", SinBase())

    assert limiter.hit("login_ip", "clave") == 0
    assert limiter.peek("login_ip", "clave") == 0


def test_si_la_base_no_responde_la_peticion_pasa_y_queda_registrado(
    reloj, limitador_encendido, monkeypatch, caplog
):
    clave = _clave()

    class BaseCaida:
        def cursor(self):
            raise DatabaseError("fallo simulado")

    monkeypatch.setattr(limiter, "connection", BaseCaida())

    with caplog.at_level(logging.WARNING, logger="siep.security"):
        assert limiter.hit("login_ip", clave) == 0
        assert limiter.peek("login_ip", clave) == 0

    registros = [registro for registro in caplog.records if registro.name == "siep.security"]
    assert [registro.fields["event"] for registro in registros] == ["throttle_backend_error"] * 2
    assert all(
        registro.fields["scope"] == "login_ip" and registro.fields["reason"] == "DatabaseError"
        for registro in registros
    )
    assert clave not in caplog.text


def test_veinte_intentos_simultaneos_cuentan_veinte_sin_respuestas_repetidas(
    real_commits, reloj, limitador_encendido
):
    clave = _clave()
    try:
        resultados = run_concurrently(*[lambda: limiter.hit("login_ip", clave)] * 20)

        assert [resultado.error for resultado in resultados] == [None] * 20
        assert sorted(resultado.value for resultado in resultados) == list(range(1, 21))
        assert list(RateLimitBucket.objects.filter(key_hash=clave).values_list("count", flat=True)) == [20]
    finally:
        RateLimitBucket.objects.filter(key_hash=clave).delete()


def test_key_hash_lleva_la_sal_del_servidor_y_no_es_un_sha256_simple(settings):
    import hashlib

    direccion = "203.0.113.5"
    assert limiter.key_hash(direccion) != hashlib.sha256(direccion.encode()).hexdigest()

    antes = limiter.key_hash(direccion)
    settings.SECRET_KEY = secrets.token_urlsafe(50)
    assert limiter.key_hash(direccion) != antes
