"""Límites del limitador compartido (S1-2, DJA-2): una sola tabla de alcances, ventanas en segundos.

Son los de la especificación (§2.5 del plan de seguridad). Cada clase de ``throttling.py`` toma su par de aquí,
así que cambiar un valor cambia todas las rutas que lo usan y las pruebas lo fijan para no moverlo sin querer.
"""
from collections import namedtuple

Limit = namedtuple("Limit", "limit window")

LIMITS: dict[str, Limit] = {
    "login_ip": Limit(300, 600),
    "login_fail_account_ip": Limit(5, 900),
    "login_fail_account": Limit(30, 900),
    "google_ip": Limit(300, 600),
    "access_request_ip": Limit(5, 3600),
    "access_request_email": Limit(2, 86400),
    "access_request_global": Limit(200, 86400),
    # No limita peticiones: agrupa el aviso al ADMIN. La primera solicitud de cada ventana de 10 minutos avisa y el
    # resto de esa ventana no (``access_request_service``); el contador atómico evita avisos dobles entre procesos.
    "access_request_notice": Limit(1, 600),
    "import_user": Limit(10, 3600),
    "heavy_user": Limit(30, 60),
    # Informes de violaciones de la CSP (S2-3a): los cuenta ``CspReportIpThrottle`` en ``apps/security/csp_report.py``.
    "csp_report_ip": Limit(60, 60),
    "password_change_user": Limit(10, 3600),
    # Aceptaciones NUEVAS del aviso de consentimiento por persona (S3-2a2): el reenvío idempotente y el retiro no cuentan
    # (``apps/privacy/consent_service.py``, ``_contar_aceptacion``).
    "consent_user": Limit(30, 3600),
    # Se DEFINE pero NO se aplica globalmente: contar cada petición autenticada añade una escritura a la base por
    # cada una. Se decide después de medir ``npm run load:aula``.
    "api_user": Limit(600, 60),
    # Contador, no límite (S4-3): cuenta los fallos al escribir la auditoría para ``security_report``. Ninguna ruta lo
    # aplica, así que su tope no se usa.
    "audit_failure": Limit(0, 3600),
    # Tope de FILAS de auditoría por correo (S4-1): un atacante provoca fallos de acceso sin límite y ``audit_logs`` es de
    # solo añadir con retención de un año. Cada hash de correo deja a lo más 10 filas ``sesion.fallar`` cada 15 minutos
    # (``apps.users.services.audit_events``); pasado el tope no se escribe la fila y queda un ``security_event``. Con la
    # misma ventana (15 min) y otra clave, deja también UNA fila ``sesion.bloquear`` por correo y ventana.
    "audit_login_fail": Limit(10, 900),
    # Los otros dos topes de la MISMA fila (al revisar S4-1): rotar correos que no existen esquiva el tope por correo, y la
    # auditoría de solo añadir no se puede vaciar en un año. Cada IP agrupada deja a lo más 20 filas de fallo cada 15 minutos
    # y, entre todas, a lo más 300 por hora (un aula entera que se equivoca no llega a 40). Lo que pasa de un tope no se
    # escribe (sigue contado en el limitador) y deja UN aviso por ventana.
    "audit_login_fail_ip": Limit(20, 900),
    "audit_login_fail_global": Limit(300, 3600),
    # Tope de FILAS de auditoría de juego por estudiante (revisión S7-2, #2): empezar un intento, decidir, guardar la
    # bitácora, la salida segura y reanudar escriben una fila por llamada aunque la orden no cambie nada, y las rutas de
    # `api/simulation/` no llevan limitador por diseño: una cuenta (o quien le robe el token) llenaba `audit_logs`, que es
    # de solo añadir, a ~66 filas por segundo. Un estudiante deja a lo más 1200 filas por hora (uno real: decenas);
    # pasado el tope NO se escribe la fila, la orden se atiende igual (REGLA-004: la salida segura siempre se alcanza), el
    # limitador sigue contando y sale UN aviso `audit_game_user_capped` por ventana (`audit_service.append`).
    "audit_game_user": Limit(1200, 3600),
}

#: Los contadores que ``hit`` suma sin aplicar ningún tope. ``security_report`` no los cuenta como límites aplicados.
CONTADORES = frozenset({"audit_failure"})
