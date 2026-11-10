"""La guía de la compuerta «antes de la primera cuenta real» nombra exactamente los pasos que corre el script (S7-4).

El script (scripts/gate-primera-cuenta-support.mjs) define cada paso con `id: '…'`; la guía (docs/seguridad/…) lo nombra en
la última columna de su tabla. Si uno de los dos cambia y el otro no, quien despliega lee una guía que no describe lo que
corre: esta prueba lo impide.
"""
import re
from pathlib import Path

import pytest

pytestmark = [pytest.mark.req("RNF-02", "RNF-01", "D-5", "LS-4"), pytest.mark.security]

RAIZ = Path(__file__).resolve().parents[3]
SOPORTE = RAIZ / "scripts" / "gate-primera-cuenta-support.mjs"
GUIA = RAIZ / "docs" / "seguridad" / "compuerta-primera-cuenta.md"

PATRON_ID_DEL_SCRIPT = re.compile(r"\bid: '([a-z0-9-]+)'")
FILA_DE_LA_TABLA = re.compile(r"^\|\s*(\d+|extra)\s*\|")
ID_EN_COMILLAS = re.compile(r"`([a-z0-9-]+)`")


def ids_del_script(texto):
    return PATRON_ID_DEL_SCRIPT.findall(texto)


def ids_de_la_guia(texto):
    """Los ids de la columna «Paso» (la última) de cada fila de la tabla: sus filas tienen seis columnas."""
    ids = []
    for linea in texto.splitlines():
        celdas = linea.split("|")
        if len(celdas) == 8 and FILA_DE_LA_TABLA.match(linea):
            ids += ID_EN_COMILLAS.findall(celdas[-2])
    return ids


def filas_de_la_guia(texto):
    return [linea for linea in texto.splitlines() if len(linea.split("|")) == 8 and FILA_DE_LA_TABLA.match(linea)]


def comparar(ids_script, ids_guia):
    """Diferencias: ids que la guía no nombra, ids que nombra sin existir en el script, y ids repetidos en la tabla."""
    faltan = sorted(set(ids_script) - set(ids_guia))
    sobran = sorted(set(ids_guia) - set(ids_script))
    repetidos = sorted({un_id for un_id in ids_guia if ids_guia.count(un_id) > 1})
    return faltan, sobran, repetidos


def test_la_guia_nombra_exactamente_los_pasos_del_script():
    ids_script = ids_del_script(SOPORTE.read_text(encoding="utf-8"))
    ids_guia = ids_de_la_guia(GUIA.read_text(encoding="utf-8"))
    assert ids_script, "el script no define ningún paso con id"
    assert ids_guia, "la guía no tiene la tabla de pasos"
    faltan, sobran, repetidos = comparar(ids_script, ids_guia)
    assert faltan == [], f"la guía no nombra estos pasos: {faltan}"
    assert sobran == [], f"la guía nombra pasos que el script no define: {sobran}"
    assert repetidos == [], f"la guía repite estos pasos en su tabla: {repetidos}"


def test_la_tabla_tiene_las_27_filas_del_plan_y_las_dos_filas_extra():
    """Las 27 del plan y dos extra: los derechos del titular (S3-4, manual) y la salud (automática)."""
    filas = filas_de_la_guia(GUIA.read_text(encoding="utf-8"))
    assert len(filas) == 29
    assert sum(1 for fila in filas if fila.split("|")[1].strip() == "extra") == 2


# Los controles negativos comparan contra la guía real (la línea base) y miran solo lo que cambian: así no dependen de
# que la guía esté bien en ese momento, y el control sigue mostrando la diferencia que provoca.

def test_control_negativo_detecta_un_paso_que_la_guia_no_nombra():
    ids_script = ids_del_script(SOPORTE.read_text(encoding="utf-8"))
    base = GUIA.read_text(encoding="utf-8")
    faltan_base, _, _ = comparar(ids_script, ids_de_la_guia(base))
    guia_sin_salud = "\n".join(linea for linea in base.splitlines() if "`salud`" not in linea)
    faltan, _, _ = comparar(ids_script, ids_de_la_guia(guia_sin_salud))
    assert set(faltan) - set(faltan_base) == {"salud"}


def test_control_negativo_detecta_un_paso_inventado_en_la_guia():
    ids_script = ids_del_script(SOPORTE.read_text(encoding="utf-8"))
    base = GUIA.read_text(encoding="utf-8")
    _, sobran_base, _ = comparar(ids_script, ids_de_la_guia(base))
    guia = base + "\n| extra | prueba | automática | script | C0 | `paso-inventado` |\n"
    _, sobran, _ = comparar(ids_script, ids_de_la_guia(guia))
    assert set(sobran) - set(sobran_base) == {"paso-inventado"}


def test_control_negativo_detecta_un_id_repetido_en_la_tabla():
    ids_script = ids_del_script(SOPORTE.read_text(encoding="utf-8"))
    base = GUIA.read_text(encoding="utf-8")
    _, _, repetidos_base = comparar(ids_script, ids_de_la_guia(base))
    guia = base + "\n| extra | repetida | automática | script | C11 | `salud` |\n"
    _, _, repetidos = comparar(ids_script, ids_de_la_guia(guia))
    assert set(repetidos) - set(repetidos_base) == {"salud"}


@pytest.mark.parametrize("texto", ["", "sin tabla ni pasos"])
def test_sin_tabla_no_hay_ids_que_comparar(texto):
    assert ids_de_la_guia(texto) == []
    assert ids_del_script(texto) == []


# --- S7-2 · lo que la guía dice de --strict, de la limitación de la IP y del entorno de los procesos hijos -------------

PREFIJOS_DEL_SCRIPT = re.compile(r"PREFIJOS_DE_PRODUCCION = Object\.freeze\(\[([^\]]*)\]\)")
NOMBRES_DEL_SCRIPT = re.compile(r"NOMBRES_DE_PRODUCCION = Object\.freeze\(\[([^\]]*)\]\)")
VALOR_EN_COMILLAS = re.compile(r"'([A-Z_]+)'")


def seccion_como_correrla(texto):
    """El texto de «Cómo correrla», hasta la siguiente sección."""
    return texto.split("## Cómo correrla", 1)[1].split("\n## ", 1)[0]


def problemas_de_strict(texto):
    """La guía documenta --strict, el código 3 y la recomendación de usarlo cuando el informe va al PR de despliegue."""
    seccion = seccion_como_correrla(texto)
    problemas = []
    if "`--strict`" not in seccion:
        problemas.append("«Cómo correrla» no documenta --strict")
    if "código 3" not in seccion:
        problemas.append("«Cómo correrla» no dice que --strict hace salir con el código 3")
    if "PR de despliegue" not in seccion or "corre con `--strict`" not in seccion:
        problemas.append("«Cómo correrla» no recomienda --strict cuando el informe va al PR de despliegue")
    return problemas


def problemas_de_la_fila_3(texto):
    """La fila 3 dice que la compuerta no detecta un SIEP_TRUSTED_PROXIES de menos y que la medición de S1-1 es manual."""
    fila = next((linea for linea in filas_de_la_guia(texto) if linea.split("|")[1].strip() == "3"), None)
    if fila is None:
        return ["la guía no tiene la fila 3"]
    problemas = []
    if "no puede saber cuál es la IP verdadera del cliente" not in fila:
        problemas.append("la fila 3 no dice que la compuerta no puede saber cuál es la IP verdadera")
    if "`SIEP_TRUSTED_PROXIES` de MENOS" not in fila:
        problemas.append("la fila 3 no dice que no detecta un SIEP_TRUSTED_PROXIES de MENOS")
    if "S1-1" not in fila or "manual" not in fila:
        problemas.append("la fila 3 no dice que la medición del primer despliegue (S1-1) sigue siendo manual")
    return problemas


def variables_que_el_script_quita(texto_del_script):
    """(prefijos, nombres) de producción que entornoSinSecretos quita de lo que reciben los procesos hijos."""
    prefijos = PREFIJOS_DEL_SCRIPT.search(texto_del_script)
    nombres = NOMBRES_DEL_SCRIPT.search(texto_del_script)
    assert prefijos and nombres, "el script ya no define PREFIJOS_DE_PRODUCCION y NOMBRES_DE_PRODUCCION"
    return VALOR_EN_COMILLAS.findall(prefijos.group(1)), VALOR_EN_COMILLAS.findall(nombres.group(1))


def variables_sin_documentar(texto_del_script, guia):
    """Las variables que el script quita a los hijos y «Cómo correrla» no nombra (los prefijos van como `PREFIJO_*`)."""
    seccion = seccion_como_correrla(guia)
    prefijos, nombres = variables_que_el_script_quita(texto_del_script)
    faltan = [f"`{prefijo}*`" for prefijo in prefijos if f"`{prefijo}*`" not in seccion]
    faltan += [f"`{nombre}`" for nombre in nombres if f"`{nombre}`" not in seccion]
    return faltan


def test_la_guia_documenta_strict_y_su_codigo_de_salida():
    assert problemas_de_strict(GUIA.read_text(encoding="utf-8")) == []


def test_control_negativo_una_guia_sin_strict_o_sin_el_codigo_3_se_detecta():
    base = GUIA.read_text(encoding="utf-8")
    assert problemas_de_strict(base) == []
    sin_bandera = base.replace("`--strict`", "`--otra`")
    assert any("no documenta --strict" in problema for problema in problemas_de_strict(sin_bandera))
    sin_codigo = base.replace("código 3", "código tres")
    assert any("código 3" in problema for problema in problemas_de_strict(sin_codigo))
    sin_recomendacion = base.replace("corre con `--strict`", "corre con `--otra`")
    assert any("recomienda" in problema for problema in problemas_de_strict(sin_recomendacion))


def test_la_fila_3_de_la_guia_dice_la_limitacion_de_la_ip_de_confianza():
    assert problemas_de_la_fila_3(GUIA.read_text(encoding="utf-8")) == []


def test_control_negativo_una_fila_3_sin_la_limitacion_se_detecta():
    base = GUIA.read_text(encoding="utf-8")
    sin_ip = base.replace("no puede saber cuál es la IP verdadera del cliente", "mide la IP")
    assert any("IP verdadera" in problema for problema in problemas_de_la_fila_3(sin_ip))
    sin_menos = base.replace("`SIEP_TRUSTED_PROXIES` de MENOS", "`SIEP_TRUSTED_PROXIES`")
    assert any("de MENOS" in problema for problema in problemas_de_la_fila_3(sin_menos))
    sin_manual = base.replace("sigue siendo manual", "queda hecha")
    assert any("manual" in problema for problema in problemas_de_la_fila_3(sin_manual))


def test_la_guia_nombra_las_variables_que_el_script_quita_a_los_procesos_hijos():
    faltan = variables_sin_documentar(SOPORTE.read_text(encoding="utf-8"), GUIA.read_text(encoding="utf-8"))
    assert faltan == [], f"«Cómo correrla» no nombra estas variables que el script quita a los hijos: {faltan}"


def test_control_negativo_una_variable_nueva_en_el_script_sin_documentar_se_detecta():
    script = SOPORTE.read_text(encoding="utf-8")
    guia = GUIA.read_text(encoding="utf-8")
    assert variables_sin_documentar(script, guia) == []
    con_prefijo_nuevo = script.replace("'RAILWAY_']);", "'RAILWAY_', 'NUEVA_']);", 1)
    assert con_prefijo_nuevo != script, "la mutación no cambia el script: el control no protege nada"
    assert variables_sin_documentar(con_prefijo_nuevo, guia) == ["`NUEVA_*`"]
    con_nombre_nuevo = script.replace("  'SIEP_ALLOWED_ASSET_HOSTS',\n]);", "  'SIEP_ALLOWED_ASSET_HOSTS',\n  'NUEVO_NOMBRE',\n]);", 1)
    assert con_nombre_nuevo != script, "la mutación no cambia el script: el control no protege nada"
    assert variables_sin_documentar(con_nombre_nuevo, guia) == ["`NUEVO_NOMBRE`"]
