"""SIEP-RNF-03 · Toda clave que se fija en el código de producción sale por un camino conocido (plan 03, S1-5).

Una clave puede colarse por una ruta que no mira la caducidad, la auditoría ni el aviso. Por eso cada llamada a
``.set_password(`` de ``apps/**`` (sin ``tests/`` ni ``management/``) debe estar en la lista permitida de abajo, con su
motivo. Una llamada nueva rompe la prueba; una entrada que ya no existe también, para que la lista no se vuelva decorativa.
"""
import ast
from pathlib import Path

import pytest

pytestmark = [pytest.mark.req("SIEP-RNF-03"), pytest.mark.security]

BACKEND = Path(__file__).resolve().parents[3]

#: (módulo, función) → por qué esa función puede fijar una clave. ``Clase.método`` para los métodos.
PERMITIDAS = {
    ("apps.users.models", "CustomUserManager.create_user"): (
        "fábrica de cuentas: fija la clave que le pasa quien llama; ``None`` deja la cuenta sin clave usable"
    ),
    ("apps.users.views", "GoogleLoginView.post"): (
        "al entrar con Google se quita la temporal: la clave queda sin usar (``None``) y se revocan las sesiones"
    ),
    ("apps.users.services.account_service", "_approve_one"): (
        "aprobación de una cuenta pendiente: clave temporal con fecha de caducidad (S1-5)"
    ),
    ("apps.users.services.account_service", "change_password"): (
        "la propia persona cambia su clave, tras comprobar la actual"
    ),
    ("apps.users.services.account_service", "return_expired_to_pending"): (
        "temporal caducada: la clave queda sin usar (``None``) y la cuenta vuelve a pendiente (S1-5)"
    ),
    ("apps.users.services.account_service", "set_password_by_admin"): (
        "único camino por el que un ADMIN fija una clave: queda temporal, con cambio obligatorio y fecha (SF-21)"
    ),
    ("apps.users.services.account_service", "create_admin_account"): (
        "primera cuenta ADMIN por terminal (``create_admin``): clave temporal con fecha, la pone el operador del despliegue"
    ),
    ("apps.users.services.account_service", "reset_admin_account"): (
        "reposición del ADMIN por terminal (``create_admin --reset``, R1b2): clave temporal con fecha, la pone el operador"
    ),
}


def _modulo(relativo):
    partes = list(relativo.with_suffix("").parts)
    if partes[-1] == "__init__":
        partes = partes[:-1]
    return ".".join(partes)


def _llamadas_en(arbol, modulo):
    """(módulo, función) de cada llamada a ``.set_password(``; la función es la envolvente más interna."""
    encontradas = set()

    def visitar(nodo, envolventes):
        for hijo in ast.iter_child_nodes(nodo):
            if isinstance(hijo, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                visitar(hijo, [*envolventes, hijo.name])
                continue
            if isinstance(hijo, ast.Call) and isinstance(hijo.func, ast.Attribute) and hijo.func.attr == "set_password":
                encontradas.add((modulo, ".".join(envolventes) or "<módulo>"))
            visitar(hijo, envolventes)

    visitar(arbol, [])
    return encontradas


def llamadas_a_set_password(raiz):
    """Las llamadas a ``.set_password(`` de ``apps/**`` bajo ``raiz``, fuera de ``tests/`` y ``management/``."""
    encontradas = set()
    for archivo in sorted((raiz / "apps").rglob("*.py")):
        relativo = archivo.relative_to(raiz)
        if {"tests", "management"} & set(relativo.parts):
            continue
        arbol = ast.parse(archivo.read_text(encoding="utf-8"), filename=str(archivo))
        encontradas |= _llamadas_en(arbol, _modulo(relativo))
    return encontradas


def _arbol(tmp_path, archivos):
    for relativo, fuente in archivos.items():
        destino = tmp_path / relativo
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(fuente, encoding="utf-8")
    return tmp_path


def test_cada_llamada_a_set_password_esta_en_la_lista_permitida():
    encontradas = llamadas_a_set_password(BACKEND)

    nuevas = sorted(encontradas - set(PERMITIDAS))
    retiradas = sorted(set(PERMITIDAS) - encontradas)
    assert not nuevas, f"Llamadas a set_password sin permiso (añádelas a PERMITIDAS con su motivo): {nuevas}"
    assert not retiradas, f"Entradas de PERMITIDAS que ya no existen (bórralas): {retiradas}"


def test_una_vista_que_fija_una_clave_aparece_como_llamada_nueva(tmp_path):
    raiz = _arbol(
        tmp_path,
        {
            "apps/users/views.py": (
                "class FakeView:\n"
                "    def post(self, request):\n"
                "        request.user.set_password(request.data['clave'])\n"
            ),
        },
    )

    assert llamadas_a_set_password(raiz) == {("apps.users.views", "FakeView.post")}


def test_las_pruebas_y_los_comandos_de_gestion_quedan_fuera(tmp_path):
    raiz = _arbol(
        tmp_path,
        {
            "apps/users/tests/test_x.py": "def prueba(cuenta, clave):\n    cuenta.set_password(clave)\n",
            "apps/users/management/commands/comando.py": "def handle(cuenta, clave):\n    cuenta.set_password(clave)\n",
        },
    )

    assert llamadas_a_set_password(raiz) == set()


def test_una_llamada_fuera_de_funcion_se_nombra_por_su_modulo(tmp_path):
    raiz = _arbol(
        tmp_path,
        {"apps/users/arranque.py": "cuenta.set_password(clave)\n"},
    )

    assert llamadas_a_set_password(raiz) == {("apps.users.arranque", "<módulo>")}
