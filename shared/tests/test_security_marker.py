"""El marcador ``security`` y su regla: toda prueba ``security`` lleva además ``req`` (plan 03, S0-1)."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest

from shared.testing import security_items_without_req

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security]


class _Item:
    """Un ítem de pytest mínimo: solo lo que mira la regla (``nodeid`` e ``iter_markers``)."""

    def __init__(self, nodeid, *, security=False, req=None):
        self.nodeid = nodeid
        self._marcas = []
        if security:
            self._marcas.append(SimpleNamespace(name="security", args=()))
        if req is not None:
            self._marcas.append(SimpleNamespace(name="req", args=(req,)))

    def iter_markers(self, name=None):
        return iter(marca for marca in self._marcas if name is None or marca.name == name)


def _gancho_de_recoleccion():
    """El ``pytest_collection_modifyitems`` del conftest de ``backend_django``, cargado por ruta."""
    ruta = Path(__file__).resolve().parents[2] / "conftest.py"
    especificacion = importlib.util.spec_from_file_location("conftest_raiz_de_prueba", ruta)
    modulo = importlib.util.module_from_spec(especificacion)
    especificacion.loader.exec_module(modulo)
    return modulo.pytest_collection_modifyitems


def test_el_marcador_security_esta_declarado_en_pytest_ini(request):
    nombres = {linea.split(":")[0].split("(")[0].strip() for linea in request.config.getini("markers")}
    assert "security" in nombres


def test_security_items_without_req_solo_devuelve_las_pruebas_security_sin_req():
    solo_security = _Item("shared/tests/t.py::solo_security", security=True)
    con_req = _Item("shared/tests/t.py::security_con_req", security=True, req="RNF-002")
    solo_req = _Item("shared/tests/t.py::solo_req", req="RNF-002")
    ninguno = _Item("shared/tests/t.py::ninguno")

    devueltas = security_items_without_req([solo_security, con_req, solo_req, ninguno])

    assert [item.nodeid for item in devueltas] == ["shared/tests/t.py::solo_security"]


def test_el_gancho_de_recoleccion_rechaza_una_prueba_security_sin_req():
    gancho = _gancho_de_recoleccion()

    with pytest.raises(pytest.UsageError, match="security sin req"):
        gancho(None, [_Item("shared/tests/t.py::solo_security", security=True)])


def test_el_gancho_de_recoleccion_acepta_una_prueba_security_con_req():
    gancho = _gancho_de_recoleccion()

    gancho(None, [_Item("shared/tests/t.py::security_con_req", security=True, req="RNF-002")])


def test_una_prueba_security_real_lleva_req(request):
    assert next(request.node.iter_markers("security"), None) is not None
    assert next(request.node.iter_markers("req"), None) is not None
