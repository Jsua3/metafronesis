"""PYP-3 · El id del intento es un UUID v7 (ordenado en el tiempo) cuando el intérprete lo trae."""

import uuid

import pytest

from apps.simulation.models import SimulationAttempt
from apps.simulation.models.attempt import new_attempt_id

pytestmark = pytest.mark.req("PYP-3")


@pytest.mark.skipif(
    not hasattr(uuid, "uuid7"), reason="uuid.uuid7 llega con Python 3.14"
)
def test_el_id_es_uuid7_y_crece_con_el_tiempo():
    ids = [new_attempt_id() for _ in range(50)]

    assert {i.version for i in ids} == {7}
    assert ids == sorted(ids)


def test_sin_uuid7_se_cae_a_uuid4(monkeypatch):
    monkeypatch.delattr(uuid, "uuid7", raising=False)

    assert new_attempt_id().version == 4


def test_el_modelo_usa_esa_funcion_como_valor_por_defecto():
    assert SimulationAttempt._meta.get_field("id").default is new_attempt_id
