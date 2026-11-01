"""Política de contenido EN VIGOR (plan 03, S2-4, RNF-002): ``SECURE_CSP`` detrás de ``SIEP_CSP_ENFORCE``.

Apagada (por defecto) la bandera deja la política de reporte de S2-3a tal cual (la cubre ``test_csp_politica.py``);
encendida, la cabecera que se aplica es ``Content-Security-Policy`` con el nonce de la petición en ``script-src`` y
``style-src`` y SIN ``'unsafe-inline'`` en los scripts ni en los ``<style>``; la cabecera de reporte se omite (dos cabeceras
con la misma política informarían dos veces cada violación). Con el acceso con Google configurado hay UN permiso
excepcional, solo para atributos ``style=`` (``style-src-attr``): lo midió la sonda (docs/seguridad/adr-s3-csp.md).
Cada control tiene su control negativo: con el control apagado, la misma comprobación falla.
"""
import importlib.util
from pathlib import Path

import pytest
from django.core import checks
from django.test import Client, override_settings
from django.utils.csp import build_policy

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security, pytest.mark.django_db]

RAIZ_DEL_BACKEND = Path(__file__).resolve().parents[2]
NONCE = "nonce-de-prueba-0123456789"
SENTINELA = "<CSP_NONCE_SENTINEL>"
CLIENT_ID = "cliente-de-prueba.apps.googleusercontent.com"

# La política en vigor, directiva por directiva, escrita a mano (no derivada del código que se prueba).
_ANTES_DEL_ATRIBUTO = (
    "default-src 'self'; "
    f"script-src 'self' 'nonce-{NONCE}' https://accounts.google.com/gsi/client; "
    f"style-src 'self' 'nonce-{NONCE}' https://accounts.google.com/gsi/style; "
)
_DESPUES_DEL_ATRIBUTO = (
    "img-src 'self' data: blob:; "
    "font-src 'self'; "
    "media-src 'self'; "
    "worker-src 'self'; "
    "connect-src 'self' https://accounts.google.com/gsi/; "
    "frame-src https://accounts.google.com/gsi/; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'; "
    "report-uri /api/security/csp-report"
)
POLITICA_SIN_GOOGLE = _ANTES_DEL_ATRIBUTO + _DESPUES_DEL_ATRIBUTO
POLITICA_CON_GOOGLE = _ANTES_DEL_ATRIBUTO + "style-src-attr 'unsafe-inline'; " + _DESPUES_DEL_ATRIBUTO


def _directivas(politica):
    """La política como ``{directiva: [valores]}``: es lo que se compara directiva por directiva."""
    mapa = {}
    for trozo in politica.split(";"):
        partes = trozo.split()
        if partes:
            assert partes[0] not in mapa, f"directiva repetida: {partes[0]}"
            mapa[partes[0]] = partes[1:]
    return mapa


def _ajustes_base(monkeypatch, enforce=None, report_only=None, google=None, hosts=None):
    """Carga ``psychosim/settings/base.py`` como módulo aparte, con las variables puestas (o quitadas si son ``None``)."""
    variables = (
        ("SIEP_CSP_ENFORCE", enforce), ("SIEP_CSP_REPORT_ONLY", report_only), ("GOOGLE_OAUTH_CLIENT_ID", google),
        ("SIEP_ALLOWED_ASSET_HOSTS", hosts),
    )
    for nombre, valor in variables:
        if valor is None:
            monkeypatch.delenv(nombre, raising=False)
        else:
            monkeypatch.setenv(nombre, valor)
    especificacion = importlib.util.spec_from_file_location("ajustes_base_csp_vigor", Path(__file__).resolve().parents[2] / "psychosim" / "settings" / "base.py")
    modulo = importlib.util.module_from_spec(especificacion)
    especificacion.loader.exec_module(modulo)
    return modulo


@pytest.fixture(params=["sin-google", "con-google"])
def politica_en_vigor(request, monkeypatch):
    """La política en vigor de los dos mundos: sin acceso con Google y con él."""
    google = CLIENT_ID if request.param == "con-google" else None
    return _ajustes_base(monkeypatch, enforce="true", google=google).CSP_ENFORCED_POLICY


# ── La bandera ───────────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("valor", [None, "", "false", "0", "no", "off", "cualquier-cosa"])
def test_apagada_o_con_un_valor_que_no_la_enciende_solo_rige_el_reporte(monkeypatch, valor):
    ajustes = _ajustes_base(monkeypatch, enforce=valor)

    assert ajustes.SIEP_CSP_ENFORCE is False
    assert ajustes.SECURE_CSP == {}
    assert ajustes.SECURE_CSP_REPORT_ONLY == ajustes.CSP_INITIAL_POLICY


@pytest.mark.parametrize("valor", ["true", "1", "yes", "on", "TRUE", " True "])
def test_encendida_rige_la_politica_en_vigor_y_la_de_reporte_se_omite(monkeypatch, valor):
    ajustes = _ajustes_base(monkeypatch, enforce=valor)

    assert ajustes.SIEP_CSP_ENFORCE is True
    assert ajustes.SECURE_CSP == ajustes.CSP_ENFORCED_POLICY
    assert ajustes.SECURE_CSP_REPORT_ONLY == {}


def test_el_interruptor_de_reporte_no_apaga_la_politica_en_vigor(monkeypatch):
    # SIEP_CSP_REPORT_ONLY=false (S2-3a) solo quita la cabecera de reporte; la que se aplica no depende de él.
    ajustes = _ajustes_base(monkeypatch, enforce="true", report_only="false")

    assert ajustes.SECURE_CSP == ajustes.CSP_ENFORCED_POLICY
    assert ajustes.SECURE_CSP_REPORT_ONLY == {}


def test_apagada_y_con_el_reporte_apagado_no_se_envia_ninguna_politica(monkeypatch):
    ajustes = _ajustes_base(monkeypatch, enforce="false", report_only="false")

    assert ajustes.SECURE_CSP == {}
    assert ajustes.SECURE_CSP_REPORT_ONLY == {}


# ── El contenido de la política en vigor ─────────────────────────────────────────────────────────


def test_la_politica_en_vigor_sin_google_es_la_pedida_directiva_por_directiva(monkeypatch):
    politica = _ajustes_base(monkeypatch, enforce="true").CSP_ENFORCED_POLICY

    assert _directivas(build_policy(politica, NONCE)) == _directivas(POLITICA_SIN_GOOGLE)


def test_la_politica_en_vigor_con_google_es_la_misma_mas_el_permiso_de_atributos_de_estilo(monkeypatch):
    politica = _ajustes_base(monkeypatch, enforce="true", google=CLIENT_ID).CSP_ENFORCED_POLICY

    assert _directivas(build_policy(politica, NONCE)) == _directivas(POLITICA_CON_GOOGLE)


def _afirmar_unsafe_solo_en_atributos_de_estilo(politica_con_nonce):
    """En scripts, nunca; los <style> solo con nonce: el único 'unsafe-inline' posible es el de ATRIBUTOS; ni eval ni hashes."""
    politica = _directivas(politica_con_nonce)
    for directiva in ("default-src", "script-src", "script-src-elem", "script-src-attr", "style-src", "style-src-elem"):
        assert "'unsafe-inline'" not in politica.get(directiva, []), f"'unsafe-inline' en {directiva}"
    for directiva, valores in politica.items():
        assert "'unsafe-eval'" not in valores, f"'unsafe-eval' en {directiva}"
        assert "'unsafe-hashes'" not in valores, f"'unsafe-hashes' en {directiva}"
        if "'unsafe-inline'" in valores:
            assert directiva == "style-src-attr", f"'unsafe-inline' fuera de los atributos de estilo: {directiva}"


def test_nunca_hay_unsafe_inline_en_los_scripts_ni_en_los_estilos_de_elemento(politica_en_vigor):
    _afirmar_unsafe_solo_en_atributos_de_estilo(build_policy(politica_en_vigor, NONCE))


def test_los_scripts_y_los_estilos_llevan_el_nonce(politica_en_vigor):
    politica = _directivas(build_policy(politica_en_vigor, NONCE))

    assert f"'nonce-{NONCE}'" in politica["script-src"]
    assert f"'nonce-{NONCE}'" in politica["style-src"]


def test_sin_google_no_hay_ni_un_unsafe_inline_en_toda_la_politica(monkeypatch):
    politica = build_policy(_ajustes_base(monkeypatch, enforce="true").CSP_ENFORCED_POLICY, NONCE)

    assert "unsafe" not in politica


def test_con_google_el_unico_permiso_excepcional_es_style_src_attr(monkeypatch):
    politica = _directivas(build_policy(_ajustes_base(monkeypatch, enforce="true", google=CLIENT_ID).CSP_ENFORCED_POLICY, NONCE))

    assert politica["style-src-attr"] == ["'unsafe-inline'"]
    assert sum("'unsafe-inline'" in valores for valores in politica.values()) == 1


def test_media_y_workers_no_llevan_blob_pero_las_imagenes_si_porque_el_juego_las_usa(politica_en_vigor):
    politica = _directivas(build_policy(politica_en_vigor, NONCE))

    assert politica["media-src"] == ["'self'"]
    assert politica["worker-src"] == ["'self'"]
    # Medido con la sonda (modo report-tight): data: y blob: en img-src los usan Phaser, el kit del personaje y el editor.
    assert politica["img-src"] == ["'self'", "data:", "blob:"]


def test_los_permisos_de_google_son_los_de_su_documentacion_y_nada_mas(politica_en_vigor):
    politica = _directivas(build_policy(politica_en_vigor, NONCE))

    assert "https://accounts.google.com/gsi/client" in politica["script-src"]
    assert "https://accounts.google.com/gsi/style" in politica["style-src"]
    assert politica["frame-src"] == ["https://accounts.google.com/gsi/"]
    assert "https://accounts.google.com/gsi/" in politica["connect-src"]
    hosts_externos = {
        valor
        for directiva, valores in politica.items()
        if directiva not in ("report-uri",)
        for valor in valores
        if valor.startswith("http")
    }
    assert hosts_externos == {
        "https://accounts.google.com/gsi/client",
        "https://accounts.google.com/gsi/style",
        "https://accounts.google.com/gsi/",
    }


def test_una_respuesta_que_no_usa_el_nonce_no_deja_la_sentinela_ni_un_nonce_en_la_cabecera(politica_en_vigor):
    # La API no pide el nonce: Django quita la sentinela de la política (no la deja escrita ni inventa un valor).
    with override_settings(SECURE_CSP=politica_en_vigor, SECURE_CSP_REPORT_ONLY={}):
        respuesta = Client().get("/api/health")

    cabecera = respuesta["Content-Security-Policy"]
    assert SENTINELA not in cabecera
    assert "nonce-" not in cabecera
    assert "'self' https://accounts.google.com/gsi/client" in cabecera


@pytest.mark.parametrize("directiva", ["script-src", "style-src", "default-src"])
def test_control_negativo_un_unsafe_inline_fuera_de_los_atributos_de_estilo_rompe_la_comprobacion(monkeypatch, directiva):
    politica = dict(_ajustes_base(monkeypatch, enforce="true").CSP_ENFORCED_POLICY)
    politica[directiva] = [*politica[directiva], "'unsafe-inline'"]

    with pytest.raises(AssertionError, match="unsafe-inline"):
        _afirmar_unsafe_solo_en_atributos_de_estilo(build_policy(politica, NONCE))


def test_control_negativo_un_unsafe_eval_rompe_la_comprobacion(monkeypatch):
    politica = dict(_ajustes_base(monkeypatch, enforce="true").CSP_ENFORCED_POLICY)
    politica["script-src"] = [*politica["script-src"], "'unsafe-eval'"]

    with pytest.raises(AssertionError, match="unsafe-eval"):
        _afirmar_unsafe_solo_en_atributos_de_estilo(build_policy(politica, NONCE))


# ── Django no avisa de la política con nonce (security.W027) ─────────────────────────────────────


def _avisos_de_seguridad():
    return {mensaje.id for mensaje in checks.run_checks(tags=[checks.Tags.security])}


def test_con_la_politica_en_vigor_django_no_avisa_de_que_falta_el_procesador_del_nonce(politica_en_vigor):
    with override_settings(SECURE_CSP=politica_en_vigor):
        assert "security.W027" not in _avisos_de_seguridad()


def test_control_negativo_sin_el_procesador_de_contexto_django_si_avisa(politica_en_vigor):
    from django.conf import settings

    plantillas = [{**settings.TEMPLATES[0], "OPTIONS": {"context_processors": []}}]

    with override_settings(SECURE_CSP=politica_en_vigor, TEMPLATES=plantillas):
        assert "security.W027" in _avisos_de_seguridad()


# ── El interruptor de la sonda no existe fuera de la sonda ───────────────────────────────────────


def test_solo_los_ajustes_de_la_sonda_leen_las_variables_de_control_de_la_sonda():
    ajenos = []
    for ruta in RAIZ_DEL_BACKEND.rglob("*.py"):
        partes = set(ruta.relative_to(RAIZ_DEL_BACKEND).parts)
        if ".venv" in partes or "tests" in partes or ruta.name == "csp_probe.py":
            continue
        if "SIEP_CSP_PROBE_" in ruta.read_text(encoding="utf-8"):
            ajenos.append(str(ruta.relative_to(RAIZ_DEL_BACKEND)))

    assert ajenos == [], f"estos módulos leen variables de control de la sonda: {ajenos}"


# ── Los hosts de fondo (S2-6b) entran a img-src; la API navegable de DRF queda fuera (S2-4) ──────────────────


@pytest.mark.parametrize("modo", ["enforce", "report"])
def test_los_hosts_permitidos_para_el_fondo_entran_a_img_src_de_las_dos_politicas(monkeypatch, modo):
    ajustes = _ajustes_base(monkeypatch, enforce="true" if modo == "enforce" else None, hosts="cdn.ejemplo.edu.co, Imagenes.Ejemplo.org")
    politica = ajustes.CSP_ENFORCED_POLICY if modo == "enforce" else ajustes.CSP_INITIAL_POLICY

    assert _directivas(build_policy(politica, NONCE))["img-src"] == [
        "'self'", "data:", "blob:", "https://cdn.ejemplo.edu.co", "https://imagenes.ejemplo.org",
    ]


def test_control_negativo_sin_hosts_permitidos_img_src_no_lleva_ningun_host_externo(monkeypatch):
    for politica in (
        _ajustes_base(monkeypatch, enforce="true").CSP_ENFORCED_POLICY,
        _ajustes_base(monkeypatch).CSP_INITIAL_POLICY,
    ):
        assert _directivas(build_policy(politica, NONCE))["img-src"] == ["'self'", "data:", "blob:"]


@pytest.mark.parametrize(
    "valor",
    [
        "https://cdn.ejemplo.org",
        "cdn.ejemplo.org:443",
        "*.ejemplo.org",
        "cdn",
        "cdn.ejemplo.org/ruta",
        "-malo.ejemplo.org",
        "malo-.ejemplo.org",
        "con espacio.ejemplo.org",
        "cdn.ejemplo.org;script-src",
    ],
)
def test_un_host_de_fondo_mal_escrito_impide_arrancar_sin_mostrar_el_valor(monkeypatch, valor):
    from django.core.exceptions import ImproperlyConfigured

    with pytest.raises(ImproperlyConfigured) as error:
        _ajustes_base(monkeypatch, hosts=f"cdn.ejemplo.edu.co,{valor}")

    assert "SIEP_ALLOWED_ASSET_HOSTS" in str(error.value)
    assert valor.strip() not in str(error.value)


def test_la_api_solo_habla_json_ni_a_un_navegador():
    from rest_framework.views import APIView

    navegador = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    respuesta = Client().get("/api/auth/me", HTTP_ACCEPT=navegador)

    assert [clase.__name__ for clase in APIView.renderer_classes] == ["JSONRenderer"]
    assert respuesta.status_code == 401
    assert respuesta["Content-Type"].startswith("application/json")
    assert b"<script" not in respuesta.content and b"<style" not in respuesta.content


def test_control_negativo_la_api_navegable_de_drf_si_devuelve_html_con_script_y_estilo_en_linea():
    # Si el valor por defecto volviera a incluir BrowsableAPIRenderer, un navegador recibiría esto.
    from rest_framework.renderers import BrowsableAPIRenderer
    from rest_framework.response import Response
    from rest_framework.test import APIRequestFactory
    from rest_framework.views import APIView

    class Navegable(APIView):
        renderer_classes = [BrowsableAPIRenderer]
        authentication_classes = []
        permission_classes = []

        def get(self, request):
            return Response({"ok": True})

    peticion = APIRequestFactory().get("/", HTTP_ACCEPT="text/html")
    respuesta = Navegable.as_view()(peticion)
    respuesta.render()

    assert respuesta["Content-Type"].startswith("text/html")
    assert b"<script" in respuesta.content or b"<style" in respuesta.content
