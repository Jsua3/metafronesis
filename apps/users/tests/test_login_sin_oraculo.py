"""S1-3 (A) · el inicio de sesión no revela qué cuentas existen por el tiempo que tarda.

El tiempo no se mide (es inestable): se cuenta que cada intento gasta EXACTAMENTE un ``bcrypt.checkpw``,
también cuando no hay contra qué comparar (correo inexistente o cuenta sin clave usable).
"""
import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

import apps.users.models as modelos

pytestmark = [pytest.mark.req("D-14"), pytest.mark.security]

URL = "/api/auth/login"
User = get_user_model()


@pytest.fixture
def clave():
    return secrets.token_urlsafe(32)


@pytest.fixture
def clave_mala():
    return secrets.token_urlsafe(32)


@pytest.fixture
def cuenta_bcrypt(monkeypatch):
    """Lista de las llamadas a ``bcrypt.checkpw``: el trabajo que cuesta un intento de inicio de sesión."""
    llamadas = []
    original = modelos.bcrypt.checkpw

    def contar(*args, **kwargs):
        llamadas.append(args)
        return original(*args, **kwargs)

    monkeypatch.setattr(modelos.bcrypt, "checkpw", contar)
    return llamadas


def _login(email, password):
    return APIClient().post(URL, {"email": email, "password": password}, format="json", REMOTE_ADDR="198.51.100.10")


def test_los_cuatro_fallos_gastan_un_checkpw_y_responden_lo_mismo(db, cuenta_bcrypt, clave, clave_mala):
    activa = User.objects.create_user(email="activa.s13@inst.test", password=clave, nombre="Ana", apellido="Activa")
    sin_clave = User.objects.create_user(email="sinclave.s13@inst.test", password=None, nombre="Sin", apellido="Clave")
    inactiva = User.objects.create_user(email="inactiva.s13@inst.test", password=clave, nombre="Ina", apellido="Ctiva")
    inactiva.activo = False
    inactiva.save()

    casos = {
        "correo inexistente": ("nadie.s13@inst.test", clave_mala),
        "cuenta activa con clave mala": (activa.email, clave_mala),
        "cuenta con clave inutilizable": (sin_clave.email, clave),
        "cuenta inactiva con clave correcta": (inactiva.email, clave),
    }
    respuestas = {}
    for nombre_caso, (email, password) in casos.items():
        cuenta_bcrypt.clear()
        respuestas[nombre_caso] = _login(email, password)
        assert len(cuenta_bcrypt) == 1, f"{nombre_caso}: {len(cuenta_bcrypt)} llamadas a checkpw (se esperaba 1)"

    assert all(resp.status_code == 401 for resp in respuestas.values())
    cuerpos = [resp.data for resp in respuestas.values()]
    assert all(cuerpo == cuerpos[0] for cuerpo in cuerpos)


def test_un_acierto_sigue_dando_200_y_gasta_un_checkpw(db, cuenta_bcrypt, clave):
    User.objects.create_user(email="acierto.s13@inst.test", password=clave, nombre="Ana", apellido="Bien")

    resp = _login("acierto.s13@inst.test", clave)

    assert resp.status_code == 200
    assert len(cuenta_bcrypt) == 1


def test_burn_password_check_siempre_devuelve_falso(clave):
    from apps.users.models import burn_password_check

    assert burn_password_check(clave) is False


def test_el_hash_ficticio_es_bcrypt_de_diez_rondas_y_se_calcula_una_sola_vez(monkeypatch, clave):
    from apps.users.models import burn_password_check

    modelos._hash_ficticio.cache_clear()
    hashes = []
    original = modelos.bcrypt.hashpw

    def contar(*args, **kwargs):
        hashes.append(args)
        return original(*args, **kwargs)

    monkeypatch.setattr(modelos.bcrypt, "hashpw", contar)
    burn_password_check(clave)
    burn_password_check(secrets.token_urlsafe(32))

    assert len(hashes) == 1, f"el hash ficticio se calculó {len(hashes)} veces"
    ficticio = modelos._hash_ficticio()
    assert ficticio.startswith(b"$2")
    assert ficticio.split(b"$")[2] == b"10"
