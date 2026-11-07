"""Tareas en segundo plano para una petición (S1-3): un correo lento no debe retener un hilo del servidor.

Solo usa la biblioteca estándar y Django. Con ``SIEP_BACKGROUND_INLINE`` activo (así están las pruebas) la tarea
corre en el acto, dentro de la petición, para que las pruebas revisen ``mail.outbox`` al volver.
"""
import logging
import threading

from django.conf import settings
from django.db import connection

logger = logging.getLogger(__name__)


def _ejecutar(fn, args, kwargs):
    try:
        fn(*args, **kwargs)
    except Exception:
        # Sin datos personales: solo el nombre de la tarea. La tarea registra su propio id si lo necesita.
        logger.exception("Tarea en segundo plano fallida: %s", getattr(fn, "__qualname__", "tarea"))


def run_in_background(fn, *args, **kwargs):
    """Ejecuta ``fn(*args, **kwargs)`` en un hilo demonio. Devuelve el hilo, o ``None`` si corrió en el acto."""
    if getattr(settings, "SIEP_BACKGROUND_INLINE", False):
        _ejecutar(fn, args, kwargs)
        return None

    def _trabajo():
        try:
            _ejecutar(fn, args, kwargs)
        finally:
            # Cada hilo tiene su propia conexión a la base de datos: se cierra al terminar.
            connection.close()

    hilo = threading.Thread(target=_trabajo, daemon=True, name="siep-segundo-plano")
    hilo.start()
    return hilo
