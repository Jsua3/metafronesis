"""Tiempo activo de un intento.

`ended_at - started_at` mide tiempo transcurrido: incluye las pausas de la
salida segura y los intentos abandonados cuyo `ended_at` se fija cuando el
estudiante empieza otro intento, a veces días después.

Desde E1-5 el tiempo activo es un **acumulador** en el intento: cada orden que lo
cambia suma ``min(ahora − last_activity_at, idle_cap)`` (``touch``) y la reanudación
tras una pausa solo reinicia el reloj (``reset_clock``), de modo que ya no hace falta
recorrer los eventos —ni escribir uno por cada movimiento del jugador— para saberlo.
``active_duration_seconds`` conserva el cálculo viejo por eventos: lo usa la migración
de datos para los intentos anteriores y las pruebas como referencia.
"""
from django.utils import timezone

IDLE_CAP_SECONDS = 300
PAUSE_EVENT = "SAFE_EXIT_REQUESTED"
#: Eventos que no son actividad que mida tiempo: una pista no parte un intervalo ocioso en dos
#: (cada mitad con su tope), así que pedirla no suma tiempo (RF-18, «sin costo»). Abrir el reporte DESPUÉS de cerrar
#: (``FEEDBACK_VIEWED``, E6-4) tampoco es actividad del intento: sin esto alargaría la última escena hasta el tope.
IGNORED_EVENTS = ("HINT_VIEWED", "FEEDBACK_VIEWED")
#: Eventos que abren una escena nueva en el tiempo por escena.
SCENE_START_EVENTS = ("NODE_ENTERED", "ROOM_ENTERED")
#: Campos que cambian al registrar actividad.
ACTIVITY_FIELDS = ["active_seconds", "last_activity_at"]


def touch(attempt, now, idle_cap=IDLE_CAP_SECONDS):
    """Suma el intervalo desde la última actividad (con tope) y fija la marca nueva.

    Solo en memoria: quien llama guarda el intento (``ACTIVITY_FIELDS``). Un intervalo
    nulo o negativo (reloj atrás) no suma; la marca igual avanza.
    """
    last = attempt.last_activity_at
    if last is not None:
        gap = (now - last).total_seconds()
        if gap > 0:
            attempt.active_seconds = (attempt.active_seconds or 0.0) + min(gap, idle_cap)
    attempt.last_activity_at = now
    return attempt


def reset_clock(attempt, now):
    """Reinicia el reloj sin sumar nada: lo que pasó en pausa no es tiempo activo."""
    attempt.last_activity_at = now
    return attempt


def record_activity(attempt):
    """``touch`` con la hora actual y guarda solo el acumulador (órdenes que no guardan el intento)."""
    touch(attempt, timezone.now())
    attempt.save(update_fields=ACTIVITY_FIELDS)
    return attempt


def active_duration_seconds(started_at, ended_at, events, idle_cap=IDLE_CAP_SECONDS):
    """Cálculo viejo por eventos: segundos enteros de actividad, o None si el intento no terminó.

    `events` es una lista de tuplas (event_type, occurred_at) ordenada por
    occurred_at. Suma los intervalos entre marcas consecutivas (inicio, eventos,
    fin), acota cada una a `idle_cap` segundos y descarta el intervalo que sigue a
    una salida segura.
    """
    if started_at is None or ended_at is None:
        return None
    events = [event for event in events if event[0] not in IGNORED_EVENTS]
    marks = [("START", started_at), *events, ("END", ended_at)]
    total = 0.0
    for (previous_type, previous_at), (_, current_at) in zip(marks, marks[1:]):
        if previous_type == PAUSE_EVENT:
            continue
        gap = (current_at - previous_at).total_seconds()
        if gap <= 0:
            continue
        total += min(gap, idle_cap)
    return int(total)


def scene_durations(events, end_at=None, idle_cap=IDLE_CAP_SECONDS):
    """Tiempo activo por escena: ``[{"nodeId", "seconds"}]`` en orden.

    ``events`` son tuplas ``(event_type, node_id, occurred_at)`` ordenadas; una escena
    nueva empieza en cada ``NODE_ENTERED`` o ``ROOM_ENTERED`` y recibe los intervalos
    hasta la siguiente (con el mismo tope y sin el tiempo en pausa). ``end_at`` cierra
    el último intervalo.
    """
    scenes = []
    previous = None  # (event_type, occurred_at) del evento anterior
    for event_type, node_id, occurred_at in events:
        if event_type in IGNORED_EVENTS:
            continue
        if previous is not None and scenes and previous[0] != PAUSE_EVENT:
            gap = (occurred_at - previous[1]).total_seconds()
            if gap > 0:
                scenes[-1]["seconds"] += min(gap, idle_cap)
        if event_type in SCENE_START_EVENTS:
            scenes.append({"nodeId": node_id, "seconds": 0.0})
        previous = (event_type, occurred_at)
    if end_at is not None and previous is not None and scenes and previous[0] != PAUSE_EVENT:
        gap = (end_at - previous[1]).total_seconds()
        if gap > 0:
            scenes[-1]["seconds"] += min(gap, idle_cap)
    return scenes
