"""S6-3 · Calendario de parches: docs/operacion/parches.md dice la versión que el proyecto usa de verdad.

La tabla de «Versiones vigiladas» se compara con los archivos que fijan cada versión: requirements.txt (`==`) para
Django y sus paquetes, frontend/package.json para Angular, .nvmrc y NODE_VERSION del CI para Node y docker-compose.yml
para PostgreSQL. Así el documento no envejece en silencio.

Cada comprobación es una función pura sobre el texto. Los controles negativos mutan una copia del documento real y
exigen que la comprobación proteste.
"""

import json
import re
from pathlib import Path

import pytest

pytestmark = [pytest.mark.req("DJA-9", "LS-20"), pytest.mark.security]

ROOT = Path(__file__).resolve().parents[3]  # raíz del repositorio
DOC = "docs/operacion/parches.md"

VIGILADOS = {
    "django", "djangorestframework", "djangorestframework-simplejwt", "cryptography", "bcrypt",
    "google-auth", "gunicorn", "whitenoise", "@angular/core", "node", "postgresql",
}
REQUISITO = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?==([^\s;]+)$")
FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _normal(nombre):
    """Nombre de paquete sin comillas ni separadores distintos (PEP 503 para Python)."""
    return re.sub(r"[-_.]+", "-", nombre.strip().strip("`")).lower()


def filas_de_versiones(texto):
    """{paquete: {version, fecha}} de la sección «Versiones vigiladas», cuya tabla tiene seis columnas."""
    partes = texto.split("## Versiones vigiladas", 1)
    assert len(partes) == 2, "falta la sección «Versiones vigiladas»"
    filas = {}
    for linea in partes[1].split("\n## ", 1)[0].splitlines():
        if not linea.startswith("|"):
            continue
        celdas = [celda.strip() for celda in linea.strip().strip("|").split("|")]
        if len(celdas) != 6 or celdas[0] == "Paquete" or set(celdas[0]) <= set("-:"):
            continue
        filas[_normal(celdas[0])] = {"version": celdas[1].strip("`"), "fecha": celdas[5]}
    return filas


def requisitos(texto):
    """{paquete: versión} de las líneas `nombre==versión` de un requirements.txt."""
    versiones = {}
    for linea in texto.splitlines():
        coincidencia = REQUISITO.match(linea.split("#", 1)[0].strip())
        if coincidencia:
            versiones[_normal(coincidencia.group(1))] = coincidencia.group(3)
    return versiones


def versiones_de_los_archivos(archivos):
    """{paquete: [(origen, versión), ...]}: la versión que dice cada archivo que fija el proyecto."""
    reales = {
        paquete: [("backend_django/requirements.txt", version)]
        for paquete, version in requisitos(archivos["requirements"]).items()
    }
    npm = json.loads(archivos["package_json"])
    dependencias = {**npm.get("dependencies", {}), **npm.get("devDependencies", {})}
    if "@angular/core" in dependencias:
        reales["@angular/core"] = [("frontend/package.json", dependencias["@angular/core"].lstrip("^~"))]
    nodo = re.search(r"NODE_VERSION:\s*'([^']+)'", archivos["ci"])
    reales["node"] = [
        (".nvmrc", archivos["nvmrc"].strip()),
        (".github/workflows/ci.yml (NODE_VERSION)", nodo.group(1) if nodo else ""),
    ]
    imagen = re.search(r"image:\s*postgres:(\d+)", archivos["compose"])
    reales["postgresql"] = [("docker-compose.yml", imagen.group(1) if imagen else "")]
    return reales


def discrepancias(filas, reales):
    """Problemas entre la tabla y los archivos: una fila que falta, un paquete sin fuente o una versión distinta."""
    problemas = []
    for paquete in sorted(VIGILADOS):
        if paquete not in filas:
            problemas.append(f"{paquete}: falta su fila en la tabla")
        elif paquete not in reales:
            problemas.append(f"{paquete}: ningún archivo del repositorio lo fija")
        else:
            for origen, version in reales[paquete]:
                if version != filas[paquete]["version"]:
                    problemas.append(f"{paquete}: la tabla dice {filas[paquete]['version']} y {origen} tiene {version}")
    return problemas


def _leer(ruta):
    return (ROOT / ruta).read_text(encoding="utf-8")


def _archivos():
    return {
        "requirements": _leer("backend_django/requirements.txt"),
        "package_json": _leer("frontend/package.json"),
        "nvmrc": _leer(".nvmrc"),
        "ci": _leer(".github/workflows/ci.yml"),
        "compose": _leer("docker-compose.yml"),
    }


def _mutar(texto, antes, despues=""):
    """Copia mutada del texto. Si la mutación no cambia nada, el control no protege nada: se avisa."""
    nuevo = texto.replace(antes, despues, 1)
    assert nuevo != texto, f"la mutación no cambia el documento ({antes!r}): el control no protege nada"
    return nuevo


# --- Documento real -------------------------------------------------------------------------------------------------


def test_la_tabla_de_versiones_coincide_con_los_archivos_del_proyecto():
    assert discrepancias(filas_de_versiones(_leer(DOC)), versiones_de_los_archivos(_archivos())) == []


def test_cada_fila_de_la_tabla_lleva_su_fecha_de_revision():
    filas = filas_de_versiones(_leer(DOC))
    assert filas and all(FECHA.match(fila["fecha"]) for fila in filas.values())


def test_el_documento_trae_lo_que_pide_el_plan():
    texto = _leer(DOC).lower()
    for requerido in (
        "## django 6.1.3", "2026-11-03", "npm run test:backend", "npm run verify:seguridad",
        "## node 24 → 26", "2026-10-28", "node_version", ".nvmrc", "engines",
        "quien despliega", "psicología no interviene", "ninguna dependencia nueva sin motivo y licencia",
    ):
        assert requerido in texto, requerido


# --- Controles negativos: la comprobación debe protestar ante cada mutación -----------------------------------------


def test_control_negativo_una_version_cambiada_se_detecta():
    texto = _mutar(_leer(DOC), "| 6.1.2 |", "| 6.1.9 |")
    problemas = discrepancias(filas_de_versiones(texto), versiones_de_los_archivos(_archivos()))
    assert "django: la tabla dice 6.1.9 y backend_django/requirements.txt tiene 6.1.2" in problemas


def test_control_negativo_una_fila_que_falta_se_detecta():
    sin_bcrypt = "\n".join(linea for linea in _leer(DOC).splitlines() if not linea.startswith("| `bcrypt`"))
    problemas = discrepancias(filas_de_versiones(sin_bcrypt), versiones_de_los_archivos(_archivos()))
    assert "bcrypt: falta su fila en la tabla" in problemas


def test_control_negativo_node_distinto_de_nvmrc_se_detecta():
    archivos = _archivos()
    archivos["nvmrc"] = "26\n"
    problemas = discrepancias(filas_de_versiones(_leer(DOC)), versiones_de_los_archivos(archivos))
    assert "node: la tabla dice 24 y .nvmrc tiene 26" in problemas
