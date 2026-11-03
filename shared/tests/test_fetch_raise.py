import pytest
from django.core.exceptions import FieldFetchBlocked
from django.db.models import FETCH_ONE

from apps.simulation.models import CaseVersion, SimulationCase
from shared.testing import assert_queries_at_most, fetch_mode_raise

pytestmark = [pytest.mark.django_db, pytest.mark.req("DJA-7")]


def test_un_acceso_perezoso_dentro_del_bloque_lanza():
    with fetch_mode_raise():
        version = CaseVersion.objects.first()
        with pytest.raises(FieldFetchBlocked):
            version.simulation_case  # noqa: B018  (FK cargada de forma perezosa)


def test_con_select_related_no_lanza():
    with fetch_mode_raise():
        version = CaseVersion.objects.select_related("simulation_case").first()
        assert isinstance(version.simulation_case, SimulationCase)


def test_fuera_del_bloque_el_modo_es_el_de_siempre():
    with fetch_mode_raise():
        pass
    version = CaseVersion.objects.first()
    assert version._state.fetch_mode is FETCH_ONE
    assert version.simulation_case is not None


def test_el_modo_se_restaura_aunque_el_bloque_falle():
    with pytest.raises(RuntimeError):
        with fetch_mode_raise():
            raise RuntimeError("boom")
    version = CaseVersion.objects.first()
    assert version._state.fetch_mode is FETCH_ONE


def test_assert_queries_at_most_falla_al_excederse():
    with assert_queries_at_most(1):
        CaseVersion.objects.count()
    with pytest.raises(AssertionError, match="2 consultas"):
        with assert_queries_at_most(1):
            CaseVersion.objects.count()
            SimulationCase.objects.count()
