"""El byte NUL no llega a la base, ni por la ruta, ni por la consulta, ni por el cuerpo JSON (S7-1a, RNF-002, LS-13).

PostgreSQL no guarda un NUL en un texto: un servicio que lee un parámetro crudo respondía 500. ``NulByteMiddleware`` rechaza la
ruta y la consulta; ``ObjectJSONParser`` rechaza el cuerpo (y el JSON anidado a miles de niveles, que agotaba la pila de ``json``).
Cada regla lleva su control negativo: una petición limpia pasa y un texto que solo PARECE un NUL (la barra invertida y los
caracteres ``u0000``) no se rechaza.
"""
import logging

import pytest
from django.conf import settings
from django.test import override_settings
from rest_framework.test import APIClient

from shared.text_guard import CODIGO_NUL, MENSAJE_NUL, NUL, contiene_nul

pytestmark = [pytest.mark.req("RNF-002", "LS-13"), pytest.mark.security]

LOGIN = "/api/auth/login"
SALUD = "/api/health"


def _json_crudo(cuerpo):
    return APIClient().generic("POST", LOGIN, cuerpo, content_type="application/json")


# ── contiene_nul: una pila, nunca la recursión ──────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "valor",
    [
        pytest.param(NUL, id="texto"),
        pytest.param(f"a{NUL}b", id="texto-con-el-nul-en-medio"),
        pytest.param([f"x{NUL}"], id="lista"),
        pytest.param((f"x{NUL}",), id="tupla"),
        pytest.param({"a": f"x{NUL}"}, id="valor-de-un-objeto"),
        pytest.param({f"a{NUL}": 1}, id="clave-de-un-objeto"),
        pytest.param({"a": [{"b": [f"x{NUL}"]}]}, id="anidado"),
    ],
)
def test_contiene_nul_lo_encuentra_donde_este(valor):
    assert contiene_nul(valor) is True


@pytest.mark.parametrize(
    "valor",
    [
        pytest.param("", id="vacio"),
        pytest.param("texto normal", id="texto"),
        pytest.param("\\u0000", id="barra-invertida-y-u0000-como-texto"),
        pytest.param(["a", 1, None, True, 2.5, {"k": ["v"]}], id="mezcla-sin-nul"),
        pytest.param(7, id="numero"),
    ],
)
def test_control_negativo_contiene_nul_no_ve_un_nul_donde_no_lo_hay(valor):
    assert contiene_nul(valor) is False


def _anidado(niveles, fondo):
    valor = fondo
    for _ in range(niveles):
        valor = [valor]
    return valor


def test_contiene_nul_recorre_un_anidado_de_50_mil_niveles_sin_agotar_la_pila():
    assert contiene_nul(_anidado(50_000, "x")) is False
    assert contiene_nul(_anidado(50_000, NUL)) is True


# ── La ruta y la consulta: el middleware ────────────────────────────────────────────────────────────────────────────


def _rechazada(respuesta):
    cuerpo = respuesta.json()
    assert respuesta.status_code == 400, (respuesta.status_code, cuerpo)
    assert cuerpo == {"success": False, "code": CODIGO_NUL, "message": MENSAJE_NUL}


@pytest.mark.django_db
@pytest.mark.parametrize(
    "ruta",
    [
        pytest.param(f"{SALUD}?a=%00", id="valor-de-la-consulta"),
        pytest.param(f"{SALUD}?a%00b=1", id="clave-de-la-consulta"),
        pytest.param(f"{SALUD}?ok=1&a=x%00y", id="segundo-parametro"),
        pytest.param(f"{SALUD}/%00", id="ruta"),
        pytest.param("/api/simulation/attempts/1/interactions/%00", id="parametro-de-la-ruta"),
    ],
)
def test_un_nul_en_la_ruta_o_la_consulta_responde_400_sin_llegar_a_la_vista(ruta):
    _rechazada(APIClient().get(ruta))


@pytest.mark.django_db
@pytest.mark.parametrize(
    "ruta",
    [
        pytest.param(f"{SALUD}?a=1", id="consulta-normal"),
        pytest.param(f"{SALUD}?a=%2500", id="porcentaje-cero-cero-codificado"),
        pytest.param(f"{SALUD}?a=%5Cu0000", id="barra-invertida-y-u0000"),
        pytest.param(SALUD, id="sin-consulta"),
    ],
)
def test_control_negativo_una_peticion_limpia_o_un_falso_nul_no_se_rechaza(ruta):
    respuesta = APIClient().get(ruta)

    assert respuesta.status_code == 200, respuesta.content


@pytest.mark.django_db
def test_el_rechazo_se_registra_sin_la_ruta_ni_el_valor(caplog):
    with caplog.at_level(logging.INFO, logger="siep.security"):
        APIClient().get(f"{SALUD}?secreto=abc%00def")

    eventos = [registro.fields for registro in caplog.records if registro.name == "siep.security"]
    assert eventos == [{"event": "nul_rejected", "scope": "query"}]
    assert "abc" not in caplog.text and "secreto" not in caplog.text


@pytest.mark.django_db
def test_control_negativo_sin_el_middleware_el_nul_de_la_consulta_pasa_de_largo():
    sin_el_middleware = [m for m in settings.MIDDLEWARE if m != "shared.text_guard.NulByteMiddleware"]
    assert len(sin_el_middleware) == len(settings.MIDDLEWARE) - 1, "el middleware debe estar en la cadena"

    with override_settings(MIDDLEWARE=sin_el_middleware):
        respuesta = APIClient().get(f"{SALUD}?a=%00")

    assert respuesta.status_code == 200, "sin el middleware la salud ignora la consulta: el control sí lo apaga"


# ── El cuerpo JSON: el parser ───────────────────────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
@pytest.mark.parametrize(
    "cuerpo",
    [
        pytest.param(b'{"email": "a\\u0000b@example.com", "password": "x"}', id="valor"),
        pytest.param(b'{"email": "a@example.com", "password": "x", "a\\u0000": 1}', id="clave"),
        pytest.param(b'{"email": "a@example.com", "password": "x", "otro": ["x", {"k": "\\u0000"}]}', id="anidado"),
    ],
)
def test_un_nul_escapado_en_el_cuerpo_json_responde_400_sin_llegar_a_la_vista(cuerpo):
    _rechazada(_json_crudo(cuerpo))


@pytest.mark.django_db
def test_control_negativo_un_falso_nul_en_el_cuerpo_pasa_a_la_validacion_normal():
    # ``\\u0000`` en JSON es una barra invertida y los caracteres u0000: texto, no un NUL.
    respuesta = _json_crudo(b'{"email": "a\\\\u0000b@example.com", "password": "x"}')

    assert respuesta.status_code == 400
    assert respuesta.json()["code"] == "VALIDATION_ERROR", respuesta.json()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "cuerpo",
    [
        pytest.param(b"[" * 100_000 + b"]" * 100_000, id="arreglo"),
        pytest.param(b'{"a":' * 100_000 + b"1" + b"}" * 100_000, id="objeto"),
        pytest.param(b'{"a": ' + b"[" * 100_000 + b"]" * 100_000 + b"}", id="dentro-de-un-campo"),
    ],
)
def test_un_json_anidado_a_miles_de_niveles_responde_400_y_no_500(cuerpo):
    respuesta = _json_crudo(cuerpo)

    assert respuesta.status_code == 400, (respuesta.status_code, respuesta.content[:200])
    assert respuesta.json()["success"] is False


@pytest.mark.django_db
def test_control_negativo_un_json_poco_profundo_se_lee_con_normalidad():
    respuesta = _json_crudo(b'{"email": "a@example.com", "password": "x"}')

    assert respuesta.status_code == 401, "un cuerpo normal llega a la vista (credenciales que no existen)"


# ── Revisión S7-2 (#8): sustitutos sueltos y cuerpos de formulario ──────────────────────────────────────────────────


@pytest.mark.parametrize(
    "valor",
    [
        pytest.param("\ud800", id="sustituto-alto-suelto"),
        pytest.param("x\udfffy", id="sustituto-bajo-en-medio"),
        pytest.param({"a": ["\ud83d"]}, id="anidado"),
    ],
)
def test_contiene_nul_tambien_ve_los_sustitutos_sueltos(valor):
    assert contiene_nul(valor) is True


def test_control_negativo_un_caracter_fuera_del_plano_basico_no_es_un_sustituto_suelto():
    assert contiene_nul("\U0001F600 emoji, ñ y acentos: áéíóú") is False


@pytest.mark.django_db
@pytest.mark.parametrize(
    "cuerpo",
    [
        pytest.param(b'{"email": "a@example.com", "password": "x", "otro": "\\ud800"}', id="sustituto-alto"),
        pytest.param(b'{"email": "a@example.com", "password": "x", "otro": "a\\udfffb"}', id="sustituto-bajo"),
    ],
)
def test_un_sustituto_suelto_en_el_cuerpo_json_responde_400(cuerpo):
    _rechazada(_json_crudo(cuerpo))


def _formulario(cuerpo, tipo="application/x-www-form-urlencoded"):
    return APIClient().generic("POST", LOGIN, cuerpo, content_type=tipo)


@pytest.mark.django_db
def test_un_nul_en_un_formulario_urlencoded_responde_400_antes_de_la_vista():
    _rechazada(_formulario(b"email=a%00b%40example.com&password=x"))


@pytest.mark.django_db
def test_un_nul_en_cualquiera_de_los_valores_repetidos_de_un_formulario_tambien():
    _rechazada(_formulario(b"email=a%40example.com&password=x&otro=1&otro=%00"))


@pytest.mark.django_db
def test_un_nul_en_un_campo_de_texto_de_un_multipart_responde_400_antes_de_la_vista():
    limite = "siep-limite"
    cuerpo = (
        f"--{limite}\r\nContent-Disposition: form-data; name=\"email\"\r\n\r\na\x00b@example.com\r\n"
        f"--{limite}\r\nContent-Disposition: form-data; name=\"password\"\r\n\r\nx\r\n--{limite}--\r\n"
    ).encode()

    _rechazada(_formulario(cuerpo, tipo=f"multipart/form-data; boundary={limite}"))


@pytest.mark.django_db
def test_control_negativo_un_formulario_normal_llega_a_la_vista():
    respuesta = _formulario(b"email=a%40example.com&password=x")

    assert respuesta.status_code == 401, "un formulario normal se lee y llega a la vista (credenciales que no existen)"


@pytest.mark.django_db
def test_control_negativo_con_el_analizador_de_formularios_de_drf_a_secas_el_nul_ya_no_se_rechaza_ahi(monkeypatch):
    from rest_framework.parsers import FormParser

    from shared import parsers

    monkeypatch.setattr(parsers.ObjectFormParser, "parse", FormParser.parse)

    respuesta = _formulario(b"email=a%00b%40example.com&password=x")

    assert respuesta.json().get("code") != CODIGO_NUL, "sin la revisión del analizador el NUL llega al serializador (que responde otro código)"
