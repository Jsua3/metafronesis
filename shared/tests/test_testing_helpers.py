import pytest
from django.db import connection, transaction

from shared.testing import RequestCost, measure

pytestmark = pytest.mark.django_db


def test_measure_no_cuenta_los_savepoints_de_la_transaccion_de_la_prueba():
    # Dentro de una prueba de django_db, atomic() emite SAVEPOINT/RELEASE; en producción
    # no existen. Contarlos inflaría el presupuesto con ruido que no es acceso a datos.
    def call():
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")

    _, cost = measure(call)

    assert cost.queries == 1
    assert all("SAVEPOINT" not in sql.upper() for sql in cost.statements)


def test_measure_cuenta_consultas_y_escrituras():
    def call():
        with connection.cursor() as cursor:
            cursor.execute("CREATE TEMP TABLE t_measure (a integer)")
            cursor.execute("INSERT INTO t_measure VALUES (1)")
            cursor.execute("SELECT a FROM t_measure")
        return "respuesta"

    response, cost = measure(call)

    assert response == "respuesta"
    assert isinstance(cost, RequestCost)
    assert cost.queries == 3
    assert cost.writes == 1
    assert cost.milliseconds >= 0
    assert cost.bytes == 0  # una cadena no es una respuesta HTTP
