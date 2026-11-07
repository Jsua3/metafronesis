"""Ajustes de la sonda de CSP (plan 03, S2-3b y S2-4): ``psychosim.settings.csp_probe``.

La sonda corre el build de producción servido por Django con estos ajustes. Aquí se comprueba que son los de producción
donde importa (la cadena de ``MIDDLEWARE``, la política) y que los controles negativos empeoran la política como dicen.
Cada caso se evalúa en un proceso aparte con su propio entorno: los ajustes se leen al importarse y ``base`` y ``test``
ya están cargados en el proceso de pytest.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security]

RAIZ_DEL_BACKEND = Path(__file__).resolve().parents[2]
NONCE = "nonce-de-prueba"
ATESTACION = "shared.test_attestation.TestEnvironmentAttestationMiddleware"
ESTATICOS_DEL_SPA = "shared.static_files.SpaStaticFilesMiddleware"

_PROGRAMA = """
import json
from django.core.exceptions import ImproperlyConfigured
from django.utils.csp import build_policy
try:
    import psychosim.settings.csp_probe as s
except ImproperlyConfigured as error:
    print(json.dumps({"error": str(error)}))
else:
    print(json.dumps({
        "enforce": s.SIEP_CSP_ENFORCE,
        "csp": build_policy(s.SECURE_CSP, "%(nonce)s"),
        "report_only": build_policy(s.SECURE_CSP_REPORT_ONLY, "%(nonce)s"),
        "middleware": s.MIDDLEWARE,
        "dist": str(s.SPA_DIST_DIR),
        "whitenoise_root": s.WHITENOISE_ROOT,
        "whitenoise_index": s.WHITENOISE_INDEX_FILE,
        "throttle": s.SIEP_THROTTLE_ENABLED,
        "settings_module": s.__name__,
    }))
""" % {"nonce": NONCE}


def _directivas(politica):
    return {partes[0]: partes[1:] for partes in (trozo.split() for trozo in politica.split(";")) if partes}


@pytest.fixture
def dist(tmp_path):
    carpeta = tmp_path / "browser"
    carpeta.mkdir()
    (carpeta / "index.html").write_text("<!doctype html>", encoding="utf-8")
    return carpeta


def _ajustes(dist_dir, **entorno):
    """Importa ``csp_probe`` en un proceso nuevo con ese entorno y devuelve lo que dejó (o ``{"error": …}``)."""
    base = {k: v for k, v in os.environ.items() if not k.startswith(("SIEP_CSP_", "DATABASE_URL", "GOOGLE_"))}
    if dist_dir is not None:
        base["SIEP_CSP_PROBE_DIST"] = str(dist_dir)
    base.update(entorno)
    resultado = subprocess.run(
        [sys.executable, "-c", _PROGRAMA], cwd=RAIZ_DEL_BACKEND, env=base, capture_output=True, text=True, timeout=120,
    )
    assert resultado.returncode == 0, resultado.stderr[-2000:]
    return json.loads(resultado.stdout.strip().splitlines()[-1])


def _base():
    """Los ajustes de producción de los que hereda la sonda (``base``): de ahí sale la cadena de ``MIDDLEWARE``."""
    from psychosim.settings import base

    return base


def test_sirve_el_build_con_la_cadena_de_produccion_y_la_atestacion_al_final(dist):
    ajustes = _ajustes(dist)

    assert ajustes["dist"] == str(dist.resolve())
    assert ajustes["whitenoise_root"] == str(dist.resolve())
    assert ajustes["whitenoise_index"] is False
    assert ajustes["throttle"] is False  # la sonda no debe toparse con el limitador
    # La cadena de producción tal cual (WhiteNoise incluido, en su sitio) + la atestación del entorno de pruebas.
    assert ajustes["middleware"] == [*_base().MIDDLEWARE, ATESTACION]
    assert ESTATICOS_DEL_SPA in ajustes["middleware"]


def test_con_la_bandera_apagada_la_sonda_mide_la_politica_de_reporte_de_produccion(dist):
    ajustes = _ajustes(dist)

    assert ajustes["enforce"] is False
    assert ajustes["csp"] == ""
    assert _directivas(ajustes["report_only"])["style-src"][1] == "'unsafe-inline'"
    assert "nonce-" not in ajustes["report_only"]


def test_la_politica_de_reporte_estricta_es_la_politica_en_vigor_en_modo_reporte(dist):
    ajustes = _ajustes(dist, SIEP_CSP_PROBE_REPORT_POLICY="strict")

    assert ajustes["csp"] == ""
    assert f"'nonce-{NONCE}'" in _directivas(ajustes["report_only"])["style-src"]
    assert "'unsafe-inline'" not in ajustes["report_only"]


def test_la_politica_de_reporte_ajustada_es_la_en_vigor_sin_data_ni_blob_para_medir_su_uso(dist):
    ajustes = _ajustes(dist, SIEP_CSP_PROBE_REPORT_POLICY="tight")

    politica = _directivas(ajustes["report_only"])
    assert ajustes["csp"] == ""
    for directiva in ("img-src", "media-src", "worker-src"):
        assert politica[directiva] == ["'self'"], directiva
    assert "data:" not in ajustes["report_only"] and "blob:" not in ajustes["report_only"]
    assert f"'nonce-{NONCE}'" in politica["style-src"]  # solo se quitan los esquemas data: y blob:
    assert politica["connect-src"] == ["'self'", "https://accounts.google.com/gsi/"]


def test_con_google_configurado_la_politica_en_vigor_gana_el_permiso_de_atributos_de_estilo_y_sin_el_no(dist):
    sin = _ajustes(dist, SIEP_CSP_ENFORCE="true")
    con = _ajustes(dist, SIEP_CSP_ENFORCE="true", GOOGLE_OAUTH_CLIENT_ID="cliente-falso.apps.googleusercontent.com")

    assert "style-src-attr" not in sin["csp"]
    assert _directivas(con["csp"])["style-src-attr"] == ["'unsafe-inline'"]


def test_con_la_bandera_encendida_la_sonda_mide_la_politica_en_vigor_sin_cabecera_de_reporte(dist):
    ajustes = _ajustes(dist, SIEP_CSP_ENFORCE="true")

    assert ajustes["enforce"] is True
    assert f"'nonce-{NONCE}'" in _directivas(ajustes["csp"])["script-src"]
    assert f"'nonce-{NONCE}'" in _directivas(ajustes["csp"])["style-src"]
    assert ajustes["report_only"] == ""


@pytest.mark.parametrize(
    ("entorno", "mensaje"),
    [
        ({}, "SIEP_CSP_PROBE_DIST"),
        ({"SIEP_CSP_PROBE_REPORT_POLICY": "otra"}, "SIEP_CSP_PROBE_REPORT_POLICY"),
        ({"SIEP_CSP_PROBE_CONTROL": "inventado"}, "SIEP_CSP_PROBE_CONTROL"),
    ],
)
def test_un_entorno_invalido_impide_arrancar_y_nombra_la_variable(dist, entorno, mensaje):
    ajustes = _ajustes(None if mensaje == "SIEP_CSP_PROBE_DIST" else dist, **entorno)

    assert mensaje in ajustes["error"]


def test_una_carpeta_sin_index_html_impide_arrancar(tmp_path):
    vacia = tmp_path / "vacia"
    vacia.mkdir()

    assert "index.html" in _ajustes(vacia)["error"]


# ── Controles negativos de la sonda: empeoran la política a propósito ────────────────────────────


def test_control_sin_nonce_quita_el_nonce_de_toda_la_politica(dist):
    ajustes = _ajustes(dist, SIEP_CSP_ENFORCE="true", SIEP_CSP_PROBE_CONTROL="sin-nonce")

    politica = _directivas(ajustes["csp"])
    assert "nonce-" not in ajustes["csp"]
    assert politica["style-src"] == ["'self'", "https://accounts.google.com/gsi/style"]
    assert "'unsafe-inline'" not in ajustes["csp"]  # sin nonce y sin unsafe-inline: Angular no puede inyectar sus estilos


def test_control_sin_politica_no_envia_ninguna_cabecera_de_csp(dist):
    ajustes = _ajustes(dist, SIEP_CSP_ENFORCE="true", SIEP_CSP_PROBE_CONTROL="sin-politica")

    assert ajustes["csp"] == "" and ajustes["report_only"] == ""


def test_control_script_inline_permite_scripts_en_linea_y_quita_el_nonce_que_los_anularia(dist):
    ajustes = _ajustes(dist, SIEP_CSP_ENFORCE="true", SIEP_CSP_PROBE_CONTROL="script-inline")

    scripts = _directivas(ajustes["csp"])["script-src"]
    assert "'unsafe-inline'" in scripts
    assert f"'nonce-{NONCE}'" not in scripts  # con un nonce en la lista el navegador ignora 'unsafe-inline'
    assert f"'nonce-{NONCE}'" in _directivas(ajustes["csp"])["style-src"]  # solo se empeoran los scripts


def test_control_negativo_los_controles_no_se_aplican_sin_la_variable(dist):
    ajustes = _ajustes(dist, SIEP_CSP_ENFORCE="true")

    assert "'unsafe-inline'" not in ajustes["csp"]
    assert "nonce-" in ajustes["csp"]
