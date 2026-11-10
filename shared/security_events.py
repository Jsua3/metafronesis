"""Eventos de seguridad con campos fijos (S4-3).

Una línea ``security_event`` solo lleva ``event``, ``scope``, ``actor_id`` y ``reason``. Cualquier otro campo se
descarta antes de llegar al registro: así ningún dato de la persona (correo, IP, cabecera) sale por esta vía aunque
alguien lo pase por error.
"""
import logging

logger = logging.getLogger("siep.security")

#: Los campos que una línea ``security_event`` puede llevar. ``event`` va siempre; los demás solo si traen valor.
SECURITY_EVENT_FIELDS = ("event", "scope", "actor_id", "reason")


def _campos_permitidos(event, fields):
    campos = {"event": event}
    for nombre in SECURITY_EVENT_FIELDS[1:]:
        if fields.get(nombre) is not None:
            campos[nombre] = fields[nombre]
    return campos


def log_security_event(event, *, level=logging.INFO, **fields):
    """Registra ``security_event`` con ``event`` y los campos permitidos que traiga la llamada.

    ``level`` es el nivel del registro (INFO por defecto); el fallo del limitador se registra en WARNING.
    """
    logger.log(level, "security_event", extra={"fields": _campos_permitidos(event, fields)})
