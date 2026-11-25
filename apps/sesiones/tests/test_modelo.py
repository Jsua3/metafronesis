import pytest
from django.db import IntegrityError, transaction

from apps.sesiones.estados import Programada
from apps.sesiones.models import Convocatoria, EstadoSesion

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-35")]


def test_nace_programada_con_su_grupo_y_sin_marcas(crear_sesion, grupo):
    sesion = crear_sesion()
    assert sesion.estado == EstadoSesion.PROGRAMADA
    assert sesion.grupo == grupo
    assert (sesion.iniciada_en, sesion.finalizada_en, sesion.cancelada_en) == (None, None, None)
    assert isinstance(sesion.estado_actual(), Programada)


def test_convocatoria_sin_codigo(crear_sesion):
    sesion = crear_sesion()
    assert set(Convocatoria.objects.filter(sesion=sesion).values_list("codigo_hash", flat=True)) == {""}


def test_estado_desconocido_lo_rechaza_la_base(crear_sesion):
    sesion = crear_sesion()
    sesion.estado = "SIN_INICIAR"
    with pytest.raises(IntegrityError), transaction.atomic():
        sesion.save(update_fields=["estado"])
