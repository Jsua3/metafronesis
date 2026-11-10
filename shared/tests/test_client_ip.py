"""S1-1 · ``shared.client_ip.client_ip``: la IP del cliente según los saltos de confianza (SIEP-RNF-02).

``SIEP_TRUSTED_PROXIES = n`` cuenta los proxies de confianza delante de Django; cada uno añade la dirección que
ve a la cola de ``X-Forwarded-For``. El cliente real es la entrada que queda a ``n`` posiciones desde la derecha:
lo que el cliente escribió va a la izquierda y no cuenta.
"""
import logging

import pytest
from django.test import RequestFactory

import shared.client_ip as modulo_ip
from shared.client_ip import client_ip, rate_limit_ip

pytestmark = [pytest.mark.req("SIEP-RNF-02"), pytest.mark.security]

#: Dirección de ``REMOTE_ADDR`` de las pruebas (bloque de documentación, RFC 5737).
REMOTE = "203.0.113.7"


def _peticion(cabecera=None, remote=REMOTE):
    peticion = RequestFactory().get("/")
    if cabecera is not None:
        peticion.META["HTTP_X_FORWARDED_FOR"] = cabecera
    if remote is None:
        peticion.META.pop("REMOTE_ADDR", None)
    else:
        peticion.META["REMOTE_ADDR"] = remote
    return peticion


def test_sin_saltos_de_confianza_se_ignora_la_cabecera(settings):
    settings.SIEP_TRUSTED_PROXIES = 0

    assert client_ip(_peticion("6.6.6.6, 9.9.9.9")) == REMOTE


def test_con_un_salto_se_toma_la_ultima_entrada(settings):
    settings.SIEP_TRUSTED_PROXIES = 1

    assert client_ip(_peticion("9.9.9.9")) == "9.9.9.9"


def test_con_un_salto_una_cabecera_falsificada_a_la_izquierda_no_cambia_el_resultado(settings):
    settings.SIEP_TRUSTED_PROXIES = 1

    assert client_ip(_peticion("6.6.6.6, 9.9.9.9")) == "9.9.9.9"


def test_con_dos_saltos_se_toma_la_penultima_entrada(settings):
    settings.SIEP_TRUSTED_PROXIES = 2

    assert client_ip(_peticion("1.1.1.1, 2.2.2.2, 3.3.3.3")) == "2.2.2.2"


@pytest.mark.parametrize("cabecera", [None, "", "   ", " , ", "9.9.9.9"])
def test_con_menos_entradas_que_saltos_o_sin_cabecera_se_usa_remote_addr(settings, cabecera):
    settings.SIEP_TRUSTED_PROXIES = 2

    assert client_ip(_peticion(cabecera)) == REMOTE


@pytest.mark.parametrize("entrada", ["no-es-ip", "1.2.3.4:abc", "999.1.1.1"])
def test_una_entrada_que_no_es_ip_se_usa_remote_addr(settings, entrada):
    settings.SIEP_TRUSTED_PROXIES = 1

    assert client_ip(_peticion(f"6.6.6.6, {entrada}")) == REMOTE


@pytest.mark.parametrize(
    ("cabecera", "saltos", "esperada"),
    [
        ("  9.9.9.9  ", 1, "9.9.9.9"),
        ("1.1.1.1,,2.2.2.2", 1, "2.2.2.2"),
        ("1.1.1.1,,2.2.2.2", 2, "1.1.1.1"),
    ],
)
def test_recorta_espacios_y_descarta_entradas_vacias(settings, cabecera, saltos, esperada):
    settings.SIEP_TRUSTED_PROXIES = saltos

    assert client_ip(_peticion(cabecera)) == esperada


@pytest.mark.parametrize("cabecera", ["2001:db8::1", "2001:0db8:0000:0000:0000:0000:0000:0001"])
def test_ipv6_sale_en_su_forma_comprimida(settings, cabecera):
    settings.SIEP_TRUSTED_PROXIES = 1

    assert client_ip(_peticion(f"9.9.9.9, {cabecera}")) == "2001:db8::1"


def test_sin_remote_addr_devuelve_cadena_vacia(settings):
    settings.SIEP_TRUSTED_PROXIES = 0
    assert client_ip(_peticion(remote=None)) == ""

    settings.SIEP_TRUSTED_PROXIES = 1
    assert client_ip(_peticion("no-es-ip", remote=None)) == ""


def test_un_numero_negativo_nunca_lee_por_la_izquierda(settings):
    # Con -1, la entrada a «-n» posiciones sería la segunda por la izquierda: lo que escribió el cliente.
    settings.SIEP_TRUSTED_PROXIES = -1

    assert client_ip(_peticion("6.6.6.6, 9.9.9.9")) == REMOTE


# ── IPv6 por bloque y IPv4 mapeada (revisión de la ola A, hallazgo #1) ──────────────────────────────────


@pytest.mark.parametrize(
    ("ip", "clave"),
    [
        ("203.0.113.7", "203.0.113.7"),
        ("::ffff:203.0.113.7", "203.0.113.7"),
        ("2001:db8:1:1::1", "2001:db8:1:1::/64"),
        ("2001:db8:1:1:ffff:ffff:ffff:ffff", "2001:db8:1:1::/64"),
        ("2001:db8:1:2::1", "2001:db8:1:2::/64"),
    ],
)
def test_rate_limit_ip_agrupa_ipv6_por_bloque_de_64_y_mapeadas_por_ipv4(settings, ip, clave):
    settings.SIEP_TRUSTED_PROXIES = 1

    assert rate_limit_ip(_peticion(ip)) == clave


@pytest.mark.parametrize(
    ("cabecera", "saltos", "esperada"),
    [
        ("6.6.6.6, 9.9.9.9:443", 1, "9.9.9.9"),
        ("9.9.9.9:8080", 1, "9.9.9.9"),
        ("9.9.9.9, [2001:db8::1]:443", 1, "2001:db8::1"),
        ("[2001:db8::1]", 1, "2001:db8::1"),
    ],
)
def test_quita_el_puerto_de_la_entrada_que_se_elige(settings, cabecera, saltos, esperada):
    settings.SIEP_TRUSTED_PROXIES = saltos

    assert client_ip(_peticion(cabecera)) == esperada


@pytest.fixture
def reloj_del_aviso(monkeypatch):
    """Reloj que cada prueba mueve, y ningún aviso emitido por otra prueba dentro de su minuto."""
    instante = {"t": 1000.0}
    # raising=False: el punto aún no existe en el código; sin él la prueba caería en la preparación, no en la aserción.
    monkeypatch.setattr(modulo_ip, "_ahora", lambda: instante["t"], raising=False)
    monkeypatch.setattr(modulo_ip, "_ultimo_aviso", None, raising=False)
    return instante


def _avisos_de_fallback(caplog):
    return [
        registro
        for registro in caplog.records
        if registro.name == "siep.security" and getattr(registro, "fields", {}).get("event") == "client_ip_fallback"
    ]


@pytest.mark.parametrize(
    ("cabecera", "saltos", "motivo"),
    [
        (None, 1, "cabecera_ausente"),
        ("  ,  ", 1, "cabecera_ausente"),
        ("9.9.9.9", 2, "menos_entradas_que_saltos"),
        ("6.6.6.6, no-es-ip", 1, "entrada_no_es_ip"),
    ],
)
def test_un_proxy_mal_contado_deja_una_linea_con_su_motivo(settings, reloj_del_aviso, caplog, cabecera, saltos, motivo):
    settings.SIEP_TRUSTED_PROXIES = saltos

    with caplog.at_level(logging.WARNING, logger="siep.security"):
        ip = client_ip(_peticion(cabecera))

    assert ip == REMOTE  # sigue cayendo a REMOTE_ADDR
    avisos = _avisos_de_fallback(caplog)
    assert [aviso.fields for aviso in avisos] == [{"event": "client_ip_fallback", "reason": motivo}]
    assert avisos[0].levelno == logging.WARNING


def test_como_maximo_un_aviso_por_minuto_y_proceso(settings, reloj_del_aviso, caplog):
    settings.SIEP_TRUSTED_PROXIES = 1

    with caplog.at_level(logging.WARNING, logger="siep.security"):
        client_ip(_peticion(None))  # t = 1000: aviso
        reloj_del_aviso["t"] += 59
        client_ip(_peticion(None))  # t = 1059: dentro del mismo minuto, sin aviso
        reloj_del_aviso["t"] += 1
        client_ip(_peticion(None))  # t = 1060: ya pasó un minuto, aviso otra vez

    assert len(_avisos_de_fallback(caplog)) == 2


def test_sin_saltos_de_confianza_no_hay_nada_que_avisar(settings, reloj_del_aviso, caplog):
    settings.SIEP_TRUSTED_PROXIES = 0

    with caplog.at_level(logging.WARNING, logger="siep.security"):
        client_ip(_peticion(None))

    assert _avisos_de_fallback(caplog) == []


def test_rate_limit_ip_deja_tal_cual_lo_que_no_es_una_ip(settings):
    settings.SIEP_TRUSTED_PROXIES = 0

    assert rate_limit_ip(_peticion(remote="no-es-ip")) == "no-es-ip"
    assert rate_limit_ip(_peticion(remote=None)) == ""


def test_la_direccion_exacta_sigue_en_client_ip_y_solo_el_limite_la_agrupa(settings):
    settings.SIEP_TRUSTED_PROXIES = 0
    peticion = _peticion(remote="2001:db8:1:1::1")

    assert client_ip(peticion) == "2001:db8:1:1::1"
    assert rate_limit_ip(peticion) == "2001:db8:1:1::/64"
