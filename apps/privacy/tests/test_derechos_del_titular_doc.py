"""S3-4 · El documento ``docs/seguridad/derechos-del-titular.md`` solo cita lo que existe y dice lo mismo que el código (RNF-003).

Para quien opera la plataforma y NO programa. Esta prueba comprueba, con la técnica de ``apps/security/tests/test_runbook_incidentes.py``,
que cada comando, variable, etiqueta de auditoría, ruta y archivo que cita existe; que cita los tres comandos y el plazo de las
solicitudes; que no trae correos ni valores con pinta de llave; y que la tabla «qué pasa con cada tabla» coincide con
``data_subject.ERASURE_RULES``: si una regla cambia y el documento no, la prueba lo dice y muestra la fila que falta.

Control negativo: una copia del documento con un comando, una variable o una etiqueta inventados se marca; y una regla cambiada
descuadra la tabla.
"""
import re
from pathlib import Path

import pytest

from apps.privacy import data_subject
from apps.privacy.data_subject import ANULAR, BORRAR_FILA, CONSERVAR, LIMPIAR_JSON, SEUDONIMIZAR, VACIAR, Regla
from apps.security.tests.test_runbook_incidentes import _COMANDO, _problemas

pytestmark = [pytest.mark.req("RNF-003"), pytest.mark.security]

RAIZ = Path(__file__).resolve().parents[4]
DOCUMENTO = RAIZ / "docs" / "seguridad" / "derechos-del-titular.md"
COMANDOS = ("export_personal_data", "erase_personal_data", "purge_expired_data")
SECCIONES = (
    "Qué hay", "Antes de empezar", "Exportar", "Suprimir", "Qué pasa con cada tabla", "Depurar lo vencido",
    "Lo que decide la institución", "Lo que este procedimiento no cubre", "Ensayo",
)

#: Cada acción, dicha como la dice el documento (en este orden).
PALABRAS = (
    (SEUDONIMIZAR, "se reemplaza por un valor que no identifica a nadie"),
    (VACIAR, "se vacía"),
    (ANULAR, "se anula"),
    (LIMPIAR_JSON, "se limpia el texto escrito por la persona"),
    (BORRAR_FILA, "se borra la fila"),
)


def _al_suprimir_esperado(tabla, reglas=None):
    """Lo que el documento debe decir de ``tabla`` según las reglas."""
    reglas = data_subject.ERASURE_RULES if reglas is None else reglas
    acciones = {regla.accion for (nombre, _), regla in reglas.items() if nombre == tabla}
    verbos = [palabra for accion, palabra in PALABRAS if accion in acciones]
    if not verbos:
        return "se conserva"
    return " y ".join(verbos) + ("; el resto se conserva" if CONSERVAR in acciones else "")


def _filas_de_la_tabla(texto):
    """``{tabla: lo que dice el documento que pasa al suprimir}`` de la tabla de la sección «Qué pasa con cada tabla»."""
    encontradas = {}
    en_la_seccion = False
    for linea in texto.splitlines():
        if linea.startswith("#"):
            en_la_seccion = "Qué pasa con cada tabla" in linea
            continue
        if en_la_seccion and linea.startswith("| `"):
            celdas = [celda.strip() for celda in linea.strip().strip("|").split("|")]
            encontradas[celdas[0].strip("`")] = celdas[-1]
    return encontradas


# ── El documento solo cita lo que existe ─────────────────────────────────────────────────────────────────────────


def test_el_documento_solo_cita_comandos_variables_etiquetas_rutas_y_archivos_que_existen():
    texto = DOCUMENTO.read_text(encoding="utf-8")

    assert _problemas(texto) == [], "el documento cita algo que no existe en el código"


def test_cita_los_tres_comandos_con_un_ejemplo_que_no_trae_valores_reales():
    texto = DOCUMENTO.read_text(encoding="utf-8")

    assert set(COMANDOS) <= set(_COMANDO.findall(texto))
    for comando in COMANDOS:
        assert re.search(rf"manage\.py {comando} .*--executed-by CORREO_DEL_ADMIN", texto), comando
    assert "--email CORREO" in texto and "--dry-run" in texto and "--confirm" in texto and "--out" in texto


def test_cita_la_variable_del_plazo_de_las_solicitudes_y_las_tres_etiquetas_de_auditoria():
    texto = DOCUMENTO.read_text(encoding="utf-8")

    assert "`SIEP_RETENTION_ACCESS_REQUEST_DAYS`" in texto
    for etiqueta in ("datos.exportar", "datos.suprimir", "datos.depurar"):
        assert f"`{etiqueta}`" in texto, etiqueta


def test_dice_que_es_un_borrador_y_que_no_es_asesoria_juridica():
    texto = DOCUMENTO.read_text(encoding="utf-8")

    assert texto.lstrip().startswith("<!-- BORRADOR")
    assert "no es asesoría jurídica" in texto.lower()


def test_lista_las_decisiones_de_la_institucion():
    texto = DOCUMENTO.read_text(encoding="utf-8").lower()

    for decision in (
        "verifica la identidad", "plazos de respuesta", "plazos de retención", "evaluaciones docentes", "sd-9",
    ):
        assert decision in texto, decision


def test_tiene_sus_secciones_y_no_trae_datos_reales():
    texto = DOCUMENTO.read_text(encoding="utf-8")

    for seccion in SECCIONES:
        assert re.search(rf"^#+ .*{re.escape(seccion)}", texto, re.MULTILINE), f"falta la sección «{seccion}»"
    assert re.findall(r"[\w.+-]+@[\w-]+\.[\w.-]+", texto) == [], "el documento no lleva correos reales"
    assert re.search(r"[A-Za-z0-9_\-]{40,}", texto) is None, "ningún valor con pinta de llave o de token"


def test_esta_enlazado_desde_el_readme_y_desde_el_runbook_de_incidentes():
    assert "docs/seguridad/derechos-del-titular.md" in (RAIZ / "README.md").read_text(encoding="utf-8")
    assert "docs/seguridad/derechos-del-titular.md" in (RAIZ / "docs" / "seguridad" / "incidentes.md").read_text(encoding="utf-8")


# ── La tabla coincide con las reglas ─────────────────────────────────────────────────────────────────────────────


def _descuadres(texto, reglas=None):
    en_el_documento = _filas_de_la_tabla(texto)
    problemas = [f"falta la tabla {tabla}" for tabla in data_subject.PERSON_SCOPE if tabla not in en_el_documento]
    problemas += [f"sobra la tabla {tabla}" for tabla in en_el_documento if tabla not in data_subject.PERSON_SCOPE]
    for tabla in data_subject.PERSON_SCOPE:
        esperado = _al_suprimir_esperado(tabla, reglas)
        if tabla in en_el_documento and en_el_documento[tabla] != esperado:
            problemas.append(f"{tabla}: el documento dice «{en_el_documento[tabla]}» y las reglas dicen «{esperado}»")
    return problemas


def test_la_tabla_de_que_pasa_con_cada_tabla_coincide_con_las_reglas():
    assert _descuadres(DOCUMENTO.read_text(encoding="utf-8")) == []


# ── Controles negativos ──────────────────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("linea", "esperado"),
    [
        ("python manage.py comando_inventado_derechos", "comando: comando_inventado_derechos"),
        ("`SIEP_PLAZO_INVENTADO=30`", "variable: SIEP_PLAZO_INVENTADO"),
        ("`datos.inventar`", "etiqueta: datos.inventar"),
        ("`docs/seguridad/no-existe.md`", "archivo: docs/seguridad/no-existe.md"),
    ],
)
def test_control_negativo_un_nombre_inventado_se_marca(linea, esperado):
    texto = DOCUMENTO.read_text(encoding="utf-8") + f"\n\n{linea}\n"

    assert esperado in _problemas(texto)


def test_control_negativo_una_regla_cambiada_descuadra_la_tabla():
    texto = DOCUMENTO.read_text(encoding="utf-8")
    reglas = dict(data_subject.ERASURE_RULES)
    reglas[("reflection_journals", "encrypted_text")] = Regla(CONSERVAR, "regla cambiada por la prueba")
    reglas[("reflection_journals", "attempt_id")] = Regla(CONSERVAR, "regla cambiada por la prueba")

    descuadres = _descuadres(texto, reglas)

    assert any(problema.startswith("reflection_journals:") for problema in descuadres), descuadres


def test_control_negativo_una_tabla_que_falta_en_el_documento_se_marca():
    texto = DOCUMENTO.read_text(encoding="utf-8")
    sin_la_fila = "\n".join(linea for linea in texto.splitlines() if not linea.startswith("| `consent_records`"))

    assert "falta la tabla consent_records" in _descuadres(sin_la_fila)
