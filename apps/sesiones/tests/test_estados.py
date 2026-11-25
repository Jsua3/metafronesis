"""Tabla del patrón State: 5 estados × cada operación. No toca la base (no llama a ``al_entrar``)."""
import pytest

from apps.sesiones.estados import ESTADOS
from shared.exceptions import ApiError

pytestmark = [pytest.mark.req("SIEP-35")]

P, C, PA, F, X = "PROGRAMADA", "EN_CURSO", "PAUSADA", "FINALIZADA", "CANCELADA"

DESTINOS = {
    P: {"iniciar": C, "cancelar": X},
    C: {"pausar": PA, "finalizar": F},
    PA: {"reanudar": C, "finalizar": F},
    F: {},
    X: {},
}
CIERRE_AUTOMATICO = {P: X, C: F, PA: F, F: F, X: X}
EDITABLE = {P}
GESTIONA = {P, C, PA}
ERROR_DE_INGRESO = {P: "SESSION_NOT_STARTED", C: None, PA: "SESSION_PAUSED", F: "SESSION_FINISHED", X: "SESSION_CANCELLED"}
ACCIONES = {
    P: ["iniciar", "cancelar", "editar", "gestionarConvocados"],
    C: ["pausar", "finalizar", "gestionarConvocados"],
    PA: ["reanudar", "finalizar", "gestionarConvocados"],
    F: [],
    X: [],
}


def test_hay_un_objeto_por_estado():
    assert set(ESTADOS) == {P, C, PA, F, X}
    assert all(estado.valor == clave for clave, estado in ESTADOS.items())


@pytest.mark.parametrize("origen", [P, C, PA, F, X])
@pytest.mark.parametrize("accion", ["iniciar", "pausar", "reanudar", "finalizar", "cancelar"])
def test_transiciones(origen, accion):
    estado = ESTADOS[origen]
    destino = DESTINOS[origen].get(accion)
    if destino:
        assert getattr(estado, accion)(None).valor == destino
    else:
        with pytest.raises(ApiError) as error:
            getattr(estado, accion)(None)
        assert error.value.api_code == "INVALID_TRANSITION" and error.value.status_code == 409


@pytest.mark.parametrize("origen", [P, C, PA, F, X])
def test_cierre_automatico(origen):
    assert ESTADOS[origen].cerrar_automatico(None).valor == CIERRE_AUTOMATICO[origen]


@pytest.mark.parametrize("origen", [P, C, PA, F, X])
def test_edicion_y_gestion(origen):
    estado = ESTADOS[origen]
    assert estado.puede_editar() is (origen in EDITABLE)
    assert estado.puede_gestionar_convocados() is (origen in GESTIONA)
    for permitido, exigir in ((origen in EDITABLE, estado.exigir_edicion), (origen in GESTIONA, estado.exigir_gestion)):
        if permitido:
            exigir()
        else:
            with pytest.raises(ApiError) as error:
                exigir()
            assert error.value.api_code == "INVALID_TRANSITION"


@pytest.mark.parametrize("origen", [P, C, PA, F, X])
def test_ingreso(origen):
    esperado = ERROR_DE_INGRESO[origen]
    if esperado is None:
        assert ESTADOS[origen].verificar_ingreso() is None
    else:
        with pytest.raises(ApiError) as error:
            ESTADOS[origen].verificar_ingreso()
        assert error.value.api_code == esperado and error.value.status_code == 409


@pytest.mark.parametrize("origen", [P, C, PA, F, X])
def test_acciones_para_el_frontend(origen):
    assert ESTADOS[origen].acciones() == ACCIONES[origen]
