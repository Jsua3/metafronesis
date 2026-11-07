"""S3-4 · La compuerta de cobertura de los derechos del titular (RNF-003).

``apps/privacy/data_subject.py`` dice DE QUIÉN es cada dato (``PERSON_SCOPE``) y QUÉ se hace con él al suprimir a una persona
(``ERASURE_RULES``). ``validar_cobertura()`` es la compuerta: toda columna personal, sensible o secreta de una tabla con dueño
tiene su regla, toda tabla con datos de personas tiene dueño o una exclusión con motivo, y no queda ninguna regla obsoleta ni
mal formada. Una columna nueva del inventario (la analítica de E6 entra por aquí) obliga a decidir qué se hace con ella.

Cada control lleva su control negativo: una copia del inventario o de las reglas con el defecto inyectado y la compuerta lo nombra.
"""
import copy

import pytest

from apps.privacy import data_subject, inventory
from apps.privacy.data_subject import (
    ACCIONES,
    ANULAR,
    BORRAR_FILA,
    CONSERVAR,
    ERASURE_RULES,
    LIMPIAR_JSON,
    PERSON_SCOPE,
    SEUDONIMIZAR,
    SIN_DUENO,
    VACIAR,
    Pertenencia,
    Regla,
    validar_cobertura,
)
from apps.privacy.inventory import CON_SALIDAS, PERSONAL, SENSITIVE

pytestmark = [pytest.mark.req("RNF-003"), pytest.mark.security]


def _columnas_con_datos():
    """(tabla, columna, clase) de cada columna personal, sensible o secreta del inventario REAL, leídas aparte de la compuerta."""
    encontradas = []
    for tabla, columna in inventory.columnas_reales():
        clase = inventory.classify(tabla, columna)
        if clase in CON_SALIDAS:
            encontradas.append((tabla, columna, clase))
    return encontradas


# ── La compuerta, con el inventario real ─────────────────────────────────────────────────────────────────────────


def test_la_cobertura_esta_completa_hoy():
    assert validar_cobertura() == []


def test_hay_columnas_con_datos_de_personas_y_todas_las_de_una_tabla_con_dueno_tienen_regla():
    """Se recorre el inventario por otro camino: si ``validar_cobertura`` quedara vacía por un error, esto lo delata."""
    columnas = _columnas_con_datos()
    assert len(columnas) > 50, "el inventario debe traer muchas columnas personales, sensibles o secretas"

    sin_regla = [
        f"{tabla}.{columna}" for tabla, columna, _ in columnas if tabla in PERSON_SCOPE and (tabla, columna) not in ERASURE_RULES
    ]
    assert sin_regla == []


def test_toda_tabla_con_datos_de_personas_tiene_dueno_o_una_exclusion_con_motivo():
    tablas = {tabla for tabla, _, _ in _columnas_con_datos()}

    assert tablas
    for tabla in tablas:
        assert tabla in PERSON_SCOPE or tabla in SIN_DUENO, f"{tabla} tiene datos de personas y nadie es su dueño"


def test_las_exclusiones_llevan_motivo_y_no_chocan_con_el_alcance():
    for tabla, motivo in SIN_DUENO.items():
        assert motivo.strip(), tabla
        assert tabla not in PERSON_SCOPE, tabla
        assert tabla in inventory.DATA_INVENTORY, tabla


def test_toda_regla_tiene_una_accion_conocida_y_un_motivo():
    for clave, regla in ERASURE_RULES.items():
        assert regla.accion in ACCIONES, clave
        assert regla.motivo.strip(), clave


def test_las_reglas_por_defecto_del_encargo_estan_donde_deben():
    """Las decisiones que no se negocian: la cuenta se seudonimiza, las reflexiones se borran y la auditoría solo pierde IP y agente."""
    reglas = {clave: regla.accion for clave, regla in ERASURE_RULES.items()}

    for columna in ("email", "nombre", "apellido", "password_hash"):
        assert reglas[("users", columna)] == SEUDONIMIZAR, columna
    for columna in ("email", "nombre", "apellido"):
        assert reglas[("access_requests", columna)] == SEUDONIMIZAR, columna
    assert reglas[("reflection_journals", "encrypted_text")] == BORRAR_FILA
    assert reglas[("audit_logs", "ip_address")] == ANULAR
    assert reglas[("audit_logs", "user_agent")] == ANULAR
    assert reglas[("audit_logs", "actor_id")] == CONSERVAR
    assert reglas[("audit_logs", "resource_id")] == CONSERVAR
    assert reglas[("consent_records", "person_id")] == CONSERVAR
    assert reglas[("consent_records", "accepted_at")] == CONSERVAR


def test_los_intentos_los_eventos_y_las_decisiones_se_conservan_como_agregados():
    for tabla in ("simulation_attempts_v2", "attempt_events", "attempt_hint_views", "attempt_reports", "attempt_world_states"):
        columnas = [columna for (t, columna), regla in ERASURE_RULES.items() if t == tabla and regla.accion == CONSERVAR]
        assert columnas, tabla


# ── Controles negativos: cada defecto inyectado en una copia lo ve la compuerta ──────────────────────────────────


def test_control_negativo_una_columna_nueva_del_inventario_sin_regla_se_nombra():
    copia = copy.deepcopy(inventory.DATA_INVENTORY)
    copia["users"]["columns"]["columna_nueva_de_e6"] = (PERSONAL, "columna inventada para la prueba")

    problemas = validar_cobertura(inventario=copia)

    assert any(problema.startswith("users.columna_nueva_de_e6") for problema in problemas), problemas


def test_control_negativo_una_columna_sensible_nueva_en_una_tabla_con_dueno_se_nombra():
    copia = copy.deepcopy(inventory.DATA_INVENTORY)
    copia["attempt_events"]["columns"]["analitica_nueva"] = (SENSITIVE, "columna inventada para la prueba")

    assert any(problema.startswith("attempt_events.analitica_nueva") for problema in validar_cobertura(inventario=copia))


def test_control_negativo_una_tabla_nueva_con_datos_de_personas_y_sin_dueno_se_nombra():
    copia = copy.deepcopy(inventory.DATA_INVENTORY)
    copia["tabla_nueva"] = {
        "purpose": "x", "retention": "x", "default": None,
        "columns": {"correo": (PERSONAL, "inventada"), "tipo": inventory.TECHNICAL},
        "exits": {"correo": []},
    }

    problemas = validar_cobertura(inventario=copia)

    assert any(problema.startswith("tabla_nueva") for problema in problemas), problemas


def test_control_negativo_quitar_la_regla_de_una_columna_la_deja_sin_regla():
    reglas = dict(ERASURE_RULES)
    del reglas[("users", "email")]

    assert any(problema.startswith("users.email") for problema in validar_cobertura(reglas=reglas))


def test_control_negativo_una_regla_de_una_columna_que_ya_no_existe_es_obsoleta():
    reglas = {**ERASURE_RULES, ("users", "columna_que_ya_no_existe"): Regla(CONSERVAR, "ya no hay columna")}

    assert any("users.columna_que_ya_no_existe" in problema and "obsoleta" in problema for problema in validar_cobertura(reglas=reglas))


def test_control_negativo_una_regla_de_una_columna_que_dejo_de_ser_personal_es_obsoleta():
    copia = copy.deepcopy(inventory.DATA_INVENTORY)
    copia["users"]["columns"]["nombre"] = inventory.TECHNICAL

    assert any("users.nombre" in problema and "obsoleta" in problema for problema in validar_cobertura(inventario=copia))


def test_control_negativo_una_exclusion_de_una_tabla_que_no_existe_es_obsoleta():
    sin_dueno = {**SIN_DUENO, "tabla_que_no_existe": "inventada"}

    assert any(problema.startswith("tabla_que_no_existe") for problema in validar_cobertura(sin_dueno=sin_dueno))


def test_control_negativo_una_tabla_a_la_vez_con_dueno_y_excluida_se_nombra():
    sin_dueno = {**SIN_DUENO, "users": "no puede ser las dos cosas"}

    assert any(problema.startswith("users") and "dueño" in problema for problema in validar_cobertura(sin_dueno=sin_dueno))


# ── Reglas mal formadas ──────────────────────────────────────────────────────────────────────────────────────────


def _con_regla(tabla, columna, regla):
    return validar_cobertura(reglas={**ERASURE_RULES, (tabla, columna): regla})


@pytest.mark.parametrize(
    ("tabla", "columna", "regla", "fragmento"),
    [
        ("users", "email", Regla("inventar", "motivo", valor="x"), "acción desconocida"),
        ("users", "email", Regla(SEUDONIMIZAR, "   ", valor="x"), "sin motivo"),
        ("users", "email", Regla(SEUDONIMIZAR, "motivo"), "valor"),
        ("users", "email", Regla(CONSERVAR, "motivo", valor="x"), "valor"),
        ("users", "email", Regla(ANULAR, "motivo"), "no admite NULL"),
        ("users", "id", Regla(VACIAR, "motivo"), "texto"),
        ("audit_logs", "ip_address", Regla(ANULAR, "motivo", roles=("rol_inexistente",)), "rol"),
        ("audit_logs", "context_json", Regla(LIMPIAR_JSON, "motivo"), "función"),
        ("simulation_attempts_v2", "status", Regla(BORRAR_FILA, "motivo"), "borrar_fila"),
    ],
    ids=[
        "accion desconocida", "sin motivo", "seudonimizar sin valor", "conservar con valor", "anular sobre NOT NULL",
        "vaciar un entero", "rol inexistente", "limpiar_json sin funcion", "borrar_fila mezclado con conservar",
    ],
)
def test_control_negativo_una_regla_mal_formada_se_nombra(tabla, columna, regla, fragmento):
    problemas = _con_regla(tabla, columna, regla)

    assert any(problema.startswith(f"{tabla}.{columna}") and fragmento in problema for problema in problemas), problemas


def test_control_negativo_una_columna_de_exportacion_secreta_o_inexistente_se_nombra():
    alcance = dict(PERSON_SCOPE)
    alcance["users"] = (Pertenencia("titular", PERSON_SCOPE["users"][0].filas, solo=("id", "password_hash", "no_existe")),)

    problemas = validar_cobertura(alcance=alcance)

    assert any("users.password_hash" in problema and "secret" in problema.lower() for problema in problemas), problemas
    assert any("users.no_existe" in problema for problema in problemas), problemas


def test_el_modulo_expone_lo_que_el_encargo_pide():
    assert callable(data_subject.validar_cobertura)
    assert isinstance(PERSON_SCOPE, dict) and isinstance(ERASURE_RULES, dict) and isinstance(SIN_DUENO, dict)
