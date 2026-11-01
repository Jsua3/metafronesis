"""S6-2 · CI endurecido: permisos mínimos por trabajo, Dependabot que actualiza las acciones y la nota de CI bloqueado.

Lo que la compuerta de Node no mira: cada trabajo de los flujos declara `permissions: {contents: read}` (el mínimo) y
ningún flujo concede escritura; Dependabot tiene el ecosistema github-actions, semanal, el mismo día que pip y agrupado
en menores y parches; el README y las primeras líneas de ci.yml dicen que, mientras Actions esté bloqueado, la
compuerta es la corrida local. Las acciones fijadas por commit y `persist-credentials: false` las comprueba
`verify:seguridad` (paso actions-pinned, scripts/verify-seguridad.test.mjs), que también corre en `npm run test:scripts`.

Cada comprobación es una función pura sobre el texto. Los controles negativos usan un texto sintético y exigen que la
comprobación proteste ante la mutación.
"""

from pathlib import Path

import pytest
import yaml

pytestmark = [pytest.mark.req("LS-20", "SF-14"), pytest.mark.security]

ROOT = Path(__file__).resolve().parents[3]  # raíz del repositorio

FLUJOS = (".github/workflows/ci.yml", ".github/workflows/e2e-full-case.yml")
PERMISOS_MINIMOS = {"contents": "read"}
NOTA_CI = "Mientras Actions siga bloqueado por facturación"
NOTA_COMPLETA = f"{NOTA_CI}: la compuerta es `npm run verify:estructural` y `npm run verify:seguridad`; «sin CI» en el ledger."

FLUJO_SINTETICO = """permissions:
  contents: read
jobs:
  uno:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - run: echo uno
  dos:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - run: echo dos
"""

DEPENDABOT_SINTETICO = """version: 2
updates:
  - package-ecosystem: pip
    directory: /backend_django
    schedule:
      interval: weekly
      day: monday
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
    groups:
      actions:
        update-types: [minor, patch]
"""


def violaciones_permisos(texto):
    """El flujo no concede más que lectura del repositorio y cada trabajo declara ese mínimo de forma explícita."""
    flujo = yaml.safe_load(texto)
    problemas = []
    if flujo.get("permissions") != PERMISOS_MINIMOS:
        problemas.append(f"el flujo debe declarar permissions: {PERMISOS_MINIMOS} a nivel de flujo")
    for nombre, trabajo in flujo.get("jobs", {}).items():
        permisos = trabajo.get("permissions")
        if permisos is None:
            problemas.append(f"el trabajo {nombre} no declara permissions (el mínimo, contents: read, explícito)")
        elif permisos != PERMISOS_MINIMOS:
            problemas.append(f"el trabajo {nombre} concede {permisos}; el mínimo es {PERMISOS_MINIMOS}")
    return problemas


def violaciones_dependabot(texto):
    """dependabot.yml actualiza las acciones: directorio raíz, semanal, el mismo día que pip y agrupado en menores y parches."""
    updates = yaml.safe_load(texto).get("updates", [])
    por_ecosistema = {update.get("package-ecosystem"): update for update in updates}
    acciones = por_ecosistema.get("github-actions")
    if acciones is None:
        return ["dependabot.yml no tiene el ecosistema github-actions"]
    problemas = []
    if acciones.get("directory") != "/":
        problemas.append("github-actions debe mirar el directorio /")
    schedule = acciones.get("schedule", {})
    if schedule.get("interval") != "weekly":
        problemas.append("github-actions debe ser semanal")
    if schedule.get("day") != por_ecosistema.get("pip", {}).get("schedule", {}).get("day"):
        problemas.append("github-actions debe correr el mismo día que pip")
    grupos = acciones.get("groups", {})
    if not any(set(grupo.get("update-types", [])) == {"minor", "patch"} for grupo in grupos.values()):
        problemas.append("github-actions debe agrupar las actualizaciones menores y de parche")
    return problemas


def violaciones_nota(readme, ci):
    """El README y las primeras diez líneas de ci.yml anotan que, con Actions bloqueado, la compuerta es la local."""
    cabecera = "\n".join(ci.splitlines()[:10])
    problemas = []
    for nombre, texto in (("README.md", readme), (".github/workflows/ci.yml (cabecera)", cabecera)):
        if NOTA_CI not in texto or "npm run verify:seguridad" not in texto or "sin CI" not in texto:
            problemas.append(f"{nombre} no anota que, con Actions bloqueado, la compuerta es la corrida local")
    return problemas


def _leer(ruta):
    return (ROOT / ruta).read_text(encoding="utf-8")


def _mutar(texto, antes, despues=""):
    """Copia mutada del texto. Si la mutación no cambia nada, el control no protege nada: se avisa."""
    nuevo = texto.replace(antes, despues, 1)
    assert nuevo != texto, f"la mutación no cambia el texto ({antes!r}): el control no protege nada"
    return nuevo


# --- Archivos reales -------------------------------------------------------------------------------------------------


def test_cada_trabajo_de_los_flujos_declara_su_minimo_de_permisos():
    for flujo in FLUJOS:
        assert violaciones_permisos(_leer(flujo)) == [], flujo


def test_dependabot_actualiza_las_acciones_como_los_demas_ecosistemas():
    assert violaciones_dependabot(_leer(".github/dependabot.yml")) == []


def test_la_nota_de_ci_bloqueado_esta_en_el_readme_y_al_principio_de_ci():
    assert violaciones_nota(_leer("README.md"), _leer(".github/workflows/ci.yml")) == []


# --- Controles negativos: cada comprobación debe protestar ante su mutación ------------------------------------------


def test_el_flujo_sintetico_sin_mutar_pasa():
    assert violaciones_permisos(FLUJO_SINTETICO) == []


def test_control_negativo_un_trabajo_sin_permissions():
    mutado = _mutar(
        FLUJO_SINTETICO,
        "  dos:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n",
        "  dos:\n    runs-on: ubuntu-latest\n",
    )
    assert any("dos" in problema and "no declara" in problema for problema in violaciones_permisos(mutado))


def test_control_negativo_un_trabajo_que_concede_escritura():
    mutado = _mutar(FLUJO_SINTETICO, "      contents: read\n    steps:\n      - run: echo uno",
                    "      contents: write\n    steps:\n      - run: echo uno")
    assert any("uno" in problema and "concede" in problema for problema in violaciones_permisos(mutado))


def test_control_negativo_dependabot_sin_github_actions():
    assert violaciones_dependabot(DEPENDABOT_SINTETICO) == []
    mutado = _mutar(DEPENDABOT_SINTETICO, "  - package-ecosystem: github-actions\n", "  - package-ecosystem: docker\n")
    assert violaciones_dependabot(mutado)


def test_control_negativo_dependabot_sin_agrupar_menores_y_parches():
    mutado = _mutar(DEPENDABOT_SINTETICO, "update-types: [minor, patch]", "update-types: [major]")
    assert violaciones_dependabot(mutado)


def test_control_negativo_un_readme_sin_la_nota_de_ci_bloqueado():
    problemas = violaciones_nota("Un README sin nota de CI.", f"# {NOTA_COMPLETA}\nname: CI\n")
    assert len(problemas) == 1 and problemas[0].startswith("README.md")


def test_control_negativo_la_nota_de_ci_lejos_del_principio_no_cuenta():
    ci_con_nota_abajo = "\n".join(["name: CI"] * 10 + [f"# {NOTA_COMPLETA}"])
    problemas = violaciones_nota(f"{NOTA_COMPLETA}\n", ci_con_nota_abajo)
    assert len(problemas) == 1 and "ci.yml" in problemas[0]
