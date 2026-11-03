"""SIEP-RNF-02 · Los interruptores de seguridad fallan cerrados (plan 03, S1-2 y S1-4).

``SIEP_THROTTLE_ENABLED`` y ``SIEP_SESSION_EPOCH_ENFORCE`` se apagaban con CUALQUIER valor que no fuera 1/true/yes/on: un
error de tecleo («ture») apagaba el limitador o la época de sesión en silencio. Ahora solo un valor de apagado los apaga;
cualquier otro valor los deja encendidos y avisa en el registro, sin mostrar el valor.
"""
import importlib
import logging

import pytest

from psychosim.settings import base as base_settings

pytestmark = [pytest.mark.req("SIEP-RNF-02"), pytest.mark.security]

VARIABLE = "SIEP_PRUEBA_INTERRUPTOR"
EVENTO = "valor_de_interruptor_no_reconocido"
APAGADOS = ["0", "false", "FALSE", "  off  ", "No", "no", "OFF"]
ENCENDIDOS = ["1", "true", "yes", "ON"]
NO_RECONOCIDOS = ["ture", "enabled", "y", "desactivado"]
INTERRUPTORES = ["SIEP_THROTTLE_ENABLED", "SIEP_SESSION_EPOCH_ENFORCE"]


@pytest.fixture
def base_restaurada(monkeypatch):
    """``base`` se recarga con el entorno de la prueba; al terminar se deshace el entorno y se vuelve a cargar."""
    yield
    monkeypatch.undo()
    importlib.reload(base_settings)


def _avisos(caplog):
    return [registro for registro in caplog.records if getattr(registro, "fields", {}).get("event") == EVENTO]


@pytest.mark.parametrize("valor", APAGADOS)
def test_un_valor_de_apagado_apaga_la_bandera(monkeypatch, valor):
    monkeypatch.setenv(VARIABLE, valor)

    assert base_settings._env_flag_cerrada(VARIABLE) is False


@pytest.mark.parametrize("valor", ENCENDIDOS)
def test_un_valor_de_encendido_enciende_sin_avisar(monkeypatch, caplog, valor):
    monkeypatch.setenv(VARIABLE, valor)

    with caplog.at_level(logging.WARNING, logger="siep.security"):
        assert base_settings._env_flag_cerrada(VARIABLE) is True

    assert _avisos(caplog) == []


@pytest.mark.parametrize("valor", NO_RECONOCIDOS)
def test_un_valor_no_reconocido_deja_la_bandera_encendida_y_avisa_una_vez_sin_el_valor(monkeypatch, caplog, valor):
    monkeypatch.setenv(VARIABLE, valor)

    with caplog.at_level(logging.WARNING, logger="siep.security"):
        assert base_settings._env_flag_cerrada(VARIABLE) is True

    avisos = _avisos(caplog)
    assert len(avisos) == 1
    assert avisos[0].fields["variable"] == VARIABLE
    assert valor not in avisos[0].getMessage()
    assert valor not in str(avisos[0].fields)


@pytest.mark.parametrize("valor", ["", "   "])
def test_vacio_cuenta_como_ausente(monkeypatch, caplog, valor):
    monkeypatch.setenv(VARIABLE, valor)

    with caplog.at_level(logging.WARNING, logger="siep.security"):
        assert base_settings._env_flag_cerrada(VARIABLE) is True
        assert base_settings._env_flag_cerrada(VARIABLE, default=False) is False

    assert _avisos(caplog) == []


def test_ausente_usa_el_valor_por_defecto(monkeypatch):
    monkeypatch.delenv(VARIABLE, raising=False)

    assert base_settings._env_flag_cerrada(VARIABLE) is True
    assert base_settings._env_flag_cerrada(VARIABLE, default=False) is False


@pytest.mark.parametrize("variable", INTERRUPTORES)
@pytest.mark.parametrize("valor", ["ture", "enabled"])
def test_los_interruptores_reales_fallan_cerrados_al_arrancar(monkeypatch, base_restaurada, variable, valor):
    monkeypatch.setenv(variable, valor)

    importlib.reload(base_settings)

    assert getattr(base_settings, variable) is True


@pytest.mark.parametrize("variable", INTERRUPTORES)
@pytest.mark.parametrize("valor", ["0", "off"])
def test_los_interruptores_reales_se_apagan_con_un_valor_de_apagado(monkeypatch, base_restaurada, variable, valor):
    monkeypatch.setenv(variable, valor)

    importlib.reload(base_settings)

    assert getattr(base_settings, variable) is False


@pytest.mark.parametrize("variable", INTERRUPTORES)
def test_los_interruptores_reales_valen_encendidos_por_defecto(monkeypatch, base_restaurada, variable):
    monkeypatch.delenv(variable, raising=False)

    importlib.reload(base_settings)

    assert getattr(base_settings, variable) is True
