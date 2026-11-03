"""Ajustes de la SONDA de CSP (plan 03, S2-3b y S2-4): el build de producción servido por Django, como en el despliegue.

``scripts/test-csp-probe.mjs`` (``npm run test:csp``) levanta con estos ajustes un Django de pruebas, sobre una BD
desechable, que sirve el build de PRODUCCIÓN de Angular (no ``ng serve``: el servidor de desarrollo no manda ninguna
cabecera de CSP) y le pasa Playwright (``frontend/e2e/csp-probe.e2e.ts``). El camino del HTML es el del despliegue:
cabeceras y CSP de Django, WhiteNoise para los estáticos y la vista ``spa_index`` para el HTML, con el nonce.

Hereda de ``test`` (BD desechable con guardas, atestación, limitador apagado) y vuelve a poner lo que ``test`` quita:
WhiteNoise sobre el build, en el mismo sitio de la cadena de producción (``base.MIDDLEWARE``) y con la atestación al final.

Variables que exporta el orquestador (las tres con prefijo ``SIEP_CSP_PROBE_`` solo las lee este módulo: ``base`` y
``production`` no las conocen, y una prueba lo vigila):

    SIEP_CSP_PROBE_DIST           carpeta ``browser/`` del build de producción (obligatoria; debe traer ``index.html``).
    SIEP_CSP_ENFORCE              (la lee ``base``) política en vigor o solo la de reporte.
    SIEP_CSP_PROBE_REPORT_POLICY  qué política lleva ``Content-Security-Policy-Report-Only`` cuando la bandera está apagada:
                                  ``initial`` (por defecto, la de producción hoy), ``strict`` (la política en vigor, en modo
                                  reporte: mide qué rompería ANTES de encenderla) o ``tight`` (la política en vigor SIN
                                  ``data:`` ni ``blob:``: mide cuáles de esos permisos usa la aplicación de verdad).
    SIEP_CSP_PROBE_CONTROL        control negativo de la sonda: ``sin-nonce`` | ``sin-politica`` | ``script-inline``. Cada
                                  uno deja la política peor a propósito y la sonda DEBE ponerse en rojo (ver CONTROLES).
"""
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from django.utils.csp import CSP

from .base import CSP_ENFORCED_POLICY, CSP_INITIAL_POLICY
from .base import MIDDLEWARE as _CADENA_DE_PRODUCCION
from .test import *  # noqa: F401,F403

#: Controles negativos: cómo se empeora la política para comprobar que la sonda lo ve. Ninguno existe fuera de este módulo.
CONTROLES = ("sin-nonce", "sin-politica", "script-inline")

_dist = os.environ.get("SIEP_CSP_PROBE_DIST", "").strip()
if not _dist:
    raise ImproperlyConfigured(
        "Falta SIEP_CSP_PROBE_DIST (la carpeta browser/ del build de producción). Usa `npm run test:csp`."
    )
SPA_DIST_DIR = Path(_dist).resolve()
if not (SPA_DIST_DIR / "index.html").is_file():
    raise ImproperlyConfigured("SIEP_CSP_PROBE_DIST no contiene index.html: construye el frontend de producción.")
WHITENOISE_ROOT = str(SPA_DIST_DIR)
WHITENOISE_INDEX_FILE = False

# La cadena de producción tal cual (WhiteNoise incluido, en su sitio) y, al final, la atestación del entorno de pruebas.
MIDDLEWARE = [*_CADENA_DE_PRODUCCION, "shared.test_attestation.TestEnvironmentAttestationMiddleware"]


def _sin_data_ni_blob(politica):
    """La política sin los esquemas ``data:`` y ``blob:`` en ninguna directiva: lo que falle es lo que la aplicación usa."""
    return {
        directiva: [valor for valor in valores if valor not in ("data:", "blob:")]
        for directiva, valores in politica.items()
    }


_POLITICAS_DE_REPORTE = {
    "initial": CSP_INITIAL_POLICY,
    "strict": CSP_ENFORCED_POLICY,
    "tight": _sin_data_ni_blob(CSP_ENFORCED_POLICY),
}
_REPORT_POLICY = os.environ.get("SIEP_CSP_PROBE_REPORT_POLICY", "initial").strip().lower()
if _REPORT_POLICY not in _POLITICAS_DE_REPORTE:
    raise ImproperlyConfigured("SIEP_CSP_PROBE_REPORT_POLICY debe ser «initial», «strict» o «tight».")
if not SIEP_CSP_ENFORCE:  # noqa: F405
    SECURE_CSP = {}
    SECURE_CSP_REPORT_ONLY = _POLITICAS_DE_REPORTE[_REPORT_POLICY]


def _sin_nonce(politica):
    return {directiva: [valor for valor in valores if valor != CSP.NONCE] for directiva, valores in politica.items()}


def _con_unsafe_inline_en_scripts(politica):
    # Con un nonce en la lista el navegador IGNORA 'unsafe-inline': para que el permiso rija, el nonce de scripts sale.
    return {
        directiva: (
            [*(valor for valor in valores if valor != CSP.NONCE), CSP.UNSAFE_INLINE]
            if directiva == "script-src"
            else valores
        )
        for directiva, valores in politica.items()
    }


_CONTROL = os.environ.get("SIEP_CSP_PROBE_CONTROL", "").strip().lower()
if _CONTROL and _CONTROL not in CONTROLES:
    raise ImproperlyConfigured(f"SIEP_CSP_PROBE_CONTROL debe ser uno de: {', '.join(CONTROLES)}.")
if _CONTROL == "sin-nonce":
    SECURE_CSP = _sin_nonce(SECURE_CSP)  # noqa: F405
    SECURE_CSP_REPORT_ONLY = _sin_nonce(SECURE_CSP_REPORT_ONLY)  # noqa: F405
elif _CONTROL == "sin-politica":
    SECURE_CSP = {}
    SECURE_CSP_REPORT_ONLY = {}
elif _CONTROL == "script-inline":
    SECURE_CSP = _con_unsafe_inline_en_scripts(SECURE_CSP)  # noqa: F405
    SECURE_CSP_REPORT_ONLY = _con_unsafe_inline_en_scripts(SECURE_CSP_REPORT_ONLY)  # noqa: F405
