"""Shared JSON / coercion helpers.

Deduplicated from world_service.py and authoring_service.py (idénticas en ambas),
y después de game_dtos.py, instructor_service.py y game_views.py (lectores) y de
world_service.py (`clamp`).
Las columnas JSON del esquema viven como TEXT, así que se leen/escriben con estas.
"""
import json


def read_string_list(raw):
    if not raw:
        return []
    try:
        value = json.loads(raw)
        return value if isinstance(value, list) else []
    except (ValueError, TypeError):
        return []


def read_map(raw):
    if not raw or not str(raw).strip():
        return {}
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except (ValueError, TypeError):
        return {}


def write_map(value):
    try:
        return json.dumps(value if value is not None else {})
    except (TypeError, ValueError):
        return "{}"


#: Los límites de una columna ``integer`` de PostgreSQL (int4). Un entero fuera de ellos no se puede guardar (S2-6b).
INT4_MIN = -(2**31)
INT4_MAX = 2**31 - 1


def coerce_int(value, default=0):
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def clamp(value, lo=0, hi=100):
    """Acota `value` al intervalo [lo, hi]; por defecto 0..100, como las métricas del intento."""
    return max(lo, min(hi, value))
