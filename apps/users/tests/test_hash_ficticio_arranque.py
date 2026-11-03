"""SIEP-RNF-03 · El hash ficticio se calcula al arrancar, no en el primer intento (plan 03, S1-3).

El primer inicio de sesión con un correo inexistente tardaba el doble que los siguientes: en cada proceso, ese primer
intento calculaba el hash bcrypt ficticio (un oráculo de tiempo para adivinar cuentas). ``UsersConfig.ready()`` lo
calienta al arrancar, así que el primer intento ya cuesta lo mismo que los demás.
"""
import pytest
from django.apps import apps

from apps.users.models import _hash_ficticio

pytestmark = [pytest.mark.req("SIEP-RNF-03"), pytest.mark.security]


def test_al_arrancar_el_hash_ficticio_ya_esta_calculado_sin_ninguna_peticion():
    _hash_ficticio.cache_clear()

    apps.get_app_config("users").ready()

    assert type(apps.get_app_config("users")).__name__ == "UsersConfig"
    assert _hash_ficticio.cache_info().currsize == 1
