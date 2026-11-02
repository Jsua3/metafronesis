"""Cerrojo por intento (E1-3, RNF-08, TD-04).

Dos órdenes sobre el mismo intento (doble clic, dos pestañas, un reemplazo docente a
la vez que una decisión) no pueden leer el mismo estado y escribir las dos. Cada orden
que cambia el intento toma ``SELECT … FOR UPDATE`` de **su fila** antes de leer nada:
la segunda espera, y al despertar lee lo que la primera ya confirmó (READ COMMITTED
vuelve a tomar la instantánea en cada sentencia). La última defensa sigue siendo la BD:
índice único del intento abierto y ``UNIQUE (attempt, request_id)`` de los eventos.
"""
import functools

from django.db import transaction

from ..models import SimulationAttempt


def lock_attempt_row(attempt_id):
    """Toma el cerrojo de la fila del intento dentro de la transacción actual.

    Solo bloquea el intento (no los nodos ni el caso, que la orden solo lee). Si el
    intento no existe no hace nada: quien lo necesite lo reportará al leerlo.
    """
    SimulationAttempt.objects.select_for_update().filter(pk=attempt_id).values_list("pk", flat=True).first()


def locked_attempt(func):
    """Ejecuta ``func(attempt_id, attempt_token, …)`` en una transacción con el intento bloqueado.

    Los dos primeros parámetros del servicio decorado son ``attempt_id`` y ``attempt_token``
    (la firma de todas las órdenes del intento). Sustituye a ``@transaction.atomic``.
    """

    @functools.wraps(func)
    def wrapper(attempt_id, attempt_token, *args, **kwargs):
        with transaction.atomic():
            lock_attempt_row(attempt_id)
            return func(attempt_id, attempt_token, *args, **kwargs)

    return wrapper
