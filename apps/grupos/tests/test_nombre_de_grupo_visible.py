"""SIEP-RNF-02 · El nombre de un grupo sale en los correos de invitación: texto visible, no de persona (R1b).

Se rechazan los invisibles y de dirección y los dominios desnudos, pero NO la regla de solo letras: un grupo puede
llamarse «Grupo 1A». La regla de persona es solo para nombres y apellidos. Los invisibles se construyen con ``chr``.
"""
import pytest

from apps.grupos.serializers import CrearGrupoSerializer

pytestmark = [pytest.mark.req("SIEP-RNF-02"), pytest.mark.security]


@pytest.mark.parametrize(
    "nombre", ["Grupo" + chr(0x202E) + "X", "Grupo" + chr(0x2028) + "B", "login.siep.co"]
)
def test_el_nombre_de_grupo_rechaza_los_invisibles_y_los_dominios(nombre):
    ser = CrearGrupoSerializer(data={"nombre": nombre, "codigo": "G-1"})

    assert not ser.is_valid()
    assert "nombre" in ser.errors


def test_el_nombre_de_grupo_acepta_cifras_y_guiones():
    ser = CrearGrupoSerializer(data={"nombre": "Grupo 1A - Mañana", "codigo": "G-1A"})

    assert ser.is_valid(), ser.errors
