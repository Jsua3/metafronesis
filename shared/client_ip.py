"""IP del cliente con saltos de confianza (S1-1, SIEP-RNF-02).

Con ``SIEP_TRUSTED_PROXIES = n`` (n proxies de confianza delante de Django, cada uno añade a la cola de
``X-Forwarded-For`` la dirección que ve), el cliente real es la entrada que queda a ``n`` posiciones desde la
derecha. Lo que el cliente escribió va a la izquierda y no cuenta: una cabecera falsificada no cambia el
resultado. Con ``n = 0`` no se confía en la cabecera y se usa ``REMOTE_ADDR``.

Este es el ÚNICO módulo que lee ``HTTP_X_FORWARDED_FOR`` (regla ``ip-reenviada-solo-client-ip``).

Si la cabecera no cuadra con los saltos (falta, tiene menos entradas, o la elegida no es una IP) se usa
``REMOTE_ADDR`` y queda una línea ``client_ip_fallback`` como mucho por minuto y proceso (hallazgo #14).
"""
import ipaddress
import logging
import threading
import time

from django.conf import settings

from shared.security_events import log_security_event

#: Como máximo un aviso ``client_ip_fallback`` por minuto y proceso: un proxy mal contado deja rastro sin inundar el
#: registro, porque cada petición pasa por aquí.
_INTERVALO_AVISO = 60
_cerrojo_aviso = threading.Lock()
_ultimo_aviso: float | None = None


def _ahora() -> float:
    """Segundos monótonos del proceso. Envoltorio de ``time.monotonic`` para que las pruebas fijen el reloj."""
    return time.monotonic()


def _avisar_fallback(motivo: str) -> None:
    global _ultimo_aviso
    with _cerrojo_aviso:
        ahora = _ahora()
        if _ultimo_aviso is not None and ahora - _ultimo_aviso < _INTERVALO_AVISO:
            return
        _ultimo_aviso = ahora
    log_security_event("client_ip_fallback", level=logging.WARNING, reason=motivo)


def _sin_puerto(entrada: str) -> str:
    """Quita el puerto que algunos balanceadores añaden: ``1.2.3.4:5678`` y ``[2001:db8::1]:443`` (los corchetes
    sobran al quitar el puerto). Lo que no tiene esa forma se devuelve tal cual."""
    if entrada.startswith("["):
        direccion, cierre, resto = entrada[1:].partition("]")
        if cierre and (resto == "" or (resto.startswith(":") and resto[1:].isdigit())):
            return direccion
        return entrada
    direccion, dos_puntos, puerto = entrada.partition(":")
    if dos_puntos and puerto.isdigit():  # IPv4:puerto (una IPv6 nunca tiene un único «:»)
        return direccion
    return entrada


def client_ip(request) -> str:
    """Dirección del cliente según ``SIEP_TRUSTED_PROXIES``; ``""`` si la petición no trae ``REMOTE_ADDR``."""
    remote = request.META.get("REMOTE_ADDR") or ""
    saltos = getattr(settings, "SIEP_TRUSTED_PROXIES", 0)
    if saltos < 1:  # 0 (o un valor negativo, que nunca debe leer por la izquierda): no se confía en la cabecera
        return remote
    reenviada = request.META.get("HTTP_X_FORWARDED_FOR") or ""
    entradas = [entrada.strip() for entrada in reenviada.split(",") if entrada.strip()]
    if not entradas:
        _avisar_fallback("cabecera_ausente")
        return remote
    if len(entradas) < saltos:
        _avisar_fallback("menos_entradas_que_saltos")
        return remote
    try:
        return str(ipaddress.ip_address(_sin_puerto(entradas[-saltos])))
    except ValueError:
        _avisar_fallback("entrada_no_es_ip")
        return remote


def agrupar_ip(ip: str) -> str:
    """Clave de límite de una dirección ya obtenida con ``client_ip``: la IPv4 tal cual; la IPv4 de una dirección
    mapeada (``::ffff:a.b.c.d``); la red ``/64`` de una IPv6 normal. Lo que no es una IP se devuelve sin tocar."""
    try:
        direccion = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if direccion.version == 4:
        return str(direccion)
    if direccion.ipv4_mapped is not None:
        return str(direccion.ipv4_mapped)
    return str(ipaddress.ip_network(f"{ip}/64", strict=False))


def rate_limit_ip(request) -> str:
    """Clave por IP de los límites (SIEP-RNF-02, hallazgo #1): ``client_ip`` agrupada, para que quien tiene un bloque
    IPv6 (cualquier abonado doméstico) no reciba un contador nuevo por cada dirección, y ``::ffff:a.b.c.d`` cuente
    como ``a.b.c.d``. ``client_ip`` queda cruda: la auditoría guarda la dirección exacta."""
    return agrupar_ip(client_ip(request))
