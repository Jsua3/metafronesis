"""Cabeceras de seguridad base (plan 03, S2-1): la API, el SPA y los estáticos llevan lo que deben llevar.

Django pone ``X-Content-Type-Options``, ``Referrer-Policy``, ``Cross-Origin-Opener-Policy`` y ``X-Frame-Options``;
``shared.security_headers`` pone ``Permissions-Policy``, ``Cache-Control: no-store`` en la API y ``X-Robots-Tag``.

Las pruebas de cabeceras montan la cadena de PRODUCCIÓN (``psychosim.settings.base``), no la de pruebas, porque
``settings/test.py`` difiere en dos cosas que aquí importan:

- quita WhiteNoise: la prueba de estáticos lo vuelve a poner, en su sitio (debajo de las cabeceras);
- ``shared.test_attestation`` pone ``Cache-Control: no-store`` en TODA respuesta: con ella, ningún ``no-store``
  probaría nada. Por eso la cadena que se monta aquí no la lleva.

Cada control tiene su control negativo: con el control apagado, la misma comprobación falla.
"""
import re
import secrets

import pytest
from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.test import Client, RequestFactory, override_settings
from rest_framework.test import APIClient

from psychosim.settings import base as ajustes_base

pytestmark = [
    pytest.mark.req("RNF-02"),
    pytest.mark.security,
    pytest.mark.django_db,
    # WhiteNoise avisa de que STATIC_ROOT no existe en las pruebas; el aviso no es un fallo del control.
    pytest.mark.filterwarnings("ignore:No directory at:UserWarning"),
]

User = get_user_model()

SECURITY = "django.middleware.security.SecurityMiddleware"
XFO = "django.middleware.clickjacking.XFrameOptionsMiddleware"
SH = "shared.security_headers.SecurityHeadersMiddleware"
# S2-4: WhiteNoise va en su subclase del SPA (no sirve index.html); sigue ocupando el mismo sitio de la cadena.
WHITENOISE = "shared.static_files.SpaStaticFilesMiddleware"

# Lo que toda respuesta lleva, sea cual sea la ruta.
CABECERAS_BASE = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
}
NO_INDEXAR = "noindex, nofollow"


def _cadena(*, quitar=()):
    """La cadena de producción, sin los middleware que ``quitar`` nombra."""
    return [middleware for middleware in ajustes_base.MIDDLEWARE if middleware not in quitar]


def _afirmar_base(respuesta):
    for nombre, valor in CABECERAS_BASE.items():
        assert respuesta.get(nombre) == valor, f"{nombre}: {respuesta.get(nombre)!r}"


def _afirmar_no_store(respuesta):
    assert "no-store" in respuesta.get("Cache-Control", ""), (
        f"Cache-Control sin no-store: {respuesta.get('Cache-Control')!r}"
    )


def _afirmar_no_indexable(respuesta):
    assert respuesta.get("X-Robots-Tag") == NO_INDEXAR, f"X-Robots-Tag: {respuesta.get('X-Robots-Tag')!r}"


def _spa(tmp_path, ruta, cadena=None, ajustes=None):
    """GET ``ruta`` contra el SPA de prueba (un ``index.html`` de una línea) con la cadena dada."""
    (tmp_path / "index.html").write_text("<!doctype html><title>SPA</title>", encoding="utf-8")
    with override_settings(
        MIDDLEWARE=cadena if cadena is not None else _cadena(),
        SPA_DIST_DIR=tmp_path,
        **(ajustes or {}),
    ):
        return Client().get(ruta)


def _login(cadena=None):
    """POST /api/auth/login con una cuenta que no existe y una contraseña al azar: 401."""
    correo = f"nadie-{secrets.token_hex(6)}@example.com"
    with override_settings(MIDDLEWARE=cadena if cadena is not None else _cadena()):
        return APIClient().post(
            "/api/auth/login",
            {"email": correo, "password": secrets.token_urlsafe(24)},
            format="json",
        )


def _me(cadena=None):
    """GET /api/auth/me con una sesión forzada (``force_authenticate``): 200."""
    usuario = User.objects.create_user(
        email=f"est-{secrets.token_hex(6)}@example.com",
        password=secrets.token_urlsafe(24),
        nombre="E",
        apellido="S",
        role="ESTUDIANTE",
    )
    with override_settings(MIDDLEWARE=cadena if cadena is not None else _cadena()):
        cliente = APIClient()
        cliente.force_authenticate(user=usuario)
        return cliente.get("/api/auth/me")


def _estatico(tmp_path, cadena=None, ruta="/app.js"):
    """GET de un archivo que sirve WhiteNoise desde ``WHITENOISE_ROOT`` (``app.js`` junto a ``index.html``)."""
    raiz = tmp_path / "estaticos"
    raiz.mkdir()
    (raiz / "index.html").write_text("<!doctype html><title>estaticos</title>", encoding="utf-8")
    (raiz / "app.js").write_text("console.log('ok');", encoding="utf-8")
    # Cliente NUEVO dentro del override: WhiteNoise lee sus ajustes al cargarse, en el primer request.
    with override_settings(
        MIDDLEWARE=cadena if cadena is not None else _cadena(),
        WHITENOISE_ROOT=str(raiz),
        WHITENOISE_INDEX_FILE=True,
    ):
        return Client().get(ruta)


def _pasar_por_el_middleware(ruta, cabeceras_de_la_vista=None):
    """Pasa ``ruta`` por ``SecurityHeadersMiddleware`` con una vista de mentira (sin servidor)."""
    from shared.security_headers import SecurityHeadersMiddleware

    def vista(request):
        respuesta = HttpResponse("ok")
        for nombre, valor in (cabeceras_de_la_vista or {}).items():
            respuesta[nombre] = valor
        return respuesta

    return SecurityHeadersMiddleware(vista)(RequestFactory().get(ruta))


# ── Orden de la cadena de producción ─────────────────────────────────────────────────────────────


def test_las_cabeceras_van_encima_de_whitenoise_en_la_cadena_de_produccion():
    cadena = ajustes_base.MIDDLEWARE
    assert cadena.index(SECURITY) < cadena.index(XFO) < cadena.index(SH) < cadena.index(WHITENOISE)


# ── Rutas públicas, autenticadas, SPA y estáticos ────────────────────────────────────────────────


def test_api_publica_login_con_credenciales_malas_lleva_cabeceras_y_no_store():
    respuesta = _login()
    assert respuesta.status_code == 401
    _afirmar_base(respuesta)
    _afirmar_no_store(respuesta)
    _afirmar_no_indexable(respuesta)


def test_api_publica_login_correcto_devuelve_el_token_con_no_store():
    # Con la cuenta activa, el login responde 200 con el token: ese dato no se guarda en ninguna caché.
    clave = secrets.token_urlsafe(24)
    correo = f"est-{secrets.token_hex(6)}@example.com"
    User.objects.create_user(email=correo, password=clave, nombre="E", apellido="S", role="ESTUDIANTE")
    with override_settings(MIDDLEWARE=_cadena()):
        respuesta = APIClient().post("/api/auth/login", {"email": correo, "password": clave}, format="json")
    assert respuesta.status_code == 200
    assert respuesta.json()["data"]["token"]
    _afirmar_base(respuesta)
    _afirmar_no_store(respuesta)
    _afirmar_no_indexable(respuesta)


def test_api_publica_health_lleva_cabeceras_y_conserva_el_cache_control_de_su_vista():
    # shared/health.py fija @never_cache: ese Cache-Control es suyo y el middleware no lo toca.
    with override_settings(MIDDLEWARE=_cadena()):
        respuesta = Client().get("/api/health")
    assert respuesta.status_code == 200
    _afirmar_base(respuesta)
    _afirmar_no_indexable(respuesta)
    directivas = {directiva.strip() for directiva in respuesta["Cache-Control"].split(",")}
    assert directivas == {"max-age=0", "no-cache", "no-store", "must-revalidate", "private"}


def test_api_autenticada_me_lleva_cabeceras_y_no_store():
    respuesta = _me()
    assert respuesta.status_code == 200
    _afirmar_base(respuesta)
    _afirmar_no_store(respuesta)
    _afirmar_no_indexable(respuesta)


def test_spa_portal_lleva_cabeceras_base_y_no_indexar(tmp_path):
    respuesta = _spa(tmp_path, "/portal/anything")
    assert respuesta.status_code == 200
    _afirmar_base(respuesta)
    _afirmar_no_indexable(respuesta)


def test_portada_lleva_cabeceras_base_y_no_lleva_x_robots_tag(tmp_path):
    respuesta = _spa(tmp_path, "/")
    assert respuesta.status_code == 200
    _afirmar_base(respuesta)
    assert "X-Robots-Tag" not in respuesta


def test_estatico_de_whitenoise_lleva_las_cabeceras_base(tmp_path):
    respuesta = _estatico(tmp_path)
    assert respuesta.status_code == 200
    _afirmar_base(respuesta)


# ── Reglas del middleware, sin servidor ──────────────────────────────────────────────────────────


def test_la_vista_que_fija_su_cache_control_lo_conserva():
    respuesta = _pasar_por_el_middleware("/api/grupos", {"Cache-Control": "max-age=60, public"})
    assert respuesta["Cache-Control"] == "max-age=60, public"


def test_la_api_sin_cache_control_recibe_no_store():
    respuesta = _pasar_por_el_middleware("/api/grupos")
    assert respuesta["Cache-Control"] == "no-store"


def test_api_health_queda_fuera_del_no_store_general():
    respuesta = _pasar_por_el_middleware("/api/health")
    assert "Cache-Control" not in respuesta


@pytest.mark.parametrize(
    ("ruta", "lleva"),
    [
        ("/api", True),
        ("/api/grupos", True),
        ("/portal", True),
        ("/portal/personaje", True),
        ("/", False),
        ("/apis", False),
        ("/apis/grupos", False),
        ("/portalx", False),
        ("/portalx/personaje", False),
    ],
)
def test_x_robots_tag_solo_en_api_y_portal_por_segmentos(ruta, lleva):
    respuesta = _pasar_por_el_middleware(ruta)
    if lleva:
        assert respuesta["X-Robots-Tag"] == NO_INDEXAR
    else:
        assert "X-Robots-Tag" not in respuesta


# ── Controles negativos: con el control apagado, la comprobación falla ───────────────────────────


def test_control_negativo_sin_xframeoptionsmiddleware_falla_x_frame_options(tmp_path):
    respuesta = _spa(tmp_path, "/portal/anything", _cadena(quitar=(XFO,)))
    with pytest.raises(AssertionError, match="X-Frame-Options"):
        _afirmar_base(respuesta)


def test_control_negativo_sin_security_headers_falla_permissions_policy(tmp_path):
    respuesta = _spa(tmp_path, "/portal/anything", _cadena(quitar=(SH,)))
    with pytest.raises(AssertionError, match="Permissions-Policy"):
        _afirmar_base(respuesta)


def test_control_negativo_sin_security_headers_falla_no_store():
    respuesta = _login(_cadena(quitar=(SH,)))
    with pytest.raises(AssertionError, match="no-store"):
        _afirmar_no_store(respuesta)


def test_control_negativo_sin_security_headers_falla_x_robots_tag(tmp_path):
    respuesta = _spa(tmp_path, "/portal/anything", _cadena(quitar=(SH,)))
    with pytest.raises(AssertionError, match="X-Robots-Tag"):
        _afirmar_no_indexable(respuesta)


def test_control_negativo_si_las_cabeceras_van_debajo_de_whitenoise_el_estatico_no_las_lleva(tmp_path):
    cadena = _cadena(quitar=(SH,))
    cadena.insert(cadena.index(WHITENOISE) + 1, SH)
    respuesta = _estatico(tmp_path, cadena)
    with pytest.raises(AssertionError, match="Permissions-Policy"):
        _afirmar_base(respuesta)


@pytest.mark.parametrize(
    ("ajuste", "valor", "cabecera"),
    [
        ("SECURE_CONTENT_TYPE_NOSNIFF", False, "X-Content-Type-Options"),
        ("X_FRAME_OPTIONS", "SAMEORIGIN", "X-Frame-Options"),
        ("SECURE_REFERRER_POLICY", None, "Referrer-Policy"),
        # El valor por defecto de Django: si vuelve, la ventana emergente de Google deja de abrirse.
        ("SECURE_CROSS_ORIGIN_OPENER_POLICY", "same-origin", "Cross-Origin-Opener-Policy"),
    ],
)
def test_control_negativo_cada_ajuste_de_cabecera_base_falla_su_cabecera(tmp_path, ajuste, valor, cabecera):
    respuesta = _spa(tmp_path, "/portal/anything", ajustes={ajuste: valor})
    with pytest.raises(AssertionError, match=re.escape(cabecera)):
        _afirmar_base(respuesta)
