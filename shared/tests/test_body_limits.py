"""S2-6a · Tope del cuerpo de las peticiones, antes de leerlas (RNF-002).

Con cuerpo, una petición responde 413 si su ``Content-Length`` pasa del tope de su clase de ruta, sin tocar el flujo;
si no declara longitud pero trae ``Transfer-Encoding``, el flujo se corta en cuanto pasa del tope; y un
``Content-Length`` que no es un entero ≥ 0 responde 400. La importación de estudiantes (multipart) tiene su tope.
"""

import io
import json
import logging
import re
from pathlib import Path

import pytest
from django.conf import settings
from django.core.handlers.wsgi import WSGIRequest
from django.http import HttpResponse
from django.test import override_settings
from rest_framework.test import APIClient

from psychosim.settings import base as ajustes_base
from shared import surface
from shared.body_limit import CASE_IMPORT_ROUTE, MULTIPART_IMPORT_ROUTE, BodyLimitMiddleware, BodyTooLarge

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security]

MIB = 1024 * 1024
BODY = "shared.body_limit.BodyLimitMiddleware"
SECURITY = "django.middleware.security.SecurityMiddleware"
# S2-4: WhiteNoise va en su subclase del SPA (no sirve index.html); ocupa el mismo sitio de la cadena.
WHITENOISE = "shared.static_files.SpaStaticFilesMiddleware"
LOGIN = "/api/auth/login"
IMPORTACION = "/api/grupos/7/estudiantes/import"
IMPORTACION_DE_CASOS = "/api/admin/cases/import"


class _Flujo:
    """Cuerpo falso: cuenta las lecturas y falla si se le piden bytes más allá de ``tope + 1``."""

    def __init__(self, total, tope):
        self.total = total
        self.tope = tope
        self.leidos = 0
        self.lecturas = 0

    def read(self, size=-1):
        self.lecturas += 1
        pendientes = self.total - self.leidos
        if size is None or size < 0:
            size = pendientes
        assert self.leidos + size <= self.tope + 1, "se pidió más allá del tope + 1 byte"
        size = min(size, pendientes)
        self.leidos += size
        return b"x" * size

    def readline(self, size=-1):
        return self.read(size)


def _peticion(ruta=LOGIN, *, metodo="POST", flujo=None, **cabeceras):
    """Una petición WSGI a mano: sin ``Content-Length`` salvo que venga en ``cabeceras``."""
    entorno = {
        "REQUEST_METHOD": metodo,
        "PATH_INFO": ruta,
        "SCRIPT_NAME": "",
        "SERVER_NAME": "testserver",
        "SERVER_PORT": "80",
        "wsgi.url_scheme": "http",
        "wsgi.input": flujo if flujo is not None else io.BytesIO(),
        **cabeceras,
    }
    return WSGIRequest(entorno)


def _vista_que_lee(request):
    return HttpResponse(request.body)


def _vista_sin_cuerpo(request):
    return HttpResponse("ok")


def _vista_que_no_debe_correr(request):
    raise AssertionError("la vista no debía ejecutarse: el middleware tenía que contestar antes")


def _afirmar_413(respuesta):
    assert respuesta.status_code == 413, respuesta.status_code
    cuerpo = json.loads(respuesta.content)
    assert cuerpo["success"] is False
    assert cuerpo["code"] == "REQUEST_TOO_LARGE"


# ── Content-Length declarado ─────────────────────────────────────────────────────────────────


def test_content_length_por_encima_del_tope_responde_413_sin_leer_el_cuerpo():
    tope = settings.SIEP_MAX_BODY_BYTES
    flujo = _Flujo(total=tope + 1, tope=tope)
    peticion = _peticion(flujo=flujo, CONTENT_LENGTH=str(tope + 1), CONTENT_TYPE="application/json")

    _afirmar_413(BodyLimitMiddleware(_vista_que_no_debe_correr)(peticion))
    assert flujo.lecturas == 0


def test_content_length_en_el_tope_exacto_llega_a_la_vista():
    tope = settings.SIEP_MAX_BODY_BYTES
    flujo = _Flujo(total=tope, tope=tope)
    peticion = _peticion(flujo=flujo, CONTENT_LENGTH=str(tope), CONTENT_TYPE="application/json")

    respuesta = BodyLimitMiddleware(_vista_que_lee)(peticion)

    assert respuesta.status_code == 200
    assert len(respuesta.content) == tope


def test_login_con_un_mib_mas_responde_413_por_content_length():
    respuesta = APIClient().post(
        LOGIN, data=b"x" * (settings.SIEP_MAX_BODY_BYTES + 1), content_type="application/json"
    )

    _afirmar_413(respuesta)


# ── Sin Content-Length: el lector acotado ────────────────────────────────────────────────────


def test_sin_content_length_el_flujo_se_corta_al_pasar_el_tope_y_no_se_consume_entero():
    tope = settings.SIEP_MAX_BODY_BYTES
    flujo = _Flujo(total=tope + 1000, tope=tope)
    peticion = _peticion(flujo=flujo, HTTP_TRANSFER_ENCODING="chunked")

    _afirmar_413(BodyLimitMiddleware(_vista_que_lee)(peticion))
    assert flujo.leidos <= tope + 1
    assert flujo.leidos < flujo.total


def test_sin_content_length_un_cuerpo_pequeno_llega_entero():
    flujo = _Flujo(total=100, tope=settings.SIEP_MAX_BODY_BYTES)
    peticion = _peticion(flujo=flujo, HTTP_TRANSFER_ENCODING="chunked")

    respuesta = BodyLimitMiddleware(_vista_que_lee)(peticion)

    assert respuesta.status_code == 200
    assert respuesta.content == b"x" * 100


def test_sin_cabeceras_de_cuerpo_no_se_lee_el_flujo_aunque_la_vista_lo_pida():
    flujo = _Flujo(total=10, tope=settings.SIEP_MAX_BODY_BYTES)
    peticion = _peticion(flujo=flujo)

    respuesta = BodyLimitMiddleware(_vista_que_lee)(peticion)

    assert respuesta.status_code == 200
    assert respuesta.content == b""
    assert flujo.lecturas == 0


# ── Content-Length que no es un entero ≥ 0 ──────────────────────────────────────────────────


@pytest.mark.parametrize("valor", ["abc", "-5"])
def test_content_length_que_no_es_un_entero_responde_400(valor):
    flujo = _Flujo(total=10, tope=settings.SIEP_MAX_BODY_BYTES)
    peticion = _peticion(flujo=flujo, CONTENT_LENGTH=valor)

    respuesta = BodyLimitMiddleware(_vista_que_no_debe_correr)(peticion)

    assert respuesta.status_code == 400
    assert json.loads(respuesta.content)["code"] == "REQUEST_INVALID_LENGTH"
    assert flujo.lecturas == 0


def test_content_length_vacio_cuenta_como_no_declarado():
    # PEP 3333: en WSGI la cabecera puede llegar vacía, y eso no es un error.
    peticion = _peticion(flujo=_Flujo(total=0, tope=settings.SIEP_MAX_BODY_BYTES), CONTENT_LENGTH="")

    assert BodyLimitMiddleware(_vista_sin_cuerpo)(peticion).status_code == 200


def test_los_metodos_sin_cuerpo_no_miran_el_content_length():
    peticion = _peticion(metodo="GET", CONTENT_LENGTH="abc")

    assert BodyLimitMiddleware(_vista_sin_cuerpo)(peticion).status_code == 200


# ── Dos topes: uno para las rutas JSON y otro para la importación de estudiantes ─────────────


def test_el_tope_depende_de_la_ruta():
    dos_mib = 2 * MIB
    json_grande = _peticion(LOGIN, flujo=_Flujo(dos_mib, MIB), CONTENT_LENGTH=str(dos_mib))
    _afirmar_413(BodyLimitMiddleware(_vista_que_no_debe_correr)(json_grande))

    importacion = _peticion(IMPORTACION, flujo=_Flujo(dos_mib, 3 * MIB), CONTENT_LENGTH=str(dos_mib))
    assert BodyLimitMiddleware(_vista_sin_cuerpo)(importacion).status_code == 200


def test_la_importacion_admite_su_tope_exacto_y_no_un_byte_mas():
    tope = 3 * MIB
    exacto = _peticion(IMPORTACION, flujo=_Flujo(tope, tope), CONTENT_LENGTH=str(tope))
    assert BodyLimitMiddleware(_vista_sin_cuerpo)(exacto).status_code == 200

    de_mas = _peticion(IMPORTACION, flujo=_Flujo(tope + 1, tope), CONTENT_LENGTH=str(tope + 1))
    _afirmar_413(BodyLimitMiddleware(_vista_que_no_debe_correr)(de_mas))


def test_la_ruta_multipart_reconoce_exactamente_las_filas_del_inventario():
    inventario = json.loads(Path(surface.__file__).with_name("surface-inventory.json").read_text(encoding="utf-8"))
    assert any(fila["body"] == "multipart-import" for fila in inventario["routes"])
    for fila in inventario["routes"]:
        # El inventario escribe las rutas sin barra inicial y con <int:pk>: se prueban con un pk cualquiera.
        ruta = "/" + re.sub(r"<[^>]+>", "1", fila["route"])
        assert bool(MULTIPART_IMPORT_ROUTE.fullmatch(ruta)) == (fila["body"] == "multipart-import"), fila["route"]
    assert MULTIPART_IMPORT_ROUTE.fullmatch(IMPORTACION + "/")


def test_la_importacion_de_casos_tiene_un_tope_propio_mas_holgado_que_el_json_comun():
    """Un documento de caso de 1 MiB + algo llega al importador (que lo rechaza con su 400 estructurado, E4); pasado
    el tope propio de 2 MiB, 413 en el borde."""
    holgado = MIB + 100 * 1024
    llega = _peticion(IMPORTACION_DE_CASOS, flujo=_Flujo(holgado, 2 * MIB), CONTENT_LENGTH=str(holgado))
    assert BodyLimitMiddleware(_vista_sin_cuerpo)(llega).status_code == 200

    de_mas = 2 * MIB + 1
    _afirmar_413(BodyLimitMiddleware(_vista_que_no_debe_correr)(
        _peticion(IMPORTACION_DE_CASOS, flujo=_Flujo(de_mas, 2 * MIB), CONTENT_LENGTH=str(de_mas))
    ))


def test_la_ruta_de_importacion_de_casos_reconoce_exactamente_las_dos_del_inventario():
    inventario = json.loads(Path(surface.__file__).with_name("surface-inventory.json").read_text(encoding="utf-8"))
    reconocidas = set()
    for fila in inventario["routes"]:
        ruta = "/" + re.sub(r"<[^>]+>", "1", fila["route"])
        if CASE_IMPORT_ROUTE.fullmatch(ruta):
            reconocidas.add((fila["method"], fila["route"]))
    assert reconocidas == {("POST", "api/admin/cases/import"), ("POST", "api/authoring/cases/import")}


# ── Ajustes, lugar en la cadena y registro ───────────────────────────────────────────────────


def test_los_topes_de_cuerpo_estan_definidos_en_los_ajustes():
    assert settings.SIEP_MAX_BODY_BYTES == MIB
    assert settings.SIEP_MAX_IMPORT_BODY_BYTES == 3 * MIB
    assert settings.SIEP_MAX_CASE_IMPORT_BODY_BYTES == 2 * MIB
    assert settings.DATA_UPLOAD_MAX_MEMORY_SIZE == max(settings.SIEP_MAX_BODY_BYTES, settings.SIEP_MAX_CASE_IMPORT_BODY_BYTES)
    assert settings.DATA_UPLOAD_MAX_NUMBER_FIELDS == 200


def test_el_middleware_va_justo_despues_de_securitymiddleware_y_antes_de_whitenoise():
    # La cadena de producción: la de pruebas quita WhiteNoise (como en test_security_headers.py).
    cadena = ajustes_base.MIDDLEWARE
    assert cadena.index(BODY) == cadena.index(SECURITY) + 1
    assert cadena.index(BODY) < cadena.index(WHITENOISE)


def test_un_bodytoolarge_que_escapa_de_la_vista_tambien_responde_413():
    respuesta = BodyLimitMiddleware(_vista_que_no_debe_correr).process_exception(_peticion(), BodyTooLarge())

    _afirmar_413(respuesta)


def test_cada_rechazo_se_registra_con_su_clase_y_sin_la_ruta(caplog):
    tope = settings.SIEP_MAX_BODY_BYTES
    peticion = _peticion(flujo=_Flujo(tope + 1, tope), CONTENT_LENGTH=str(tope + 1))

    with caplog.at_level(logging.INFO, logger="siep.security"):
        BodyLimitMiddleware(_vista_que_no_debe_correr)(peticion)

    eventos = [getattr(registro, "fields", None) for registro in caplog.records if registro.name == "siep.security"]
    assert eventos == [{"event": "body_too_large", "scope": "json-small"}]


# ── Controles negativos: con el control apagado, la comprobación falla ──────────────────────


def test_control_negativo_sin_el_middleware_el_login_grande_no_responde_413():
    cadena = [middleware for middleware in settings.MIDDLEWARE if middleware != BODY]
    with override_settings(MIDDLEWARE=cadena):
        respuesta = APIClient().post(
            LOGIN, data=b"x" * (settings.SIEP_MAX_BODY_BYTES + 1), content_type="application/json"
        )

    with pytest.raises(AssertionError):
        _afirmar_413(respuesta)


def test_control_negativo_sin_el_lector_acotado_el_cuerpo_chunked_llega_vacio():
    # Sin el lector, Django crea su LimitedStream con Content-Length 0: un cuerpo chunked no se lee.
    peticion = _peticion(flujo=_Flujo(total=100, tope=settings.SIEP_MAX_BODY_BYTES), HTTP_TRANSFER_ENCODING="chunked")

    respuesta = _vista_que_lee(peticion)

    with pytest.raises(AssertionError):
        assert respuesta.content == b"x" * 100
