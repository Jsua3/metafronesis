"""E3-1 · La ventana de una asignación y la zona horaria (Review Focus 1).

``[opens_at, closes_at)`` en hora de Bogotá: la apertura es inclusiva y el cierre exclusivo, con
prueba en la **frontera**. La API acepta fechas con o sin desfase y las emite con ``-05:00``.
"""
import datetime
from types import SimpleNamespace

import pytest

from apps.grupos.assignments import (
    CLOSED,
    OPEN,
    SCHEDULED,
    assignment_state,
    format_window_value,
    parse_window_value,
)

pytestmark = [pytest.mark.req("RF-14"), pytest.mark.req("RF-15")]

D = datetime.datetime


def _window(opens=None, closes=None):
    return SimpleNamespace(opens_at=opens, closes_at=closes)


def test_without_dates_an_assignment_is_always_open():
    assert assignment_state(_window(), now=D(2026, 10, 14, 12)) == OPEN


def test_the_opening_is_inclusive_and_the_second_before_is_scheduled():
    window = _window(opens=D(2026, 10, 14, 0, 0, 0))

    assert assignment_state(window, now=D(2026, 10, 13, 23, 59, 59)) == SCHEDULED
    assert assignment_state(window, now=D(2026, 10, 14, 0, 0, 0)) == OPEN
    assert assignment_state(window, now=D(2026, 10, 14, 0, 0, 1)) == OPEN


def test_the_closing_is_exclusive_and_the_second_before_is_open():
    window = _window(closes=D(2026, 10, 20, 0, 0, 0))

    assert assignment_state(window, now=D(2026, 10, 19, 23, 59, 59)) == OPEN
    assert assignment_state(window, now=D(2026, 10, 20, 0, 0, 0)) == CLOSED
    assert assignment_state(window, now=D(2026, 10, 21)) == CLOSED


def test_a_full_window_goes_scheduled_then_open_then_closed():
    window = _window(opens=D(2026, 10, 14, 8), closes=D(2026, 10, 14, 18))

    states = [
        assignment_state(window, now=D(2026, 10, 14, hour))
        for hour in (7, 8, 12, 17, 18, 23)
    ]

    assert states == [SCHEDULED, OPEN, OPEN, OPEN, CLOSED, CLOSED]


@pytest.mark.parametrize(
    "raw",
    [
        "2026-10-14T00:00:00-05:00",   # Bogotá explícita
        "2026-10-14T05:00:00Z",        # UTC: mismas 00:00 de Bogotá
        "2026-10-14T07:00:00+02:00",   # otra zona
        "2026-10-14T00:00:00",         # sin desfase = Bogotá
        "2026-10-14 00:00:00",
    ],
)
def test_every_spelling_of_the_same_instant_is_stored_as_bogota_midnight(raw):
    assert parse_window_value(raw) == D(2026, 10, 14, 0, 0, 0)


def test_the_boundary_second_survives_the_conversion():
    assert parse_window_value("2026-10-14T23:59:59-05:00") == D(2026, 10, 14, 23, 59, 59)
    assert parse_window_value("2026-10-15T04:59:59Z") == D(2026, 10, 14, 23, 59, 59)
    assert parse_window_value("2026-10-15T05:00:00Z") == D(2026, 10, 15, 0, 0, 0)


def test_empty_values_mean_no_date_and_garbage_is_an_error():
    assert parse_window_value(None) is None
    assert parse_window_value("") is None
    for bad in ("mañana", "2026-13-45", 12345, ["2026-10-14"]):
        with pytest.raises(ValueError):
            parse_window_value(bad)


def test_the_emitted_date_carries_the_bogota_offset():
    assert format_window_value(D(2026, 10, 14, 0, 0, 0)) == "2026-10-14T00:00:00-05:00"
    assert format_window_value(None) is None


def test_parse_and_format_round_trip():
    value = D(2026, 12, 31, 23, 59, 59)

    assert parse_window_value(format_window_value(value)) == value
