"""Informe de violaciones de la CSP (plan 03, S2-3a, RNF-002): la ruta que recibe los informes del navegador.

Es anónima (no mira credenciales), la limita el límite por IP y responde 204 sin cuerpo. Cada informe deja UNA línea
``csp_violation`` en ``siep.security`` con cinco campos fijos: la directiva, el esquema y el host del recurso bloqueado,
la ruta del documento (sin consulta ni fragmento, con los números y los uuid cambiados por ``:id``) y la disposición.
Nada más sale del servidor: ni la consulta, ni la muestra del script, ni las cabeceras.

Los valores sensibles de estas pruebas (correos, tokens, muestras de script) se generan en cada ejecución.
"""
import json
import logging
import secrets

import pytest
from django.test import Client

from apps.security import limiter
from apps.security.limits import LIMITS, Limit

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security, pytest.mark.django_db]

RUTA = "/api/security/csp-report"
CLASICO = "application/csp-report"
REPORTES = "application/reports+json"
IP = "203.0.113.50"
INSTANTE = 1_800_000_000.0
DOCUMENTO = "https://siep.ejemplo.org/portal/caso/42"
ESPERADO_BASE = {
    "event": "csp_violation",
    "directive": "script-src-elem",
    "blocked": "https://cdn.ejemplo.org",
    "document_path": "/portal/caso/:id",
    "disposition": "report",
}


def _informe_clasico(**cambios):
    """Un informe en el formato clásico (``{"csp-report": {...}}``); ``cambios`` pisa campos (con guiones)."""
    informe = {
        "document-uri": DOCUMENTO,
        "referrer": "",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src-elem",
        "original-policy": "default-src 'self'",
        "disposition": "report",
        "blocked-uri": "https://cdn.ejemplo.org/libreria.js",
        "line-number": 10,
        "column-number": 3,
        "source-file": DOCUMENTO,
        "status-code": 200,
        "script-sample": "",
    }
    informe.update(cambios)
    return {"csp-report": informe}


def _elemento_reporte(**cambios):
    """Un elemento de ``application/reports+json`` (la API de informes del navegador)."""
    cuerpo = {
        "documentURL": DOCUMENTO,
        "referrer": "",
        "blockedURL": "https://cdn.ejemplo.org/libreria.js",
        "effectiveDirective": "script-src-elem",
        "originalPolicy": "default-src 'self'",
        "disposition": "report",
        "sample": "",
        "statusCode": 200,
    }
    cuerpo.update(cambios)
    return {"type": "csp-violation", "age": 0, "url": DOCUMENTO, "user_agent": "Mozilla/5.0", "body": cuerpo}


def _elemento_ligero(n):
    """Un elemento mínimo de ``application/reports+json`` (unos 190 bytes): treinta caben en el tope de 8 KB."""
    cuerpo = {
        "blockedURL": f"https://cdn{n}.ejemplo.org/x.js",
        "documentURL": DOCUMENTO,
        "effectiveDirective": "script-src-elem",
    }
    return {"type": "csp-violation", "body": cuerpo}


def _enviar(cliente, cuerpo, tipo=CLASICO, **extra):
    """POST del informe tal cual (texto), con el tipo de medio dado y desde la IP de prueba. Sin sesión."""
    return cliente.post(RUTA, cuerpo, content_type=tipo, REMOTE_ADDR=IP, **extra)


def _violaciones(registros):
    """Los campos de cada línea ``csp_violation`` registrada en ``siep.security``."""
    return [
        registro.fields
        for registro in registros.records
        if registro.name == "siep.security" and getattr(registro, "fields", {}).get("event") == "csp_violation"
    ]


def _informe_con_datos_personales(token, correo):
    consulta = f"?token={token}&email={correo}"
    return _informe_clasico(
        **{
            "blocked-uri": f"https://cdn.ejemplo.org/rastreador.js{consulta}",
            "document-uri": f"{DOCUMENTO}{consulta}#seccion-{correo}",
        }
    )


def _afirmar_sin_datos_personales(registrado, token, correo):
    assert len(registrado) == 1, registrado
    texto = json.dumps(registrado)
    assert token not in texto, "el token de la consulta se registró"
    assert correo not in texto, "el correo de la consulta se registró"
    assert "?" not in texto and "#" not in texto, "la consulta o el fragmento se registraron"
    assert registrado[0]["blocked"] == "https://cdn.ejemplo.org"
    assert registrado[0]["document_path"] == "/portal/caso/:id"


@pytest.fixture
def cliente():
    return Client()


@pytest.fixture
def registros(caplog):
    caplog.set_level(logging.INFO, logger="siep.security")
    return caplog


@pytest.fixture
def reloj(monkeypatch):
    """El reloj del limitador queda fijo: ninguna ventana cambia a mitad de la prueba."""
    monkeypatch.setattr(limiter, "_now", lambda: INSTANTE)


@pytest.fixture
def limitador(settings):
    settings.SIEP_THROTTLE_ENABLED = True
    return settings


# ── Formatos y registro ──────────────────────────────────────────────────────────────────────────


def test_el_formato_clasico_da_204_sin_cuerpo_y_una_linea_csp_violation(cliente, registros):
    respuesta = _enviar(cliente, json.dumps(_informe_clasico()), CLASICO)

    assert respuesta.status_code == 204
    assert respuesta.content == b""
    assert _violaciones(registros) == [ESPERADO_BASE]


def test_el_formato_de_reportes_da_204_y_una_linea_csp_violation(cliente, registros):
    respuesta = _enviar(cliente, json.dumps([_elemento_reporte()]), REPORTES)

    assert respuesta.status_code == 204
    assert _violaciones(registros) == [ESPERADO_BASE]


@pytest.mark.parametrize(
    ("tipo", "cuerpo"),
    [
        (CLASICO, json.dumps(_informe_clasico())),
        ("application/json", json.dumps(_informe_clasico())),
        (REPORTES, json.dumps([_elemento_reporte()])),
    ],
)
def test_los_tres_tipos_de_medio_se_aceptan_sin_sesion(cliente, registros, tipo, cuerpo):
    respuesta = _enviar(cliente, cuerpo, tipo, HTTP_AUTHORIZATION="Bearer no-es-un-token-valido")

    assert respuesta.status_code == 204
    assert len(_violaciones(registros)) == 1


def test_reportes_registra_como_mucho_tres_informes_por_peticion(cliente, registros):
    # Treinta informes en una sola petición dejan tres líneas: el resto se descarta en silencio y la respuesta es 204.
    cuerpo = [_elemento_ligero(n) for n in range(30)]

    respuesta = _enviar(cliente, json.dumps(cuerpo), REPORTES)

    assert respuesta.status_code == 204
    assert [v["blocked"] for v in _violaciones(registros)] == [f"https://cdn{n}.ejemplo.org" for n in range(3)]


def test_control_negativo_con_tope_de_diez_la_prueba_de_tres_falla(cliente, registros, monkeypatch):
    from apps.security import csp_report

    monkeypatch.setattr(csp_report, "MAX_INFORMES", 10)
    cuerpo = [_elemento_ligero(n) for n in range(30)]
    _enviar(cliente, json.dumps(cuerpo), REPORTES)

    with pytest.raises(AssertionError):
        assert len(_violaciones(registros)) == 3


def test_reportes_no_registra_los_elementos_que_no_son_violaciones_de_csp(cliente, registros):
    cuerpo = [
        {"type": "deprecation", "body": {"id": "api-antigua", "message": "obsoleto"}},
        _elemento_reporte(blockedURL="https://cdn.ejemplo.org/otro.js"),
    ]

    respuesta = _enviar(cliente, json.dumps(cuerpo), REPORTES)

    assert respuesta.status_code == 204
    assert [v["blocked"] for v in _violaciones(registros)] == ["https://cdn.ejemplo.org"]


# ── Privacidad: lo que sale al registro ──────────────────────────────────────────────────────────


def test_la_consulta_y_los_datos_personales_no_se_registran(cliente, registros):
    token = secrets.token_urlsafe(24)
    correo = f"alumna.{secrets.token_hex(4)}@ejemplo.org"

    respuesta = _enviar(cliente, json.dumps(_informe_con_datos_personales(token, correo)), CLASICO)

    assert respuesta.status_code == 204
    _afirmar_sin_datos_personales(_violaciones(registros), token, correo)


def test_control_negativo_registrar_la_url_completa_hace_fallar_la_privacidad(cliente, registros, monkeypatch):
    from apps.security import csp_report

    # El fallo que se quiere cazar: registrar el recurso bloqueado entero, con su consulta.
    monkeypatch.setattr(csp_report, "_recurso_bloqueado", lambda valor: valor)
    token = secrets.token_urlsafe(24)
    correo = f"alumna.{secrets.token_hex(4)}@ejemplo.org"
    _enviar(cliente, json.dumps(_informe_con_datos_personales(token, correo)), CLASICO)

    with pytest.raises(AssertionError, match="se registró"):
        _afirmar_sin_datos_personales(_violaciones(registros), token, correo)


def test_la_muestra_del_script_no_se_registra(cliente, registros):
    marca = secrets.token_hex(8)

    _enviar(cliente, json.dumps(_informe_clasico(**{"script-sample": f"alert('{marca}')"})), CLASICO)

    registrado = _violaciones(registros)
    assert len(registrado) == 1
    assert marca not in json.dumps(registrado)


@pytest.mark.parametrize("bloqueado", ["inline", "eval", "data", "blob", "self"])
def test_las_palabras_clave_de_bloqueo_se_registran_tal_cual(cliente, registros, bloqueado):
    _enviar(cliente, json.dumps(_informe_clasico(**{"blocked-uri": bloqueado})), CLASICO)

    assert _violaciones(registros)[0]["blocked"] == bloqueado


def test_del_recurso_bloqueado_solo_quedan_esquema_y_host(cliente, registros):
    clave = secrets.token_hex(8)
    url = f"https://usuario:{clave}@cdn.ejemplo.org:8443/libreria.js?v=2#inicio"

    _enviar(cliente, json.dumps(_informe_clasico(**{"blocked-uri": url})), CLASICO)

    registrado = _violaciones(registros)[0]
    assert registrado["blocked"] == "https://cdn.ejemplo.org:8443"
    assert clave not in json.dumps(registrado)


def test_la_ruta_del_documento_cambia_numeros_y_uuid_por_id_y_no_lleva_consulta(cliente, registros):
    documento = "https://siep.ejemplo.org/portal/caso/3f2504e0-4f89-11d3-9a0c-0305e82c3301/intento/77/?ficha=abc#x"

    _enviar(cliente, json.dumps(_informe_clasico(**{"document-uri": documento})), CLASICO)

    assert _violaciones(registros)[0]["document_path"] == "/portal/caso/:id/intento/:id/"


def test_la_ruta_del_documento_se_acota_a_ciento_veinte_caracteres(cliente, registros):
    documento = "https://siep.ejemplo.org/" + "a" * 200

    _enviar(cliente, json.dumps(_informe_clasico(**{"document-uri": documento})), CLASICO)

    assert _violaciones(registros)[0]["document_path"] == "/" + "a" * 119


def test_la_directiva_solo_lleva_letras_y_guiones_y_cuarenta_caracteres_como_mucho(cliente, registros):
    _enviar(cliente, json.dumps(_informe_clasico(**{"effective-directive": "Script-SRC_" + "x" * 60})), CLASICO)

    assert _violaciones(registros)[0]["directive"] == "cript-" + "x" * 34


@pytest.mark.parametrize(("valor", "esperado"), [("report", "report"), ("enforce", "enforce"), ("otra", "")])
def test_la_disposicion_solo_admite_report_o_enforce(cliente, registros, valor, esperado):
    _enviar(cliente, json.dumps(_informe_clasico(disposition=valor)), CLASICO)

    assert _violaciones(registros)[0]["disposition"] == esperado


# ── Tamaño, tipo de medio y forma del cuerpo ─────────────────────────────────────────────────────


def test_el_limite_de_ocho_kb_es_exacto(cliente):
    base = len(json.dumps(_informe_clasico(referrer="")).encode())
    justo = json.dumps(_informe_clasico(referrer="a" * (8192 - base)))
    de_mas = json.dumps(_informe_clasico(referrer="a" * (8193 - base)))
    assert len(justo.encode()) == 8192
    assert len(de_mas.encode()) == 8193

    assert _enviar(cliente, justo, CLASICO).status_code == 204
    assert _enviar(cliente, de_mas, CLASICO).status_code == 413


def test_mas_de_ocho_kb_con_content_length_da_413_sin_leer_el_cuerpo(cliente, registros):
    # Content-Length declara 9000 bytes y el cuerpo real es corto: si la vista leyera primero, respondería 204 o 400.
    respuesta = _enviar(cliente, json.dumps(_informe_clasico()), CLASICO, CONTENT_LENGTH="9000")

    assert respuesta.status_code == 413
    assert respuesta.json()["code"] == "REQUEST_TOO_LARGE"
    assert _violaciones(registros) == []


def test_sin_content_length_da_411_y_no_lee_el_flujo_del_servidor(cliente, registros):
    class FlujoQueNoDebeLeerse:
        def read(self, *args, **kwargs):
            raise AssertionError("la vista leyó el flujo crudo sin saber cuánto viene")

        readline = read  # Django envuelve el flujo en un LimitedStream que lo pide al construirse

    cuerpo = json.dumps(_informe_clasico(**{"document-uri": "https://siep.ejemplo.org/" + "a" * 9000}))
    assert len(cuerpo.encode()) > 8192

    respuesta = _enviar(cliente, cuerpo, CLASICO, CONTENT_LENGTH="", **{"wsgi.input": FlujoQueNoDebeLeerse()})

    assert respuesta.status_code == 411
    assert respuesta.json()["code"] == "LENGTH_REQUIRED"
    assert _violaciones(registros) == []


@pytest.mark.parametrize("tipo", ["text/plain", "text/html", "application/xml"])
def test_otro_tipo_de_medio_da_415_con_el_sobre_de_error(cliente, registros, tipo):
    respuesta = _enviar(cliente, json.dumps(_informe_clasico()), tipo)

    assert respuesta.status_code == 415
    assert respuesta.json()["success"] is False
    assert respuesta.json()["code"] == "UNSUPPORTED_MEDIA_TYPE"
    assert _violaciones(registros) == []


def test_json_invalido_da_400_sin_eco_del_contenido(cliente, registros):
    marca = secrets.token_hex(8)

    respuesta = _enviar(cliente, '{"csp-report": {"blocked-uri": "' + marca, CLASICO)

    assert respuesta.status_code == 400
    assert respuesta.json()["code"] == "VALIDATION_ERROR"
    assert marca.encode() not in respuesta.content
    assert _violaciones(registros) == []


@pytest.mark.parametrize("cuerpo", ["7", '"texto"', "null", '{"otro": 1}'])
def test_un_cuerpo_que_no_es_un_informe_da_400_sin_eco(cliente, registros, cuerpo):
    respuesta = _enviar(cliente, cuerpo, CLASICO)

    assert respuesta.status_code == 400
    assert respuesta.json()["code"] == "VALIDATION_ERROR"
    assert _violaciones(registros) == []


# ── Límite por IP ────────────────────────────────────────────────────────────────────────────────


def test_el_cuarto_informe_de_la_misma_ip_da_429(cliente, reloj, limitador, monkeypatch):
    monkeypatch.setitem(LIMITS, "csp_report_ip", Limit(3, 60))

    respuestas = [_enviar(cliente, json.dumps(_informe_clasico()), CLASICO) for _ in range(4)]

    assert [r.status_code for r in respuestas] == [204, 204, 204, 429]
    assert respuestas[-1].json()["code"] == "THROTTLED"
    assert int(respuestas[-1]["Retry-After"]) >= 1


def test_control_negativo_sin_throttle_el_cuarto_informe_no_da_429(cliente, reloj, limitador, monkeypatch):
    from apps.security.csp_report import CspReportView

    monkeypatch.setitem(LIMITS, "csp_report_ip", Limit(3, 60))
    monkeypatch.setattr(CspReportView, "throttle_classes", [])
    respuestas = [_enviar(cliente, json.dumps(_informe_clasico()), CLASICO) for _ in range(4)]

    with pytest.raises(AssertionError):
        assert [r.status_code for r in respuestas] == [204, 204, 204, 429]


def test_control_negativo_sin_throttle_la_guardia_del_inventario_falla(monkeypatch):
    from apps.security.csp_report import CspReportView
    from shared.tests.test_surface_inventory import _afirmar_inventario_al_dia

    monkeypatch.setattr(CspReportView, "throttle_classes", [])

    with pytest.raises(AssertionError, match="no coincide"):
        _afirmar_inventario_al_dia()
