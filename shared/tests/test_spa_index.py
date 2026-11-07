"""El HTML del SPA lo sirve SIEMPRE la vista ``spa_index`` y lleva el nonce de la petición (plan 03, S2-4, ADR-S3 opción A).

La política de contenido en vigor (``SECURE_CSP``, tras ``SIEP_CSP_ENFORCE``) pone ``'nonce-…'`` en ``script-src`` y
``style-src``; Angular lo lee de ``ngCspNonce`` en ``<app-root>`` y lo copia a los ``<style>`` que inyecta. Para que cuadre:

- ``spa_index`` escribe en el HTML el MISMO nonce que el middleware pone en la cabecera, distinto en cada petición;
- WhiteNoise no sirve nunca ``index.html`` (ni ``/index.html`` ni ``/``): un HTML crudo llevaría el marcador sin sustituir
  y la CSP bloquearía los estilos de Angular;
- la respuesta no se guarda en ninguna caché (``no-store``): el nonce es único por petición.

Las pruebas montan la cadena de PRODUCCIÓN (``psychosim.settings.base``), no la de pruebas, porque ``settings/test.py``
quita WhiteNoise y ``shared.test_attestation`` pone ``Cache-Control: no-store`` a TODA respuesta (con ella, ningún
``no-store`` probaría nada). Cada control tiene su control negativo: con el control apagado, la misma comprobación falla.
"""
import importlib.util
import re
from pathlib import Path

import pytest
from django.test import Client, override_settings

import shared.spa as spa
from psychosim.settings import base as ajustes_base
from shared.spa import NONCE_MARKER

pytestmark = [
    pytest.mark.req("RNF-002"),
    pytest.mark.security,
    # WhiteNoise avisa de que STATIC_ROOT no existe en las pruebas; el aviso no es un fallo del control.
    pytest.mark.filterwarnings("ignore:No directory at:UserWarning"),
]

ROOT = Path(__file__).resolve().parents[3]  # raíz del repositorio
WHITENOISE = "whitenoise.middleware.WhiteNoiseMiddleware"
ESTATICOS_DEL_SPA = "shared.static_files.SpaStaticFilesMiddleware"
CSP_MIDDLEWARE = "django.middleware.csp.ContentSecurityPolicyMiddleware"
CABECERA_APLICADA = "Content-Security-Policy"
CABECERA_REPORTE = "Content-Security-Policy-Report-Only"

# Lo que deja el build de producción de Angular con ``inlineCritical`` apagado (el marcador en ngcspnonce y en cada script),
# más un <style> con nonce para probar que se sustituyen TODAS las apariciones.
HTML = (
    '<!doctype html><html lang="es"><head><title>SPA</title>'
    f'<link rel="stylesheet" href="styles-ABC.css"><style nonce="{NONCE_MARKER}">a{{color:red}}</style></head>'
    f'<body><app-root ngcspnonce="{NONCE_MARKER}"></app-root>'
    f'<script src="main-ABC.js" type="module" nonce="{NONCE_MARKER}"></script></body></html>'
)
NONCE_EN_EL_HTML = re.compile(r'ngcspnonce="([^"]*)"')
NONCE_EN_LA_POLITICA = re.compile(r"'nonce-([^']+)'")


def _cadena(*, quitar=(), reemplazar=None):
    """La cadena de producción, sin los middleware de ``quitar`` y con los de ``reemplazar`` (``{viejo: nuevo}``) cambiados."""
    reemplazar = reemplazar or {}
    return [reemplazar.get(middleware, middleware) for middleware in ajustes_base.MIDDLEWARE if middleware not in quitar]


def _spa(tmp_path):
    """Un directorio de SPA de prueba: ``index.html`` con el marcador y un ``main-ABC.js`` que sí sirve WhiteNoise."""
    raiz = tmp_path / "spa"
    raiz.mkdir()
    (raiz / "index.html").write_text(HTML, encoding="utf-8")
    (raiz / "main-ABC.js").write_text("console.log('ok');", encoding="utf-8")
    return raiz


def _obtener(raiz, ruta="/portal/anything", *, cadena=None, **ajustes):
    """GET ``ruta`` con la cadena de producción, WhiteNoise sobre ``raiz`` y la política en vigor (``SECURE_CSP``).

    El cliente se crea DENTRO del override: WhiteNoise lee sus ajustes al cargarse, en la primera petición.
    """
    ajustes.setdefault("SECURE_CSP", ajustes_base.CSP_ENFORCED_POLICY)
    ajustes.setdefault("SECURE_CSP_REPORT_ONLY", {})
    with override_settings(
        MIDDLEWARE=cadena if cadena is not None else _cadena(),
        SPA_DIST_DIR=raiz,
        WHITENOISE_ROOT=str(raiz),
        **ajustes,
    ):
        return Client().get(ruta)


def _cuerpo(respuesta):
    """El cuerpo como texto; un archivo de WhiteNoise llega en un ``FileResponse`` (sin ``content``, y se lee una sola vez)."""
    if not hasattr(respuesta, "_cuerpo_leido"):
        crudo = respuesta.getvalue() if respuesta.streaming else respuesta.content
        respuesta._cuerpo_leido = crudo.decode("utf-8")
    return respuesta._cuerpo_leido


def _nonces_del_html(respuesta):
    return NONCE_EN_EL_HTML.findall(_cuerpo(respuesta))


def _nonce_de_la_directiva(politica, directiva):
    """El nonce que la política pone en ``directiva`` (o ``None``)."""
    for trozo in politica.split(";"):
        partes = trozo.split()
        if partes and partes[0] == directiva:
            encontrado = NONCE_EN_LA_POLITICA.search(trozo)
            return encontrado.group(1) if encontrado else None
    return None


def _afirmar_servido_por_la_vista(respuesta):
    """El HTML salió de ``spa_index``: sin marcador y con el nonce de la petición escrito."""
    cuerpo = _cuerpo(respuesta)
    assert respuesta.status_code == 200
    assert NONCE_MARKER not in cuerpo, "el marcador del nonce sobrevive en la respuesta"
    assert re.fullmatch(r"[A-Za-z0-9_-]{16,}", (_nonces_del_html(respuesta) or [""])[0]), "sin nonce en el HTML"


def _ajustes_base_con_bandera(monkeypatch, valor):
    """Carga ``psychosim/settings/base.py`` como módulo aparte, con ``SIEP_CSP_ENFORCE`` puesta o quitada."""
    if valor is None:
        monkeypatch.delenv("SIEP_CSP_ENFORCE", raising=False)
    else:
        monkeypatch.setenv("SIEP_CSP_ENFORCE", valor)
    especificacion = importlib.util.spec_from_file_location("ajustes_base_vigor", ajustes_base.__file__)
    modulo = importlib.util.module_from_spec(especificacion)
    especificacion.loader.exec_module(modulo)
    return modulo


# ── El nonce del HTML ────────────────────────────────────────────────────────────────────────────


def test_spa_index_escribe_el_nonce_de_la_peticion_y_el_marcador_no_sobrevive(tmp_path):
    respuesta = _obtener(_spa(tmp_path))

    _afirmar_servido_por_la_vista(respuesta)
    # TODAS las apariciones: ngcspnonce, el <style> y el <script> llevan el mismo valor y ninguna conserva el marcador.
    cuerpo = _cuerpo(respuesta)
    nonce = _nonces_del_html(respuesta)[0]
    assert cuerpo.count(nonce) == 3 and cuerpo.count(f'ngcspnonce="{nonce}"') == 1


def test_dos_peticiones_reciben_nonces_distintos(tmp_path):
    raiz = _spa(tmp_path)

    primero = _nonces_del_html(_obtener(raiz))[0]
    segundo = _nonces_del_html(_obtener(raiz))[0]

    assert primero != segundo


def test_el_nonce_de_la_cabecera_es_el_mismo_del_html_en_script_src_y_style_src(tmp_path):
    respuesta = _obtener(_spa(tmp_path))

    nonce = _nonces_del_html(respuesta)[0]
    politica = respuesta[CABECERA_APLICADA]
    assert _nonce_de_la_directiva(politica, "script-src") == nonce
    assert _nonce_de_la_directiva(politica, "style-src") == nonce
    assert CABECERA_REPORTE not in respuesta


def test_la_respuesta_del_spa_no_se_guarda_en_ninguna_cache(tmp_path):
    respuesta = _obtener(_spa(tmp_path))

    assert "no-store" in respuesta["Cache-Control"]
    assert respuesta["Content-Type"].startswith("text/html")


def test_sin_construir_el_spa_responde_404(tmp_path):
    vacio = tmp_path / "vacio"
    vacio.mkdir()

    assert _obtener(vacio).status_code == 404


def test_sin_el_middleware_de_csp_no_se_rompe_y_no_deja_el_marcador(tmp_path):
    respuesta = _obtener(_spa(tmp_path), cadena=_cadena(quitar=(CSP_MIDDLEWARE,)))

    assert respuesta.status_code == 200
    assert NONCE_MARKER not in _cuerpo(respuesta)
    assert _nonces_del_html(respuesta) == [""]
    assert CABECERA_APLICADA not in respuesta


def test_el_html_real_del_frontend_lleva_el_marcador_que_el_servidor_sustituye(tmp_path):
    """Contrato entre las dos mitades: el ``index.html`` fuente trae el marcador del servidor en ``ngCspNonce``."""
    fuente = ROOT / "frontend" / "src" / "index.html"
    html = fuente.read_text(encoding="utf-8")
    assert re.search(rf'<app-root\s+ngCspNonce="{re.escape(NONCE_MARKER)}"', html), "ngCspNonce sin el marcador del servidor"

    raiz = tmp_path / "real"
    raiz.mkdir()
    (raiz / "index.html").write_text(html, encoding="utf-8")
    respuesta = _obtener(raiz)

    assert respuesta.status_code == 200
    assert NONCE_MARKER not in _cuerpo(respuesta)
    assert re.search(r'<app-root\s+ngCspNonce="[A-Za-z0-9_-]{16,}"', _cuerpo(respuesta))


# ── WhiteNoise no sirve el HTML ──────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("ruta", ["/", "/index.html"])
@pytest.mark.parametrize("indice_de_whitenoise", [False, True])
def test_whitenoise_no_sirve_ni_la_raiz_ni_index_html(tmp_path, ruta, indice_de_whitenoise):
    # Con WHITENOISE_INDEX_FILE=True WhiteNoise serviría «/» desde index.html; el middleware del SPA lo impide igual.
    respuesta = _obtener(_spa(tmp_path), ruta, WHITENOISE_INDEX_FILE=indice_de_whitenoise)

    _afirmar_servido_por_la_vista(respuesta)
    assert "no-store" in respuesta["Cache-Control"]
    # Lo que WhiteNoise añade a TODO archivo que sirve: si aparece, el HTML salió de él.
    assert "Access-Control-Allow-Origin" not in respuesta


def test_whitenoise_sigue_sirviendo_los_demas_archivos_del_spa(tmp_path):
    respuesta = _obtener(_spa(tmp_path), "/main-ABC.js")

    assert respuesta.status_code == 200
    assert respuesta["Access-Control-Allow-Origin"] == "*"
    assert "public" in respuesta["Cache-Control"]
    # Y el estático lleva la política igual que el HTML.
    assert CABECERA_APLICADA in respuesta


def test_el_settings_de_produccion_no_deja_a_whitenoise_servir_el_indice():
    assert ajustes_base.WHITENOISE_INDEX_FILE is False
    assert ESTATICOS_DEL_SPA in ajustes_base.MIDDLEWARE
    assert WHITENOISE not in ajustes_base.MIDDLEWARE
    cadena = ajustes_base.MIDDLEWARE
    assert cadena.index(CSP_MIDDLEWARE) < cadena.index(ESTATICOS_DEL_SPA)


def test_el_middleware_del_spa_saca_index_html_de_la_tabla_de_archivos(tmp_path):
    from django.conf import settings

    from shared.static_files import SpaStaticFilesMiddleware

    raiz = _spa(tmp_path)
    with override_settings(WHITENOISE_ROOT=str(raiz), WHITENOISE_INDEX_FILE=True):
        middleware = SpaStaticFilesMiddleware(lambda request: None, settings=settings)

    assert "/main-ABC.js" in middleware.files
    assert "/index.html" not in middleware.files
    assert "/" not in middleware.files


def test_el_middleware_del_spa_tampoco_sirve_el_indice_en_modo_autorefresco(tmp_path):
    # Con WHITENOISE_AUTOREFRESH (DEBUG) WhiteNoise busca en disco en cada petición: ``find_file`` no debe hallar el índice.
    from django.conf import settings

    from shared.static_files import SpaStaticFilesMiddleware

    raiz = _spa(tmp_path)
    with override_settings(WHITENOISE_ROOT=str(raiz), WHITENOISE_INDEX_FILE=True, WHITENOISE_AUTOREFRESH=True):
        middleware = SpaStaticFilesMiddleware(lambda request: None, settings=settings)

    assert middleware.find_file("/main-ABC.js") is not None
    assert middleware.find_file("/index.html") is None
    assert middleware.find_file("/") is None


# ── La bandera SIEP_CSP_ENFORCE ──────────────────────────────────────────────────────────────────


def test_con_la_bandera_apagada_no_hay_content_security_policy_pero_si_report_only(tmp_path, monkeypatch):
    ajustes = _ajustes_base_con_bandera(monkeypatch, None)
    assert ajustes.SIEP_CSP_ENFORCE is False

    respuesta = _obtener(
        _spa(tmp_path), SECURE_CSP=ajustes.SECURE_CSP, SECURE_CSP_REPORT_ONLY=ajustes.SECURE_CSP_REPORT_ONLY,
    )

    _afirmar_servido_por_la_vista(respuesta)
    assert CABECERA_APLICADA not in respuesta
    assert CABECERA_REPORTE in respuesta


def test_con_la_bandera_encendida_hay_content_security_policy_con_nonce_y_sin_report_only(tmp_path, monkeypatch):
    ajustes = _ajustes_base_con_bandera(monkeypatch, "true")
    assert ajustes.SIEP_CSP_ENFORCE is True

    respuesta = _obtener(
        _spa(tmp_path), SECURE_CSP=ajustes.SECURE_CSP, SECURE_CSP_REPORT_ONLY=ajustes.SECURE_CSP_REPORT_ONLY,
    )

    nonce = _nonces_del_html(respuesta)[0]
    assert _nonce_de_la_directiva(respuesta[CABECERA_APLICADA], "script-src") == nonce
    # Dos cabeceras con la misma política informarían dos veces cada violación.
    assert CABECERA_REPORTE not in respuesta


# ── Controles negativos: con el control apagado, la misma comprobación falla ─────────────────────


@pytest.mark.parametrize(("ruta", "indice_de_whitenoise"), [("/index.html", False), ("/", True)])
def test_control_negativo_con_whitenoise_a_secas_el_indice_sale_crudo_con_el_marcador(tmp_path, ruta, indice_de_whitenoise):
    cadena = _cadena(reemplazar={ESTATICOS_DEL_SPA: WHITENOISE})

    respuesta = _obtener(_spa(tmp_path), ruta, cadena=cadena, WHITENOISE_INDEX_FILE=indice_de_whitenoise)

    # WhiteNoise a secas devuelve el archivo tal cual, con el marcador sin sustituir: la CSP bloquearía los estilos de Angular.
    assert NONCE_MARKER in _cuerpo(respuesta)
    with pytest.raises(AssertionError, match="marcador"):
        _afirmar_servido_por_la_vista(respuesta)


def test_control_negativo_si_la_vista_no_sustituye_el_marcador_la_comprobacion_falla(tmp_path, monkeypatch):
    monkeypatch.setattr(spa, "NONCE_MARKER", "__OTRO_MARCADOR__")

    respuesta = _obtener(_spa(tmp_path))

    with pytest.raises(AssertionError, match="marcador"):
        _afirmar_servido_por_la_vista(respuesta)


def test_control_negativo_una_politica_sin_el_nonce_no_coincide_con_el_html(tmp_path):
    sin_nonce = {
        directiva: [valor for valor in valores if "NONCE" not in str(valor)]
        for directiva, valores in ajustes_base.CSP_ENFORCED_POLICY.items()
    }

    respuesta = _obtener(_spa(tmp_path), SECURE_CSP=sin_nonce)

    nonce = _nonces_del_html(respuesta)[0]
    assert _nonce_de_la_directiva(respuesta[CABECERA_APLICADA], "style-src") != nonce
    assert _nonce_de_la_directiva(respuesta[CABECERA_APLICADA], "style-src") is None


def test_control_negativo_con_un_generador_de_nonce_fijo_el_nonce_se_repite_y_la_comprobacion_lo_ve(tmp_path, monkeypatch):
    # ``LazyNonce`` llama a ``generate_nonce`` al construirse: con uno fijo el nonce se repite entre peticiones, que es
    # justo lo que la prueba de «nonces distintos» tiene que poder detectar.
    monkeypatch.setattr("django.utils.csp.generate_nonce", lambda: "n" * 22)
    raiz = _spa(tmp_path)

    primero = _nonces_del_html(_obtener(raiz))[0]
    segundo = _nonces_del_html(_obtener(raiz))[0]

    assert primero == segundo
