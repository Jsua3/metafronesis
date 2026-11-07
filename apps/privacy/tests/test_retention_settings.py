"""S3-4 · El ajuste de la retención de las solicitudes de acceso (RNF-003).

``SIEP_RETENTION_ACCESS_REQUEST_DAYS`` es de la INSTITUCIÓN (SD-9, pendiente): vacía o 0 significa que no se borra ninguna
solicitud. Un valor que no es un entero ≥ 0 detiene el arranque (como los demás ajustes) sin mostrar lo que se leyó.

``base.py`` se ejecuta con ``runpy`` y el entorno de cada prueba: no toca el módulo ya cargado por Django.
"""
import runpy
from pathlib import Path

import pytest
from django.core.exceptions import ImproperlyConfigured

pytestmark = [pytest.mark.req("RNF-003"), pytest.mark.security]

BACKEND = Path(__file__).resolve().parents[3]
RAIZ = BACKEND.parent
BASE_PY = BACKEND / "psychosim" / "settings" / "base.py"
VARIABLE = "SIEP_RETENTION_ACCESS_REQUEST_DAYS"


def _cargar(monkeypatch, valor=None):
    """Los ajustes de ``base.py`` con la variable puesta a ``valor`` (``None`` la quita)."""
    monkeypatch.delenv(VARIABLE, raising=False)
    if valor is not None:
        monkeypatch.setenv(VARIABLE, valor)
    return runpy.run_path(str(BASE_PY), run_name="base_bajo_prueba")


def test_por_defecto_no_se_borra_ninguna_solicitud(monkeypatch):
    assert _cargar(monkeypatch)[VARIABLE] == 0


@pytest.mark.parametrize("valor", ["", " ", "   "])
def test_vacia_o_con_solo_espacios_cuenta_como_ausente(monkeypatch, valor):
    assert _cargar(monkeypatch, valor)[VARIABLE] == 0


@pytest.mark.parametrize(("valor", "esperado"), [("0", 0), ("1", 1), ("30", 30), (" 365 ", 365), ("999999999", 999999999)])
def test_un_entero_mayor_o_igual_a_cero_se_acepta(monkeypatch, valor, esperado):
    assert _cargar(monkeypatch, valor)[VARIABLE] == esperado


@pytest.mark.parametrize("valor", ["-1", "1.5", "treinta", "30 dias", "1e3", "+5", "9999999999", "٣٠"])
def test_un_valor_que_no_es_un_entero_mayor_o_igual_a_cero_detiene_el_arranque(monkeypatch, valor):
    with pytest.raises(ImproperlyConfigured, match=VARIABLE) as error:
        _cargar(monkeypatch, valor)

    # El valor leído no entra en el mensaje (puede ser un secreto pegado en la variable equivocada).
    assert valor.strip() not in str(error.value)


def test_el_ajuste_vivo_de_las_pruebas_es_el_de_por_defecto(settings):
    assert settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS == 0


@pytest.mark.parametrize("archivo", [RAIZ / ".env.example", BACKEND / ".env.example"], ids=["raiz", "backend"])
def test_las_plantillas_documentan_la_variable_sin_encenderla(archivo):
    lineas = archivo.read_text(encoding="utf-8").splitlines()

    assert any(VARIABLE in linea for linea in lineas), f"{archivo} debe documentar {VARIABLE}"
    # Una plantilla copiada sin cambiar no puede empezar a borrar solicitudes: la línea va comentada o en cero.
    activas = [linea for linea in lineas if linea.startswith(f"{VARIABLE}=")]
    assert all(linea.split("=", 1)[1].strip() in {"", "0"} for linea in activas)
