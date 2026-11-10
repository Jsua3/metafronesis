"""S6-1 · Contenedor mínimo y sin root: contrato estático de la imagen, sus dependencias y su contexto.

Comprueba en los archivos reales (a)-(f) del plan: la imagen corre como un usuario fijo no root (uid/gid 10001) y su
USER es la última instrucción antes de CMD; las dos bases van fijadas por resumen sha256; el CMD migra y arranca
gunicorn endurecido sin perder el dimensionado de E5-3; el .dockerignore excluye lo que la imagen no necesita; el
requirements.txt de producción no nombra herramientas de prueba y requirements-dev.txt las agrupa; y los instaladores
de prueba (CI y dev-up) usan requirements-dev.txt.

Cada comprobación es una función pura sobre el texto. Los controles negativos mutan una copia del texto real y exigen
que la comprobación proteste: si un cambio futuro la deja sin efecto, la prueba se pone en rojo.
"""

import re
from pathlib import Path

import pytest

pytestmark = [pytest.mark.req("BLOQUE-L", "SF-13"), pytest.mark.security]

ROOT = Path(__file__).resolve().parents[3]  # raíz del repositorio

UID_APLICACION = "10001"
BASE_NODE = "node:26-alpine@sha256:"
BASE_PYTHON = "python:3.14-slim@sha256:"
LINEA_FROM = re.compile(r"^(?i:FROM)\s+\S+@sha256:[0-9a-f]{64}(\s+(?i:AS)\s+\S+)?$")

PATRONES_DOCKERIGNORE = (
    "docs/",
    ".superpowers/",
    "scripts/",
    "**/tests",
    "**/conftest.py",
    "**/pytest.ini",
    ".env*",
    "**/.env*",
    "!.env.example",
    "!**/.env.example",
    "**/psychosim/settings/local.py",
    "**/*.pem",
    "**/*.key",
    "**/*.crt",
    "**/*.p12",
    "*.sql",
    ".worktrees/",
    ".claude/",
    "frontend/e2e",
    "frontend/scripts",
    # npm run build lee este script (ng build && node scripts/ui/check-dist-dev-only.mjs): sin la excepción el build se rompe.
    "!frontend/scripts/ui/check-dist-dev-only.mjs",
    "**/_sondeo",
)

ARGUMENTOS_CMD = (
    "python manage.py migrate --noinput",
    "exec gunicorn",
    "--worker-class gthread",
    "--workers 3",
    "--threads 4",
    "--timeout 120",
    "--keep-alive",
    "--graceful-timeout",
    "--worker-tmp-dir",
)

HERRAMIENTAS_DE_PRUEBA = ("pytest", "factory", "pip-audit")
REQUISITOS_DEV = ("pytest==", "pytest-django==", "factory-boy==", "pip-audit==")


def _lineas(texto):
    return [linea.strip() for linea in texto.splitlines()]


def violaciones_usuario(dockerfile):
    """(a) USER fijo no root (10001:10001), creado con groupadd/useradd, y el último USER antes de CMD."""
    lineas = _lineas(dockerfile)
    usuarios = [indice for indice, linea in enumerate(lineas) if linea.startswith("USER ")]
    cmds = [indice for indice, linea in enumerate(lineas) if linea.startswith("CMD ")]
    if not usuarios:
        return ["el Dockerfile no tiene ninguna instrucción USER"]
    if not cmds:
        return ["el Dockerfile no tiene CMD"]
    partes = lineas[usuarios[-1]].split(None, 1)
    valor = partes[1].strip() if len(partes) > 1 else ""
    problemas = []
    if usuarios[-1] > cmds[-1]:
        problemas.append("la última instrucción USER va después de CMD")
    if valor != f"{UID_APLICACION}:{UID_APLICACION}":
        problemas.append(f"USER debe ser {UID_APLICACION}:{UID_APLICACION} (no root y fijo), no {valor!r}")
    if "groupadd" not in dockerfile or f"--gid {UID_APLICACION}" not in dockerfile:
        problemas.append("falta crear el grupo fijo con groupadd --gid 10001")
    if "useradd" not in dockerfile or f"--uid {UID_APLICACION}" not in dockerfile:
        problemas.append("falta crear el usuario fijo con useradd --uid 10001")
    for requisito in ("--no-create-home", "--shell /usr/sbin/nologin"):
        if requisito not in dockerfile:
            problemas.append(f"el usuario de la imagen debe llevar {requisito}")
    return problemas


def violaciones_bases(dockerfile):
    """(b) Cada FROM lleva @sha256: de 64 hex; siguen siendo node:26-alpine y python:3.14-slim."""
    froms = [linea for linea in _lineas(dockerfile) if linea.upper().startswith("FROM ")]
    problemas = [f"FROM sin resumen sha256 de 64 hex: {linea}" for linea in froms if not LINEA_FROM.match(linea)]
    if not any(linea.startswith(f"FROM {BASE_NODE}") for linea in froms):
        problemas.append("falta la etapa FROM node:26-alpine@sha256:…")
    if not any(linea.startswith(f"FROM {BASE_PYTHON}") for linea in froms):
        problemas.append("falta la etapa FROM python:3.14-slim@sha256:…")
    return problemas


def violaciones_cmd(dockerfile):
    """(c) El CMD migra antes de arrancar gunicorn y conserva el dimensionado de E5-3 y los ajustes de S6-1."""
    cmds = [linea for linea in _lineas(dockerfile) if linea.startswith("CMD ")]
    if not cmds:
        return ["el Dockerfile no tiene CMD"]
    cmd = cmds[-1]
    problemas = [f"el CMD no contiene {argumento!r}" for argumento in ARGUMENTOS_CMD if argumento not in cmd]
    if "migrate" in cmd and "gunicorn" in cmd and cmd.index("migrate") > cmd.index("gunicorn"):
        problemas.append("migrate debe ir antes de gunicorn")
    return problemas


def violaciones_dockerignore(texto):
    """(d) Cada patrón de la lista de S6-1 (y las dos excepciones de los .example) está como línea propia."""
    lineas = {linea.strip() for linea in texto.splitlines()}
    return [f"falta {patron!r} en .dockerignore" for patron in PATRONES_DOCKERIGNORE if patron not in lineas]


def violaciones_requisitos(requirements, dev):
    """(e) requirements.txt no nombra herramientas de prueba; requirements-dev.txt incluye la base y las cuatro."""
    problemas = []
    minusculas = requirements.lower()
    for herramienta in HERRAMIENTAS_DE_PRUEBA:
        if herramienta in minusculas:
            problemas.append(f"requirements.txt nombra {herramienta!r} (va en requirements-dev.txt)")
    lineas_dev = _lineas(dev)
    if "-r requirements.txt" not in lineas_dev:
        problemas.append("requirements-dev.txt no incluye «-r requirements.txt»")
    for requisito in REQUISITOS_DEV:
        if not any(linea.startswith(requisito) for linea in lineas_dev):
            problemas.append(f"requirements-dev.txt no fija {requisito[:-2]}")
    return problemas


def violaciones_imagen(dockerfile):
    """(e) La imagen instala solo requirements.txt: ninguna instrucción RUN, COPY o ADD toca requirements-dev.txt."""
    instrucciones = [linea for linea in _lineas(dockerfile) if linea.upper().startswith(("RUN ", "COPY ", "ADD "))]
    return [f"una instrucción de la imagen toca requirements-dev.txt: {linea}" for linea in instrucciones if "requirements-dev" in linea]


def violaciones_instaladores(ci, e2e, dev_up):
    """(f) Los instaladores de prueba de CI, e2e y dev-up usan requirements-dev.txt; la auditoría sigue en requirements.txt."""
    problemas = []
    for nombre, texto in (("ci.yml", ci), ("e2e-full-case.yml", e2e)):
        if "pip install -r backend_django/requirements.txt" in texto:
            problemas.append(f"{nombre} instala requirements.txt para probar (debe ser requirements-dev.txt)")
        if "pip install -r backend_django/requirements-dev.txt" not in texto:
            problemas.append(f"{nombre} no instala requirements-dev.txt")
    if "pip-audit -r backend_django/requirements.txt" not in ci:
        problemas.append("el trabajo audit de ci.yml debe seguir auditando requirements.txt")
    if not re.search(r"['\"]requirements-dev\.txt['\"]", dev_up):
        problemas.append("scripts/dev-up.mjs no instala requirements-dev.txt")
    return problemas


def _leer(ruta):
    return (ROOT / ruta).read_text(encoding="utf-8")


def _mutar(texto, antes, despues="", *, regex=False):
    """Copia mutada del texto real. Si la mutación no cambia nada, el control no protege nada: se avisa."""
    nuevo = re.sub(antes, despues, texto, count=1, flags=re.MULTILINE) if regex else texto.replace(antes, despues, 1)
    assert nuevo != texto, f"la mutación no cambia el archivo ({antes!r}): el control no protege nada"
    return nuevo


# --- Archivos reales -------------------------------------------------------------------------------------------------


def test_la_imagen_corre_como_usuario_fijo_no_root():
    assert violaciones_usuario(_leer("Dockerfile")) == []


def test_las_dos_bases_van_fijadas_por_resumen():
    assert violaciones_bases(_leer("Dockerfile")) == []


def test_el_cmd_migra_y_arranca_gunicorn_endurecido():
    assert violaciones_cmd(_leer("Dockerfile")) == []


def test_el_dockerignore_excluye_lo_que_la_imagen_no_necesita():
    assert violaciones_dockerignore(_leer(".dockerignore")) == []


def test_produccion_no_instala_herramientas_de_prueba():
    requirements, dev = _leer("backend_django/requirements.txt"), _leer("backend_django/requirements-dev.txt")
    assert violaciones_requisitos(requirements, dev) == []
    assert violaciones_imagen(_leer("Dockerfile")) == []


def test_los_instaladores_de_prueba_usan_requirements_dev():
    ci, e2e = _leer(".github/workflows/ci.yml"), _leer(".github/workflows/e2e-full-case.yml")
    assert violaciones_instaladores(ci, e2e, _leer("scripts/dev-up.mjs")) == []


# --- Controles negativos: cada comprobación debe protestar ante su mutación ------------------------------------------


def test_control_negativo_sin_instruccion_user():
    mutado = _mutar(_leer("Dockerfile"), r"^USER 10001:10001\n", regex=True)
    assert violaciones_usuario(mutado)


def test_control_negativo_user_root():
    mutado = _mutar(_leer("Dockerfile"), "USER 10001:10001", "USER root")
    assert violaciones_usuario(mutado)


def test_control_negativo_user_despues_de_cmd():
    dockerfile = _leer("Dockerfile")
    mutado = _mutar(dockerfile, "USER 10001:10001\n") + "USER 10001:10001\n"
    assert violaciones_usuario(mutado)


def test_control_negativo_base_sin_resumen():
    mutado = _mutar(_leer("Dockerfile"), r"@sha256:[0-9a-f]{64}", regex=True)
    assert violaciones_bases(mutado)


def test_control_negativo_cmd_sin_keep_alive():
    mutado = _mutar(_leer("Dockerfile"), " --keep-alive 5")
    assert violaciones_cmd(mutado)


def test_control_negativo_cmd_sin_worker_tmp_dir():
    mutado = _mutar(_leer("Dockerfile"), " --worker-tmp-dir /dev/shm")
    assert violaciones_cmd(mutado)


def test_control_negativo_migrate_sin_noinput():
    mutado = _mutar(_leer("Dockerfile"), "migrate --noinput", "migrate")
    assert violaciones_cmd(mutado)


def test_control_negativo_dockerignore_sin_tests():
    mutado = _mutar(_leer(".dockerignore"), "**/tests\n")
    assert violaciones_dockerignore(mutado)


def test_control_negativo_dockerignore_sin_excepcion_de_ejemplos():
    mutado = _mutar(_leer(".dockerignore"), "!**/.env.example\n")
    assert violaciones_dockerignore(mutado)


def test_control_negativo_dockerignore_sin_excepcion_del_build_del_frontend():
    mutado = _mutar(_leer(".dockerignore"), "!frontend/scripts/ui/check-dist-dev-only.mjs\n")
    assert violaciones_dockerignore(mutado)


def test_control_negativo_pytest_de_vuelta_en_produccion():
    mutado = _leer("backend_django/requirements.txt") + "pytest==9.1.1\n"
    assert violaciones_requisitos(mutado, _leer("backend_django/requirements-dev.txt"))


def test_control_negativo_requirements_dev_sin_la_base():
    mutado = _mutar(_leer("backend_django/requirements-dev.txt"), "-r requirements.txt\n")
    assert violaciones_requisitos(_leer("backend_django/requirements.txt"), mutado)


def test_control_negativo_imagen_que_instala_requirements_dev():
    mutado = _leer("Dockerfile") + "RUN pip install -r requirements-dev.txt\n"
    assert violaciones_imagen(mutado)


def test_control_negativo_ci_vuelve_a_instalar_requirements_para_probar():
    ci = _mutar(
        _leer(".github/workflows/ci.yml"),
        "pip install -r backend_django/requirements-dev.txt",
        "pip install -r backend_django/requirements.txt",
    )
    assert violaciones_instaladores(ci, _leer(".github/workflows/e2e-full-case.yml"), _leer("scripts/dev-up.mjs"))


def test_control_negativo_dev_up_instala_requirements_sin_herramientas():
    dev_up = _mutar(_leer("scripts/dev-up.mjs"), "'requirements-dev.txt'", "'requirements.txt'")
    assert violaciones_instaladores(_leer(".github/workflows/ci.yml"), _leer(".github/workflows/e2e-full-case.yml"), dev_up)
