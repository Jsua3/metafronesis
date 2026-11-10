"""Caché en memoria de lecturas inmutables (E5-2, DJA-8, RNF-05).

Envuelve el caché por defecto de Django (``LocMemCache`` en un proceso; seguro entre
procesos/workers cuando la clave lleva su propio sello de inmutabilidad).
"""
from django.core.cache import caches

DEFAULT_TTL_SECONDS = 3600


def _backend():
    return caches["default"]


def get_or_set(key: str, builder, timeout: int = DEFAULT_TTL_SECONDS):
    """Lee ``key`` del caché o calcula ``builder()`` y lo guarda por ``timeout`` segundos."""
    cache = _backend()
    cached = cache.get(key)
    if cached is not None:
        return cached
    value = builder()
    cache.set(key, value, timeout=timeout)
    return value


def clear() -> None:
    """Vacía el caché por defecto (para aislamiento entre pruebas cuando comparten proceso)."""
    _backend().clear()


def static_world_key(scene_map_id: int, case_version) -> str | None:
    """Clave inmutable del mundo estático (E5-2): solo versiones ``PUBLISHED`` con ``published_at``.

    Un borrador o una versión en revisión devuelve ``None`` y nunca entra al caché.
    """
    if case_version is None or getattr(case_version, "status", None) != "PUBLISHED":
        return None
    published_at = getattr(case_version, "published_at", None)
    if published_at is None:
        return None
    stamp = published_at.isoformat() if hasattr(published_at, "isoformat") else str(published_at)
    return f"siep:world:static:{scene_map_id}:{stamp}"

