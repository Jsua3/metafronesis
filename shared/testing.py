"""Ayudantes de prueba compartidos (E0-1, E0-5, E0-11)."""
from __future__ import annotations

import re
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass

import django.db.models.query as _query
from django.db import connection, connections
from django.db.models import FETCH_RAISE
from django.test.utils import CaptureQueriesContext

_WRITE_PREFIXES = ("INSERT", "UPDATE", "DELETE")
# Control de transacción que Django emite dentro de la transacción de cada prueba
# (atomic() anidado) y que no existe en producción: no es acceso a datos.
_TRANSACTION_CONTROL = ("SAVEPOINT", "RELEASE SAVEPOINT", "ROLLBACK TO SAVEPOINT")


@dataclass(frozen=True)
class RequestCost:
    """Lo que cuesta una llamada: consultas, escrituras, milisegundos y bytes."""

    queries: int
    writes: int
    milliseconds: float
    bytes: int
    statements: tuple[str, ...]


def measure(call):
    """Ejecuta ``call()`` y devuelve ``(respuesta, RequestCost)``."""
    started = time.perf_counter()
    with CaptureQueriesContext(connection) as captured:
        response = call()
    elapsed = (time.perf_counter() - started) * 1000
    statements = tuple(
        q["sql"]
        for q in captured.captured_queries
        if not q["sql"].lstrip().upper().startswith(_TRANSACTION_CONTROL)
    )
    writes = sum(1 for sql in statements if sql.lstrip().upper().startswith(_WRITE_PREFIXES))
    body = getattr(response, "content", b"") or b""
    return response, RequestCost(
        queries=len(statements),
        writes=writes,
        milliseconds=round(elapsed, 1),
        bytes=len(body),
        statements=statements,
    )


_REQ_CODE = re.compile(r"[A-Z][A-Z0-9]*(-[A-Z0-9]+(\.[0-9]+)?)+")


def invalid_req_codes(codes):
    """Devuelve los códigos de ``@pytest.mark.req`` que no tienen forma de requisito."""
    return [code for code in codes if not _REQ_CODE.fullmatch(str(code))]


def _tiene_marcador(item, nombre):
    return next(item.iter_markers(nombre), None) is not None


def security_items_without_req(items):
    """Pruebas marcadas ``security`` que no llevan además ``req`` (plan 03, S0-1)."""
    return [item for item in items if _tiene_marcador(item, "security") and not _tiene_marcador(item, "req")]


@contextmanager
def fetch_mode_raise():
    """Dentro del bloque, todo QuerySet nuevo nace con ``FETCH_RAISE`` (DJA-7).

    Un acceso perezoso accidental a una relación lanza ``FieldFetchBlocked`` en
    vez de disparar una consulta N+1 silenciosa. Django 6.1 expone el modo por
    defecto como ``django.db.models.query.DEFAULT_FETCH_MODE``; se restaura al salir.
    """
    previous = _query.DEFAULT_FETCH_MODE
    _query.DEFAULT_FETCH_MODE = FETCH_RAISE
    try:
        yield
    finally:
        _query.DEFAULT_FETCH_MODE = previous


@contextmanager
def assert_queries_at_most(limit):
    """Falla si el bloque ejecuta más de ``limit`` consultas de datos."""
    with CaptureQueriesContext(connection) as captured:
        yield captured
    used = sum(
        1
        for q in captured.captured_queries
        if not q["sql"].lstrip().upper().startswith(_TRANSACTION_CONTROL)
    )
    assert used <= limit, f"{used} consultas; el máximo es {limit}"


@dataclass(frozen=True)
class Outcome:
    """Resultado de una llamada de ``run_concurrently``: su valor o el error que lanzó."""

    value: object = None
    error: BaseException | None = None


def run_concurrently(*calls, timeout=30):
    """Ejecuta cada ``call()`` en su propio hilo, arrancándolos a la vez (E0-9).

    Cada hilo usa su propia conexión (se cierra al terminar) y, sin una transacción
    de prueba de por medio, **hace commits reales**. Devuelve un ``Outcome`` por
    llamada, en el mismo orden. Úsese con el fixture ``real_commits`` y limpiando
    lo que se crea: ``transactional_db`` haría ``flush`` y borraría la siembra.
    """
    barrier = threading.Barrier(len(calls))
    outcomes = [None] * len(calls)

    def runner(index, call):
        try:
            barrier.wait(timeout)
            outcomes[index] = Outcome(value=call())
        except BaseException as error:  # noqa: BLE001  (se devuelve, no se pierde)
            outcomes[index] = Outcome(error=error)
        finally:
            connections.close_all()

    threads = [
        threading.Thread(target=runner, args=(index, call), daemon=True)
        for index, call in enumerate(calls)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout + 5)
    assert not any(thread.is_alive() for thread in threads), "un hilo no terminó a tiempo"
    return outcomes


#: Un sello de relleno para las pruebas que publican una versión por ORM sin pasar por la compuerta.
TEST_SEAL_HASH = "sha256:" + "0" * 64


def seal_version(version):
    """Sella (con un sello de prueba) una versión publicada por ORM (E4-4).

    Arrancar un intento exige el sello de la compuerta (``authoring.gate``); una prueba que arma una
    versión ``PUBLISHED`` a mano y empieza un intento sobre ella lo pone con esto. Acepta la versión o
    su id y devuelve la fila actualizada.
    """
    from django.utils import timezone

    from apps.simulation.models import CaseVersion

    pk = getattr(version, "pk", version)
    CaseVersion.objects.filter(pk=pk).update(validated_at=timezone.now(), definition_hash=TEST_SEAL_HASH)
    return CaseVersion.objects.get(pk=pk)


def purge_audit_rows(queryset):
    """Borra filas de ``audit_logs`` dentro de una prueba (S4-2).

    La base solo admite ``DELETE`` sobre la auditoría dentro de la ventana de purgado; la prueba que limpia lo que
    creó lo hace por aquí en vez de ``queryset.delete()``. Devuelve lo que devuelve ``delete()``.
    """
    from apps.simulation.services.audit_service import audit_purge_window

    with audit_purge_window():
        return queryset.delete()


def rewrite_audit_rows(queryset, **changes):
    """Actualiza filas de ``audit_logs`` dentro de una prueba (S4-2); ver ``purge_audit_rows``."""
    from apps.simulation.services.audit_service import audit_purge_window

    with audit_purge_window():
        return queryset.update(**changes)
