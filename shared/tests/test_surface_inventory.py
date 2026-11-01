"""Inventario de superficie (plan 03, S0-2): el JSON versionado es el recorrido real y sus controles fallan.

Si aparece una ruta nueva, cambia una exposición o una vista sin permisos queda pública, estas
pruebas fallan hasta que alguien clasifique la ruta y regenere el inventario.
"""
import json
import re
from pathlib import Path
from types import SimpleNamespace

import pytest
from django.urls import path
from rest_framework.views import APIView

from apps.security.limits import LIMITS
from shared import surface
from shared.tests import test_public_routes as rutas_publicas

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security]

RUTA_INVENTARIO = Path(surface.__file__).with_name("surface-inventory.json")
ORDEN_REGENERAR = "regénéralo con `python -m shared.surface --write` (desde backend_django/)"


def _inventario_versionado():
    return json.loads(RUTA_INVENTARIO.read_text(encoding="utf-8"))


def _afirmar_inventario_al_dia():
    assert _inventario_versionado() == surface.render_inventory(), (
        f"shared/surface-inventory.json no coincide con las rutas del urlconf: {ORDEN_REGENERAR}"
    )


def test_el_json_versionado_coincide_con_el_recorrido_del_urlconf():
    _afirmar_inventario_al_dia()


def test_toda_ruta_publica_tiene_motivo_y_todo_motivo_es_una_ruta_publica():
    publicas = {
        fila["route"] for fila in _inventario_versionado()["routes"] if fila["exposure"] == surface.PUBLIC
    }
    assert publicas == set(surface.PUBLIC_ROUTE_REASONS)
    assert all(motivo.strip() for motivo in surface.PUBLIC_ROUTE_REASONS.values())


def test_ninguna_ruta_tiene_exposicion_vacia_ni_desconocida():
    for fila in _inventario_versionado()["routes"]:
        assert re.fullmatch(r"public|authenticated|role:[A-Z]+(,[A-Z]+)*", fila["exposure"]), fila


def test_las_rutas_admin_exigen_rol_admin_mas_estricto_que_autenticado():
    for fila in _inventario_versionado()["routes"]:
        if fila["route"].startswith("api/admin/"):
            assert fila["exposure"].startswith("role:") and "ADMIN" in fila["exposure"], fila


def test_el_throttle_de_cada_ruta_son_alcances_conocidos_y_audit_es_un_texto_o_va_vacio():
    """S4-1 llena ``audit`` (la compuerta de cobertura vive en ``test_audit_coverage.py``): un texto con la auditoría de
    la ruta, o ``None`` si la ruta ni muta ni lee datos de otra persona. Nunca una cadena vacía."""
    for fila in _inventario_versionado()["routes"]:
        assert fila["audit"] is None or (isinstance(fila["audit"], str) and fila["audit"].strip()), fila
        assert fila["throttle"] is None or set(fila["throttle"]) <= set(LIMITS), fila


def test_toda_ruta_publica_que_escribe_tiene_limite():
    """El inventario es la guardia: una ruta pública nueva que recibe cuerpo sin ``throttle_classes`` no pasa (S1-2)."""
    sin_limite = [
        (fila["method"], fila["route"])
        for fila in _inventario_versionado()["routes"]
        if fila["exposure"] == surface.PUBLIC and fila["method"] in ("POST", "PUT", "PATCH", "DELETE") and not fila["throttle"]
    ]
    assert sin_limite == []


def test_la_superficie_del_juego_no_declara_limites():
    """Pausa, salida segura, reanudar y el resto del juego (``api/simulation/``) no se frenan: jamás se bloquea a quien
    está en crisis. El límite por persona (``api_user``) se decide después de medir ``load:aula``."""
    con_limite = [
        (fila["method"], fila["route"])
        for fila in _inventario_versionado()["routes"]
        if fila["route"].startswith("api/simulation/") and fila["throttle"]
    ]
    assert con_limite == []


def test_control_negativo_una_ruta_nueva_sin_regenerar_hace_fallar_el_inventario(monkeypatch):
    fila_inventada = {
        "route": "api/inventada",
        "method": "GET",
        "exposure": "authenticated",
        "body": "none",
        "throttle": None,
        "audit": None,
    }
    recorrido = surface.collect_routes
    monkeypatch.setattr(surface, "collect_routes", lambda patterns=None: [*recorrido(patterns), fila_inventada])

    with pytest.raises(AssertionError, match=re.escape("python -m shared.surface --write")):
        _afirmar_inventario_al_dia()


def test_control_negativo_vista_sin_permisos_aparece_publica_y_la_prueba_la_rechaza(monkeypatch):
    class SinPermisosDeclarados(APIView):
        permission_classes = []

        def get(self, request):
            return None

    urlconf = SimpleNamespace(url_patterns=[path("api/nueva", SinPermisosDeclarados.as_view())])
    monkeypatch.setattr(surface, "get_resolver", lambda: urlconf)

    with pytest.raises(AssertionError, match="api/nueva"):
        rutas_publicas.test_public_api_routes_are_exactly_the_declared_ones()
