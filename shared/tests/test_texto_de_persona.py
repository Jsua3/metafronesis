"""SIEP-RNF-02 · Los nombres que llegan a un correo institucional son texto de persona (plan 03, R1b punto 6).

``plain_text_problem`` deja pasar caracteres que cambian cómo se lee un texto (separadores de línea, controles
bidireccionales, de ancho cero) y dominios desnudos («login-siep.institucion-edu.co»): un nombre así entra en el correo
que sale del remitente institucional. ``person_text_problem`` cierra esas vías y, para nombres de persona, solo deja
letras, espacios, apóstrofos, guiones y puntos. ``texto_visible_problem`` es la parte que comparten todos los textos que
ve otra persona (también los nombres de grupo, que pueden llevar cifras).

Los caracteres invisibles se construyen con ``chr`` para que el archivo no lleve ninguno escrito a mano.
"""
import pytest

from shared import plain_text
from shared.plain_text import (
    MENSAJE_DOMINIO,
    MENSAJE_INVISIBLE,
    MENSAJE_PERSONA,
    person_text_problem,
    texto_visible_problem,
)

pytestmark = [pytest.mark.req("SIEP-RNF-02"), pytest.mark.security]

ACEPTADOS = ["María José", "O'Connor", "O’Brien", "Ana-Lucía", "J.R.", "J.R. Tolkien", "Nuñez", "Mª José"]
#: Cada signo ASCII que un nombre de persona no admite. El ``<`` se deja fuera: lo decide antes la regla de texto plano.
SIGNOS_PROHIBIDOS = list("!#$%&()*+,/:;=>?@[\\]^_`{|}~\"")
CIFRAS = ["2", "٣"]  # ASCII y arábigo-índico: ninguna es letra
DOMINIOS_DESNUDOS = ["login.siep", "login.siep.co", "login-siep.institucion-edu.co"]
INVISIBLES = [
    chr(cp)
    for cp in (
        0x0085, 0x2028, 0x2029, 0x061C, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F,
        0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069, 0xFEFF,
    )
]


@pytest.mark.parametrize("valor", ACEPTADOS)
def test_acepta_los_nombres_de_persona_validos(valor):
    assert person_text_problem(valor) is None


@pytest.mark.parametrize("signo", SIGNOS_PROHIBIDOS)
def test_rechaza_cada_signo_que_un_nombre_no_admite(signo):
    assert person_text_problem(f"Ana{signo}Lopez") == MENSAJE_PERSONA


@pytest.mark.parametrize("cifra", CIFRAS)
def test_rechaza_las_cifras_en_un_nombre_de_persona(cifra):
    assert person_text_problem(f"Ana{cifra}") == MENSAJE_PERSONA


@pytest.mark.parametrize("valor", DOMINIOS_DESNUDOS)
def test_rechaza_los_dominios_desnudos(valor):
    assert person_text_problem(valor) == MENSAJE_DOMINIO


@pytest.mark.parametrize("invisible", INVISIBLES, ids=[f"U+{ord(c):04X}" for c in INVISIBLES])
def test_rechaza_los_caracteres_invisibles_y_de_direccion(invisible):
    assert person_text_problem(f"Ana{invisible}Lopez") == MENSAJE_INVISIBLE


@pytest.mark.parametrize("invisible", INVISIBLES, ids=[f"U+{ord(c):04X}" for c in INVISIBLES])
def test_el_texto_visible_tambien_rechaza_los_invisibles(invisible):
    assert texto_visible_problem(f"Grupo{invisible}1A", 255) == MENSAJE_INVISIBLE


@pytest.mark.parametrize(
    ("valor", "codigo"),
    [("<b>Ana</b>", plain_text.MARKUP), ("Ana\nLópez", plain_text.MULTILINE), ("https://x.test", plain_text.LINK)],
)
def test_la_regla_de_texto_plano_sigue_mandando(valor, codigo):
    assert person_text_problem(valor) == plain_text.MESSAGES[codigo]


@pytest.mark.parametrize("valor", ["Grupo 1A", "Práctica 2 - Mañana", "Psicología 2026-B"])
def test_un_nombre_de_grupo_puede_llevar_cifras_y_no_cae_en_la_regla_de_persona(valor):
    assert texto_visible_problem(valor, 255) is None


def test_un_nombre_de_grupo_con_dominio_desnudo_se_rechaza():
    assert texto_visible_problem("login.siep.co", 255) == MENSAJE_DOMINIO


def test_una_letra_con_tilde_combinada_se_acepta_porque_se_compara_en_forma_compuesta():
    assert person_text_problem("Mari" + chr(0x0301) + "a") is None


def test_un_valor_que_no_es_texto_se_rechaza():
    assert person_text_problem(12345) == plain_text.MESSAGES[plain_text.NOT_TEXT]


def test_el_tope_de_longitud_sigue_aplicandose():
    assert person_text_problem("x" * 101, 100) == plain_text.too_long_message(100)
