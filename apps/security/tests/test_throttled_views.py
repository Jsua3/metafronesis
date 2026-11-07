"""Los límites en las rutas de entrada (S1-2, DJA-2), de punta a punta con el cliente HTTP de prueba.

Con el limitador encendido (``settings.SIEP_THROTTLE_ENABLED = True``) el reloj está fijo: ninguna ventana cambia
a mitad de una prueba. Cada prueba crea sus cuentas y usa sus propias IP.
"""
import logging
import secrets
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient

from apps.security import limiter
from apps.security.limits import LIMITS, Limit
from apps.security.models import RateLimitBucket
from apps.users.models import AccessRequest

pytestmark = [pytest.mark.req("DJA-2"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()
LOGIN = "/api/auth/login"
ACCESO = "/api/auth/access-request"
GOOGLE = "/api/auth/google"
INSTANTE = 1_800_000_000.0


@pytest.fixture
def reloj(monkeypatch):
    instante = {"t": INSTANTE}
    monkeypatch.setattr(limiter, "_now", lambda: instante["t"])
    return instante


@pytest.fixture
def limitador(settings):
    settings.SIEP_THROTTLE_ENABLED = True
    return settings


@pytest.fixture
def cliente():
    return APIClient()


@pytest.fixture
def clave():
    """Una contraseña nueva en cada prueba: nunca un literal."""
    return secrets.token_urlsafe(32)


@pytest.fixture
def clave_hash(clave):
    # Se calcula una vez por prueba: BCrypt es lento y cada cuenta comparte la misma contraseña.
    return make_password(clave)


def _cuenta(clave_hash):
    return User.objects.create(
        email=f"alumna-{uuid.uuid4().hex[:12]}@ejemplo.org",
        password=clave_hash,
        nombre="Prueba",
        apellido="Limite",
        role="ESTUDIANTE",
    )


def _login(cliente, correo, clave, ip):
    return cliente.post(LOGIN, {"email": correo, "password": clave}, format="json", REMOTE_ADDR=ip)


def _solicitud(cliente, correo, ip):
    return cliente.post(
        ACCESO, {"nombre": "Ana", "apellido": "Prueba", "email": correo}, format="json", REMOTE_ADDR=ip
    )


def _correo_nuevo():
    return f"solicitud-{uuid.uuid4().hex[:10]}@ejemplo.org"


# ── Bloqueo por fallos de inicio de sesión ──────────────────────────────────────────────────────────────


def test_cinco_fallos_de_una_cuenta_bloquean_el_sexto_intento_aunque_la_clave_sea_buena(
    cliente, reloj, limitador, clave, clave_hash
):
    cuenta = _cuenta(clave_hash)
    erronea = secrets.token_urlsafe(32)
    for _ in range(5):
        assert _login(cliente, cuenta.email, erronea, ip="198.51.100.1").status_code == 401

    respuesta = _login(cliente, cuenta.email, clave, ip="198.51.100.1")

    assert respuesta.status_code == 429
    assert respuesta.data["code"] == "THROTTLED"
    assert int(respuesta["Retry-After"]) >= 1


def test_treinta_fallos_repartidos_entre_ips_bloquean_la_cuenta_desde_otra_ip(
    cliente, reloj, limitador, clave, clave_hash
):
    cuenta = _cuenta(clave_hash)
    erronea = secrets.token_urlsafe(32)
    for numero in range(1, 31):
        assert _login(cliente, cuenta.email, erronea, ip=f"198.51.100.{numero}").status_code == 401

    assert _login(cliente, cuenta.email, clave, ip="198.51.100.200").status_code == 429


def test_cuarenta_inicios_correctos_desde_una_ip_no_reciben_ningun_429(cliente, reloj, limitador, clave, clave_hash):
    cuentas = [_cuenta(clave_hash) for _ in range(40)]

    for cuenta in cuentas:
        assert _login(cliente, cuenta.email, clave, ip="10.20.30.40").status_code == 200


def test_con_la_bandera_apagada_el_sexto_intento_no_da_429(cliente, reloj, settings, clave, clave_hash):
    settings.SIEP_THROTTLE_ENABLED = False
    cuenta = _cuenta(clave_hash)
    erronea = secrets.token_urlsafe(32)
    for _ in range(5):
        assert _login(cliente, cuenta.email, erronea, ip="198.51.100.1").status_code == 401

    assert _login(cliente, cuenta.email, clave, ip="198.51.100.1").status_code == 200


def test_la_tabla_no_guarda_ni_el_correo_ni_la_ip_en_claro(cliente, reloj, limitador, clave, clave_hash):
    cuenta = _cuenta(clave_hash)
    ip = "198.51.100.99"

    _login(cliente, cuenta.email, secrets.token_urlsafe(32), ip=ip)

    filas = list(RateLimitBucket.objects.all())
    assert filas
    texto = " ".join(f"{fila.scope} {fila.key_hash} {fila.window_start} {fila.count}" for fila in filas)
    assert cuenta.email not in texto and ip not in texto


# ── Volumen por IP y solicitudes de acceso (cableadas en la parte 4) ─────────────────────────────────────


def test_volumen_por_ip_login_ip_da_429_al_pasarse_del_limite(cliente, reloj, limitador, clave, clave_hash, monkeypatch):
    monkeypatch.setitem(LIMITS, "login_ip", Limit(3, 600))
    cuentas = [_cuenta(clave_hash) for _ in range(4)]

    for cuenta in cuentas[:3]:
        assert _login(cliente, cuenta.email, clave, ip="198.51.100.9").status_code == 200

    assert _login(cliente, cuentas[3].email, clave, ip="198.51.100.9").status_code == 429


def test_tercer_intento_con_el_mismo_correo_en_un_dia_da_429(cliente, reloj, limitador):
    correo = _correo_nuevo()

    assert _solicitud(cliente, correo, "198.51.100.61").status_code != 429
    assert _solicitud(cliente, correo, "198.51.100.62").status_code != 429
    assert _solicitud(cliente, correo, "198.51.100.63").status_code == 429


def test_sexto_intento_desde_la_misma_ip_da_429(cliente, reloj, limitador):
    for _ in range(5):
        assert _solicitud(cliente, _correo_nuevo(), "198.51.100.70").status_code != 429

    assert _solicitud(cliente, _correo_nuevo(), "198.51.100.70").status_code == 429


def test_google_limita_por_ip(cliente, reloj, limitador, monkeypatch):
    monkeypatch.setitem(LIMITS, "google_ip", Limit(1, 600))

    assert cliente.post(GOOGLE, {"credential": "x"}, format="json", REMOTE_ADDR="198.51.100.80").status_code != 429
    assert cliente.post(GOOGLE, {"credential": "x"}, format="json", REMOTE_ADDR="198.51.100.80").status_code == 429


def test_el_429_del_login_trae_la_forma_throttled_con_la_espera_y_la_cabecera(
    cliente, reloj, limitador, clave, clave_hash
):
    cuenta = _cuenta(clave_hash)
    for _ in range(5):
        _login(cliente, cuenta.email, secrets.token_urlsafe(32), ip="198.51.100.1")

    respuesta = _login(cliente, cuenta.email, clave, ip="198.51.100.1")

    # Reloj fijo al inicio de una ventana de 900 s: la espera es la ventana entera (la cabecera sigue en segundos).
    assert respuesta.status_code == 429
    assert respuesta["Retry-After"] == "900"
    assert respuesta.data == {
        "success": False,
        "code": "THROTTLED",
        "message": "Demasiados intentos. Espera 15 min e inténtalo de nuevo.",
        "retryAfter": 900,
    }


def test_un_intento_frenado_por_la_ip_no_gasta_el_tope_global_ni_el_del_correo(cliente, reloj, limitador):
    """Solo la IP cuenta al entrar: un intento que ella frena no llega al cuerpo, ni gasta el correo ni el global."""
    for _ in range(5):
        assert _solicitud(cliente, _correo_nuevo(), "198.51.100.71").status_code != 429
    correo_frenado = _correo_nuevo()

    assert _solicitud(cliente, correo_frenado, "198.51.100.71").status_code == 429

    assert RateLimitBucket.objects.get(scope="access_request_global").count == 5
    assert not RateLimitBucket.objects.filter(
        scope="access_request_email", key_hash=limiter.key_hash(correo_frenado)
    ).exists()


def test_un_atacante_frenado_por_su_ip_no_agota_el_tope_global_de_los_demas(
    cliente, reloj, limitador, monkeypatch
):
    monkeypatch.setitem(LIMITS, "access_request_global", Limit(8, 86400))
    for _ in range(40):
        _solicitud(cliente, _correo_nuevo(), "203.0.113.90")  # 5 pasan, 35 quedan frenadas por la IP

    assert _solicitud(cliente, _correo_nuevo(), "203.0.113.91").status_code != 429


# ── Solo cuentan las solicitudes válidas (revisión de la ola A, hallazgo #3) ───────────────────────────────


def test_cuerpos_invalidos_no_gastan_el_tope_global_ni_el_del_correo(cliente, reloj, limitador):
    for numero in range(1, 8):
        assert cliente.post(ACCESO, {}, format="json", REMOTE_ADDR=f"198.51.100.{140 + numero}").status_code == 400

    assert not RateLimitBucket.objects.filter(scope__in=["access_request_global", "access_request_email"]).exists()


def test_el_campo_trampa_no_cuenta_y_responde_igual_que_una_solicitud_normal(cliente, reloj, limitador):
    correo_normal = _correo_nuevo()
    correo_trampa = _correo_nuevo()
    normal = _solicitud(cliente, correo_normal, "198.51.100.150")

    trampa = cliente.post(
        ACCESO,
        {"nombre": "Bot", "apellido": "Spam", "email": correo_trampa, "website": "https://spam.example"},
        format="json",
        REMOTE_ADDR="198.51.100.151",
    )

    assert trampa.status_code == normal.status_code == 201
    assert trampa.data == normal.data
    assert not AccessRequest.objects.filter(email=correo_trampa).exists()
    assert RateLimitBucket.objects.get(scope="access_request_global").count == 1  # solo la solicitud normal
    assert not RateLimitBucket.objects.filter(
        scope="access_request_email", key_hash=limiter.key_hash(correo_trampa)
    ).exists()


def test_el_tope_global_cuenta_solo_las_solicitudes_validas(cliente, reloj, limitador):
    _solicitud(cliente, _correo_nuevo(), "198.51.100.160")
    _solicitud(cliente, _correo_nuevo(), "198.51.100.161")
    cliente.post(ACCESO, {}, format="json", REMOTE_ADDR="198.51.100.162")
    cliente.post(ACCESO, {}, format="json", REMOTE_ADDR="198.51.100.163")

    assert RateLimitBucket.objects.get(scope="access_request_global").count == 2


def test_la_alarma_del_80_por_ciento_del_global_se_registra_una_sola_vez(
    cliente, reloj, limitador, monkeypatch, caplog
):
    monkeypatch.setitem(LIMITS, "access_request_global", Limit(10, 86400))

    with caplog.at_level(logging.INFO, logger="siep.security"):
        codigos = [_solicitud(cliente, _correo_nuevo(), f"198.51.100.{170 + n}").status_code for n in range(11)]

    alarmas = [
        registro
        for registro in caplog.records
        if registro.name == "siep.security" and getattr(registro, "fields", {}).get("event") == "access_request_global_80"
    ]
    assert set(codigos[:10]) == {201}
    assert codigos[10] == 429
    assert len(alarmas) == 1
    assert alarmas[0].fields == {"event": "access_request_global_80", "scope": "access_request_global"}


def test_el_correo_con_mayusculas_cuenta_como_el_mismo(cliente, reloj, limitador):
    codigos = [
        _solicitud(cliente, correo, f"198.51.100.{180 + numero}").status_code
        for numero, correo in enumerate(["Victima@Probe.test", "victima@probe.test", "VICTIMA@PROBE.TEST"])
    ]

    assert codigos == [201, 201, 429]


# ── Solo cuentan los métodos que escriben; Google admite 300 por IP (revisión de la ola A, hallazgo #17) ─


@pytest.mark.parametrize(("ruta", "alcance"), [(LOGIN, "login_ip"), (GOOGLE, "google_ip"), (ACCESO, "access_request_ip")])
def test_un_get_no_gasta_el_cupo_de_la_ruta_de_solo_post(cliente, reloj, limitador, monkeypatch, ruta, alcance):
    monkeypatch.setitem(LIMITS, alcance, Limit(1, 600))

    codigos = [cliente.get(ruta, REMOTE_ADDR="198.51.100.130").status_code for _ in range(3)]

    assert codigos == [405, 405, 405]
    assert not RateLimitBucket.objects.filter(scope=alcance).exists()


def test_google_admite_300_peticiones_por_ip_antes_de_limitar(cliente, reloj, limitador):
    for _ in range(300):
        assert cliente.post(GOOGLE, {"credential": "x"}, format="json", REMOTE_ADDR="198.51.100.131").status_code != 429

    assert cliente.post(GOOGLE, {"credential": "x"}, format="json", REMOTE_ADDR="198.51.100.131").status_code == 429


# ── Un correo con sustituto suelto no da 500 (revisión de la ola A, hallazgo #8) ─────────────────────────

CUERPO_CON_SUSTITUTO = rb'{"nombre": "Ana", "apellido": "Gil", "email": "\ud800"}'


@pytest.mark.parametrize("encendido", [True, False])
def test_un_correo_con_sustituto_suelto_da_400_y_no_500(cliente, reloj, settings, encendido):
    settings.SIEP_THROTTLE_ENABLED = encendido

    respuesta = cliente.generic(
        "POST", ACCESO, data=CUERPO_CON_SUSTITUTO, content_type="application/json", REMOTE_ADDR="198.51.100.120"
    )

    assert respuesta.status_code == 400


# ── IPv6 por bloque de 64 (revisión de la ola A, hallazgo #1) ────────────────────────────────────────────


def test_cinco_solicitudes_desde_un_mismo_bloque_ipv6_agotan_el_limite_de_la_ip(cliente, reloj, limitador):
    for numero in range(1, 6):
        assert _solicitud(cliente, _correo_nuevo(), f"2001:db8:7:7::{numero}").status_code != 429

    assert _solicitud(cliente, _correo_nuevo(), "2001:db8:7:7::99").status_code == 429


def test_los_fallos_desde_un_mismo_bloque_ipv6_bloquean_la_cuenta(cliente, reloj, limitador, clave, clave_hash):
    cuenta = _cuenta(clave_hash)
    erronea = secrets.token_urlsafe(32)
    for numero in range(1, 6):
        assert _login(cliente, cuenta.email, erronea, ip=f"2001:db8:8:8::{numero}").status_code == 401

    assert _login(cliente, cuenta.email, clave, ip="2001:db8:8:8::99").status_code == 429
