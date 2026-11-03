"""S3-2a · ``consent_records`` en el inventario de datos (S3-1): quién es la persona y cuándo aceptó es dato personal.

La cobertura general la comprueba ``test_inventory_coverage``; aquí se fijan las decisiones propias de esta tabla.
"""
import pytest

from apps.privacy import inventory
from apps.privacy.inventory import PERSONAL, TECHNICAL, classify, salidas

pytestmark = [pytest.mark.req("ETH-01", "SIEP-RF-05", "RNF-010"), pytest.mark.security]

TABLA = "consent_records"


@pytest.mark.parametrize("columna", ["person_id", "accepted_at"])
def test_la_persona_y_la_fecha_de_aceptacion_son_datos_personales(columna):
    assert classify(TABLA, columna) == PERSONAL
    assert inventory.motivo(TABLA, columna).strip()


@pytest.mark.parametrize("columna", ["id", "consent_type", "case_version_id", "notice_version", "withdrawn_at"])
def test_el_resto_de_la_tabla_es_tecnico(columna):
    assert classify(TABLA, columna) == TECHNICAL


def test_la_persona_no_sale_por_ningun_canal_y_la_fecha_sale_por_la_api():
    assert salidas(TABLA, "person_id") == []
    assert salidas(TABLA, "accepted_at") == ["api"]


def test_la_finalidad_y_el_plazo_estan_declarados():
    entrada = inventory.DATA_INVENTORY[TABLA]

    assert "ETH-01" in entrada["purpose"]
    assert "sin plazo definido" in entrada["retention"].lower() and "SD-9" in entrada["retention"]
