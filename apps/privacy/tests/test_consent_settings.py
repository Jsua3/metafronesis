"""S3-2a · Los ajustes del consentimiento (ETH-01, SIEP-RF-05, RNF-010).

``SIEP_CONTENT_NOTICE_VERSION`` es de quien manda en el servidor: el cliente envía la que mostró y, si no coincide, 409. Un
valor vacío, con espacios o más largo que la columna (40) impediría registrar nada: detiene el arranque. Las dos banderas
nacen APAGADAS (hasta que el cliente use el servidor, S3-2b, y la institución entregue los textos).

``base.py`` se ejecuta con ``runpy`` y el entorno de cada prueba: no toca el módulo ya cargado por Django.
"""
import runpy
from pathlib import Path

import pytest
from django.core.exceptions import ImproperlyConfigured

pytestmark = [pytest.mark.req("ETH-01", "SIEP-RF-05", "RNF-010"), pytest.mark.security]

BASE_PY = Path(__file__).resolve().parents[3] / "psychosim" / "settings" / "base.py"
VARIABLES = (
    "SIEP_CONTENT_NOTICE_VERSION",
    "SIEP_CONSENT_REQUIRED",
    "SIEP_DATA_TREATMENT_CONSENT_REQUIRED",
    "SIEP_DATA_TREATMENT_NOTICE_VERSION",
)


def _cargar(monkeypatch, **entorno):
    """Los ajustes de ``base.py`` con ``entorno`` (``None`` quita la variable)."""
    for nombre in VARIABLES:
        monkeypatch.delenv(nombre, raising=False)
    for nombre, valor in entorno.items():
        if valor is not None:
            monkeypatch.setenv(nombre, valor)
    return runpy.run_path(str(BASE_PY), run_name="base_bajo_prueba")


def test_la_version_vigente_del_aviso_por_defecto_es_la_borrador_de_octubre(monkeypatch):
    # Esta prueba FIJA la versión vigente: el cliente la repite (S3-2b compara las dos). Si cambia, cambian los dos.
    assert _cargar(monkeypatch)["SIEP_CONTENT_NOTICE_VERSION"] == "2026-10-borrador"


def test_los_ajustes_vivos_de_las_pruebas_son_los_de_por_defecto(settings):
    assert settings.SIEP_CONTENT_NOTICE_VERSION == "2026-10-borrador"
    assert settings.SIEP_CONSENT_REQUIRED is False
    assert settings.SIEP_DATA_TREATMENT_CONSENT_REQUIRED is False
    assert settings.SIEP_DATA_TREATMENT_NOTICE_VERSION == ""


@pytest.mark.parametrize("valor", ["v1", "2026-11", "aviso_2.1", "a" * 40, "2026-10-borrador", "versión-2"])
def test_una_version_valida_del_aviso_se_acepta(monkeypatch, valor):
    assert _cargar(monkeypatch, SIEP_CONTENT_NOTICE_VERSION=valor)["SIEP_CONTENT_NOTICE_VERSION"] == valor


@pytest.mark.parametrize(
    "valor",
    ["", " ", "   ", " v1", "v1 ", "2026 10", "v\t1", "v1\n", "a" * 41],
    ids=["vacía", "un espacio", "solo espacios", "espacio al inicio", "espacio al final", "espacio dentro", "tabulador",
         "salto de línea", "41 caracteres"],
)
def test_una_version_vacia_con_espacios_o_demasiado_larga_detiene_el_arranque(monkeypatch, valor):
    with pytest.raises(ImproperlyConfigured, match="SIEP_CONTENT_NOTICE_VERSION") as error:
        _cargar(monkeypatch, SIEP_CONTENT_NOTICE_VERSION=valor)

    # El valor leído no entra en el mensaje (puede ser un secreto pegado en la variable equivocada).
    assert not valor.strip() or valor.strip() not in str(error.value)


@pytest.mark.parametrize("nombre", ["SIEP_CONSENT_REQUIRED", "SIEP_DATA_TREATMENT_CONSENT_REQUIRED"])
def test_las_banderas_de_exigencia_nacen_apagadas(monkeypatch, nombre):
    assert _cargar(monkeypatch)[nombre] is False


@pytest.mark.parametrize("nombre", ["SIEP_CONSENT_REQUIRED", "SIEP_DATA_TREATMENT_CONSENT_REQUIRED"])
@pytest.mark.parametrize("valor", ["1", "true", "TRUE", "yes", "on"])
def test_un_valor_de_encendido_enciende_la_bandera(monkeypatch, nombre, valor):
    entorno = {nombre: valor, "SIEP_DATA_TREATMENT_NOTICE_VERSION": "datos-1"}

    assert _cargar(monkeypatch, **entorno)[nombre] is True


@pytest.mark.parametrize("nombre", ["SIEP_CONSENT_REQUIRED", "SIEP_DATA_TREATMENT_CONSENT_REQUIRED"])
@pytest.mark.parametrize("valor", ["0", "false", "no", "off", "", "ture"])
def test_cualquier_otro_valor_deja_la_bandera_apagada(monkeypatch, nombre, valor):
    assert _cargar(monkeypatch, **{nombre: valor})[nombre] is False


def test_la_version_del_aviso_de_tratamiento_de_datos_viene_vacia_y_acepta_una_valida(monkeypatch):
    assert _cargar(monkeypatch)["SIEP_DATA_TREATMENT_NOTICE_VERSION"] == ""
    assert _cargar(monkeypatch, SIEP_DATA_TREATMENT_NOTICE_VERSION="datos-1")["SIEP_DATA_TREATMENT_NOTICE_VERSION"] == "datos-1"


@pytest.mark.parametrize("valor", [" ", "datos 1", "a" * 41, "datos\t1"])
def test_una_version_invalida_del_aviso_de_tratamiento_de_datos_detiene_el_arranque(monkeypatch, valor):
    with pytest.raises(ImproperlyConfigured, match="SIEP_DATA_TREATMENT_NOTICE_VERSION"):
        _cargar(monkeypatch, SIEP_DATA_TREATMENT_NOTICE_VERSION=valor)


def test_exigir_el_tratamiento_de_datos_sin_decir_cual_aviso_detiene_el_arranque(monkeypatch):
    # Sin versión del aviso no hay a qué aceptar: la institución aún no entregó el texto (la bandera sigue apagada).
    with pytest.raises(ImproperlyConfigured, match="SIEP_DATA_TREATMENT_NOTICE_VERSION"):
        _cargar(monkeypatch, SIEP_DATA_TREATMENT_CONSENT_REQUIRED="true")

    ajustes = _cargar(
        monkeypatch, SIEP_DATA_TREATMENT_CONSENT_REQUIRED="true", SIEP_DATA_TREATMENT_NOTICE_VERSION="datos-1"
    )
    assert ajustes["SIEP_DATA_TREATMENT_CONSENT_REQUIRED"] is True
