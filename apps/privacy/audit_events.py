"""Eventos de auditoría de los derechos del titular y de la retención (S3-4, RNF-003, RNF-007).

Responden «quién exportó, suprimió o depuró datos de personas». Cada función escribe UNA fila con ``audit_service.record`` y
NUNCA lanza: la auditoría no rompe la operación. El ``actor`` de la fila es el ADMIN que ejecutó el comando (los comandos no
tienen petición ni sesión); el recurso es la cuenta de la persona. El contexto pasa por la lista blanca de
``audit_service.CONTEXT_WHITELIST``: solo ids y recuentos, jamás el correo, el nombre ni un texto de la persona.

Se llaman FUERA de la transacción del cambio (``record`` no debe escribirse dentro de una que pueda abortar), como los eventos
de ``apps.users.services.audit_events``.
"""
from apps.simulation.services import audit_service


def persona_exportada(persona, ejecutor, *, filas, tablas):
    """``datos.exportar``: el ADMIN ``ejecutor`` sacó a un archivo los datos de ``persona`` (cuántas filas, de cuántas tablas)."""
    audit_service.record(
        "PERSONAL_DATA_EXPORTED", "USER", persona.pk,
        {"targetId": persona.pk, "executedBy": ejecutor.pk, "rows": filas, "tables": tablas},
        actor=ejecutor,
    )


def persona_suprimida(persona, ejecutor, *, cambiadas, borradas, tablas):
    """``datos.suprimir``: el ADMIN ``ejecutor`` suprimió la identidad de ``persona`` (filas cambiadas y borradas)."""
    audit_service.record(
        "PERSONAL_DATA_ERASED", "USER", persona.pk,
        {
            "targetId": persona.pk, "executedBy": ejecutor.pk,
            "changed": cambiadas, "deleted": borradas, "tables": tablas,
        },
        actor=ejecutor,
    )


def datos_depurados(ejecutor, *, contadores, auditoria, solicitudes):
    """``datos.depurar``: el ADMIN ``ejecutor`` borró lo vencido (contadores del limitador, auditoría y solicitudes)."""
    audit_service.record(
        "EXPIRED_DATA_PURGED", None, None,
        {
            "executedBy": ejecutor.pk,
            "rateLimits": contadores, "auditLogs": auditoria, "accessRequests": solicitudes,
        },
        actor=ejecutor,
    )
