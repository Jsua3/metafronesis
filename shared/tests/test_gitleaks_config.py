"""La excepción por forma de gitleaks no deja pasar un token con forma de UUID (revisión S7-2, #4; RNF-01, LS-1, LS-2).

``.github/gitleaks.toml`` silencia las claves de dominio del caso (slugs como ``h1-interrogar-victima``) para la regla
``generic-api-key``. Antes la excepción era ``^[a-z0-9]+(?:-[a-z0-9]+)+$``, que también deja pasar un UUID (el formato de un
token de Railway) o un hash con guiones. Gitleaks no está instalado aquí y Actions está bloqueado: esta prueba evalúa las
expresiones del archivo (sin anticipación, así que ``re`` de Python y RE2 de Go coinciden) con UUID y con slugs reales.
"""
import re
import tomllib
from pathlib import Path

import pytest

pytestmark = [pytest.mark.req("RNF-01"), pytest.mark.security]

CONFIGURACION = Path(__file__).resolve().parents[3] / ".github" / "gitleaks.toml"

SLUGS_REALES = [
    "h1-interrogar-victima",
    "h2-orientar-victima-con-calma",
    "sala-urgencias",
    "entrada-principal",
    "opcion-1-a",
    "x-1",
]
CON_FORMA_DE_CREDENCIAL = [
    "123e4567-e89b-12d3-a456-426614174000",  # un UUID v4
    "0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
    "deadbeef-0000",
    "abcdef0123456789",
    "UPPER-case-token",
    "con_guion_bajo-x",
    "singuiones",
]


def _expresiones():
    datos = tomllib.loads(CONFIGURACION.read_text(encoding="utf-8"))
    return [re.compile(texto) for texto in datos["allowlist"]["regexes"]]


def _silenciado(valor, expresiones):
    return any(expresion.search(valor) for expresion in expresiones)


def test_el_archivo_es_toml_valido_y_sus_expresiones_compilan():
    assert _expresiones(), "la excepción tiene al menos una expresión"


@pytest.mark.parametrize("valor", SLUGS_REALES)
def test_los_slugs_reales_del_caso_siguen_silenciados(valor):
    assert _silenciado(valor, _expresiones())


@pytest.mark.parametrize("valor", CON_FORMA_DE_CREDENCIAL)
def test_un_uuid_o_un_hash_con_guiones_ya_no_pasa_limpio(valor):
    assert not _silenciado(valor, _expresiones())


def test_control_negativo_la_expresion_vieja_si_dejaba_pasar_un_uuid():
    vieja = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)+$")

    assert vieja.search("123e4567-e89b-12d3-a456-426614174000"), "la prueba de arriba sí vigila el cambio"
