"""Eventos de auditoría de las sesiones, las cuentas y las solicitudes de acceso (S4-1, RNF-007, SIEP-RNF-02).

Responden «quién entró» y «quién cambió qué» sobre las cuentas. Cada función escribe UNA fila con
``audit_service.record`` y NUNCA lanza: la auditoría no rompe la operación. El contexto de cada fila pasa por la lista
blanca de ``audit_service.CONTEXT_WHITELIST``: solo ids, banderas, nombres de campos y valores de un conjunto cerrado;
jamás contraseñas, tokens ni correos en claro (el correo intentado en un acceso fallido va como HASH).
"""
from apps.security.limiter import hit, key_hash
from apps.security.limits import LIMITS
from apps.simulation.services import audit_service
from shared.security_events import log_security_event


def _id_de(user):
    return None if user is None else user.pk


# ─── Sesiones ──────────────────────────────────────────────────────────────────────────────────────────────────────
def login_succeeded(user, provider):
    """``sesion.entrar``. La petición aún no está autenticada: quien entró (``user``) es el actor."""
    audit_service.record("LOGIN_SUCCEEDED", "USER", user.pk, {"provider": provider}, actor=user)


def _cabe_la_fila(correo_clave, ip, clase):
    """Cuenta la fila en sus topes y dice si cabe en TODOS: el del correo (si lo hay), el de la IP agrupada (si la hay) y el
    global. Un atacante que rota correos que no existen esquiva el tope por correo; la IP y el total acotan lo que puede
    llenar la tabla de auditoría, que es de solo añadir. Cada tope cuenta aunque otro ya haya pasado (el limitador sigue
    sabiendo cuántos intentos hubo) y avisa UNA vez por ventana, sin el correo ni la IP. Con el limitador apagado ``hit``
    devuelve 0 y no hay tope."""
    cuentas = []
    if correo_clave is not None:
        cuentas.append(("audit_login_fail", correo_clave))
    if ip:
        cuentas.append(("audit_login_fail_ip", key_hash(ip, clase)))
    cuentas.append(("audit_login_fail_global", key_hash("global", clase)))
    totales = [(alcance, hit(alcance, clave)) for alcance, clave in cuentas]
    for alcance, total in totales:
        if total == LIMITS[alcance].limit + 1:
            log_security_event("audit_login_fail_capped", scope=alcance)
    return all(total <= LIMITS[alcance].limit for alcance, total in totales)


def login_failed(email, user, reason, ip=None):
    """``sesion.fallar``: el correo intentado como hash (``key_hash``, nunca en claro) y el motivo.

    ``reason`` es ``bad_password``, ``unknown_account``, ``inactive`` o ``expired_temp_password``. Un atacante puede
    provocar fallos sin tope y la auditoría es de solo añadir: se escriben a lo más ``audit_login_fail`` filas por hash de
    correo y ventana, ``audit_login_fail_ip`` por IP agrupada y ``audit_login_fail_global`` en total (``_cabe_la_fila``).
    """
    hash_del_correo = key_hash(email)
    if not _cabe_la_fila(hash_del_correo, ip, "fail"):
        return
    audit_service.record(
        "LOGIN_FAILED", "USER", _id_de(user), {"emailHash": hash_del_correo, "reason": reason}
    )


def login_locked(email, user, scope, ip=None):
    """``sesion.bloquear``: UNA fila por correo y ventana, la primera vez que salta el bloqueo de una cuenta.

    ``scope`` es el alcance que saltó (``login_fail_account_ip`` o ``login_fail_account``). Va con el id de la cuenta si
    existe (nunca el correo). Un atacante que reparte los fallos en muchas IPs hace saltar el bloqueo de cada pareja
    cuenta + IP: la clave del correo y la ventana de 15 minutos dejan pasar solo la primera. También respeta los topes de
    la IP y el total (clase ``lock``), para que rotar correos no llene la tabla de bloqueos.
    """
    if hit("audit_login_fail", key_hash(email, "lock")) != 1:
        return
    if not _cabe_la_fila(None, ip, "lock"):
        return
    audit_service.record("LOGIN_LOCKED", "USER", _id_de(user), {"scope": scope, "targetId": _id_de(user)})


def logged_out(user):
    """``sesion.salir``: la persona cerró sus sesiones (el actor es la propia petición)."""
    audit_service.record("LOGOUT", "USER", user.pk)


# ─── Cuentas (las cambia el ADMIN) ─────────────────────────────────────────────────────────────────────────────────
#: Los datos de la cuenta cuyo cambio es ``usuario.actualizar``, en este orden. El rol y el estado tienen su evento.
CAMPOS_DE_DATOS = ("nombre", "apellido", "email")


def snapshot(user):
    """Lo que hay que recordar de una cuenta ANTES de editarla para saber después qué cambió."""
    return {campo: getattr(user, campo) for campo in (*CAMPOS_DE_DATOS, "role", "activo")}


def user_created(user):
    """``usuario.crear``: el alta por el ADMIN, con el rol con el que nace (``security_report`` cuenta los privilegiados)."""
    audit_service.record(
        "USER_CREATED", "USER", user.pk, {"targetId": user.pk, "role": user.role, "activo": user.activo}
    )


def user_status_changed(user):
    """``usuario.estado``: la cuenta se activó o se desactivó."""
    audit_service.record(
        "USER_STATUS_CHANGED", "USER", user.pk, {"targetId": user.pk, "changed": ["activo"], "activo": user.activo}
    )


def user_changes(antes, user):
    """Una fila por CLASE de cambio entre ``antes`` (``snapshot``) y la cuenta guardada: ``usuario.rol``,
    ``usuario.estado`` y ``usuario.actualizar`` (nombre, apellido, correo). Así un cambio de rol sigue siendo hallable por
    ``usuario.rol`` aunque venga junto a otros. Solo los NOMBRES de los campos: nunca sus valores (el correo en claro, no).
    Sin cambios no escribe nada. La contraseña tiene su evento (``usuario.fijar_clave``)."""
    if antes["role"] != user.role:
        audit_service.record(
            "USER_ROLE_CHANGED", "USER", user.pk,
            {"targetId": user.pk, "changed": ["role"], "role": user.role, "previousRole": antes["role"]},
        )
    if antes["activo"] != user.activo:
        user_status_changed(user)
    cambiados = [campo for campo in CAMPOS_DE_DATOS if antes[campo] != getattr(user, campo)]
    if cambiados:
        audit_service.record("USER_UPDATED", "USER", user.pk, {"targetId": user.pk, "changed": cambiados})


def users_listed(count):
    """``usuario.listar``: el ADMIN leyó la lista de todas las cuentas (cuántas, no cuáles)."""
    audit_service.record("USER_LIST_VIEWED", "USER", None, {"count": count})


# ─── Solicitudes de acceso ─────────────────────────────────────────────────────────────────────────────────────────
def access_request_created(solicitud):
    """``solicitud.crear``: la pública, de actor anónimo. El contexto es SOLO su id: nunca el nombre ni el correo."""
    audit_service.record("ACCESS_REQUEST_CREATED", "ACCESS_REQUEST", solicitud.pk, {"requestId": solicitud.pk})


def access_request_resolved(solicitud):
    """``solicitud.resolver``: el ADMIN la resolvió (o se resolvió al crear su cuenta)."""
    audit_service.record(
        "ACCESS_REQUEST_RESOLVED", "ACCESS_REQUEST", solicitud.pk,
        {"requestId": solicitud.pk, "status": solicitud.status},
    )


def access_requests_listed(count):
    """``solicitud.listar``: el ADMIN leyó la lista de solicitudes (nombres y correos de quienes las pidieron)."""
    audit_service.record("ACCESS_REQUEST_LIST_VIEWED", "ACCESS_REQUEST", None, {"count": count})
