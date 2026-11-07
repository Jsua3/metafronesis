"""La documentación de la API queda cerrada (plan 03, S2-5, RNF-002): ``/schema/`` y ``/swagger-ui.html``.

Hasta S2-5 el esquema OpenAPI y su visor eran públicos: cualquiera leía rutas, parámetros y nombres de campos.
Ahora la bandera ``SIEP_EXPOSE_API_DOCS`` decide, en cada petición (``psychosim.urls._docs_gate``):

- apagada (por defecto, también en producción): 404 a cualquiera, antes de mirar credenciales;
- encendida: sin sesión, 401; estudiante o profesor, 403; ADMIN, 200.
"""
import json
import runpy
import secrets
from importlib import reload

import pytest
from django.contrib.auth import get_user_model
from django.test import RequestFactory, override_settings
from rest_framework.test import APIClient

from apps.users.serializers import generate_access_token
from psychosim.settings import base as base_settings
from shared import surface
from shared.tests.test_production_settings import _production

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security]

RUTAS = ("/schema/", "/swagger-ui.html")
# Las mismas rutas como las nombra el inventario de superficie (sin barra final).
RUTAS_DEL_INVENTARIO = ("schema", "swagger-ui.html")


def _usuario(rol):
    """Una cuenta nueva por llamada; la contraseña se genera en cada ejecución (nunca un literal)."""
    return get_user_model().objects.create_user(
        email=f"docs-{rol.lower()}-{secrets.token_hex(6)}@example.com",
        password=secrets.token_urlsafe(24),
        nombre="Doc",
        apellido=rol.title(),
        role=rol,
    )


def _como(usuario):
    """Cliente con el token de acceso que emite el servidor para la cuenta (autenticación real, sin ``force_authenticate``)."""
    cliente = APIClient()
    cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {generate_access_token(usuario)}")
    return cliente


@pytest.mark.django_db
@pytest.mark.parametrize("ruta", RUTAS)
def test_apagada_la_documentacion_responde_404_a_todos(ruta):
    # 404 antes de mirar credenciales: ni el ADMIN ni el anónimo ven que la ruta existe.
    with override_settings(SIEP_EXPOSE_API_DOCS=False):
        respuestas = [
            APIClient().get(ruta),
            _como(_usuario("ESTUDIANTE")).get(ruta),
            _como(_usuario("ADMIN")).get(ruta),
        ]
    for respuesta in respuestas:
        assert respuesta.status_code == 404
        assert b"openapi" not in respuesta.content.lower()
        assert b"swagger" not in respuesta.content.lower()


@pytest.mark.django_db
@pytest.mark.parametrize("ruta", RUTAS)
def test_encendida_sin_sesion_responde_401(ruta):
    with override_settings(SIEP_EXPOSE_API_DOCS=True):
        respuesta = APIClient().get(ruta)
    assert respuesta.status_code == 401


@pytest.mark.django_db
@pytest.mark.parametrize("rol", ["ESTUDIANTE", "PROFESOR"])
@pytest.mark.parametrize("ruta", RUTAS)
def test_encendida_estudiante_y_profesor_reciben_403(rol, ruta):
    with override_settings(SIEP_EXPOSE_API_DOCS=True):
        respuesta = _como(_usuario(rol)).get(ruta)
    assert respuesta.status_code == 403


@pytest.mark.django_db
def test_encendida_el_admin_recibe_el_esquema_openapi():
    with override_settings(SIEP_EXPOSE_API_DOCS=True):
        respuesta = _como(_usuario("ADMIN")).get("/schema/", HTTP_ACCEPT="application/json")
    assert respuesta.status_code == 200
    assert str(json.loads(respuesta.content)["openapi"]).startswith("3.")


@pytest.mark.django_db
def test_encendida_el_admin_abre_el_visor():
    with override_settings(SIEP_EXPOSE_API_DOCS=True):
        respuesta = _como(_usuario("ADMIN")).get("/swagger-ui.html")
    assert respuesta.status_code == 200
    assert respuesta["Content-Type"].startswith("text/html")


@pytest.mark.parametrize(
    ("valor", "encendida"),
    [(None, False), ("", False), ("false", False), ("0", False), ("true", True), ("1", True), ("yes", True)],
)
def test_la_bandera_se_lee_como_las_demas_y_viene_apagada(monkeypatch, valor, encendida):
    if valor is None:
        monkeypatch.delenv("SIEP_EXPOSE_API_DOCS", raising=False)
    else:
        monkeypatch.setenv("SIEP_EXPOSE_API_DOCS", valor)
    # ``run_path`` ejecuta el archivo en un espacio nuevo: no reemplaza ``base`` ya cargado en ``sys.modules``.
    ajustes = runpy.run_path(base_settings.__file__, run_name="base_bajo_prueba")
    assert ajustes.get("SIEP_EXPOSE_API_DOCS") is encendida


def test_en_produccion_la_documentacion_viene_apagada(monkeypatch):
    # ``production`` hereda ``base`` al importarse: se quita la variable, se recarga ``base`` y al final se deshace todo.
    monkeypatch.delenv("SIEP_EXPOSE_API_DOCS", raising=False)
    try:
        ajustes = _production(monkeypatch)
    finally:
        monkeypatch.undo()
        reload(base_settings)
    assert ajustes.get("SIEP_EXPOSE_API_DOCS") is False


def test_el_esquema_y_su_visor_dejan_de_ser_publicos_en_el_inventario():
    filas = {fila["route"]: fila for fila in surface.collect_routes() if fila["route"] in RUTAS_DEL_INVENTARIO}
    assert set(filas) == set(RUTAS_DEL_INVENTARIO)
    assert {fila["exposure"] for fila in filas.values()} == {"role:ADMIN"}
    assert not set(RUTAS_DEL_INVENTARIO) & set(surface.PUBLIC_ROUTE_REASONS)


def test_control_negativo_sin_compuerta_el_esquema_responde_200_al_anonimo():
    # Sin la compuerta, la vista tal cual sirve el esquema a cualquiera: es lo que la prueba de 404 vetaría.
    from drf_spectacular.views import SpectacularAPIView

    peticion = RequestFactory().get("/schema/", HTTP_ACCEPT="application/json")
    assert SpectacularAPIView.as_view()(peticion).status_code == 200


def test_control_negativo_sin_permiso_de_admin_el_anonimo_entra_al_esquema():
    # La compuerta real sin ``permission_classes``: el anónimo recibe 200, y la prueba de 401 lo detectaría.
    from drf_spectacular.views import SpectacularAPIView
    from psychosim.urls import _docs_gate

    sin_permiso = _docs_gate(SpectacularAPIView.as_view())
    peticion = RequestFactory().get("/schema/", HTTP_ACCEPT="application/json")
    with override_settings(SIEP_EXPOSE_API_DOCS=True):
        respuesta = sin_permiso(peticion)
    assert respuesta.status_code == 200
