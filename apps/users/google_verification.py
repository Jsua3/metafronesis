"""R1c · verificación de Google que no retiene hilos (SIEP-RNF-02).

google-auth baja los certificados públicos de Google en cada llamada a ``verify_oauth2_token``, ANTES de mirar la
credencial, y el transporte ``requests`` espera hasta 120 s por defecto. Con una docena de peticiones anónimas a
``POST /api/auth/google`` y Google lento, se quedaban sin hilos todos los del servidor. Este módulo corta esa
exposición en tres frentes:

1. ``tiene_forma_de_jwt``: una credencial que no es un JWT se rechaza antes de la red (lo llama ``views.py``).
2. ``CachedCertsRequest``: envuelve el transporte. Cada llamada lleva un tope de ``TIEMPO_MAXIMO`` segundos y los
   certificados se guardan en una caché de proceso con la vigencia que diga ``Cache-Control``, acotada.
3. ``clear_certs_cache``: vacía esa caché (para las pruebas).
"""
import re
import threading
import time

#: Longitud máxima de una credencial de Google. El serializador de ``/api/auth/google`` la aplica también.
LONGITUD_MAXIMA = 4096
#: Tope en segundos de cada llamada al transporte, aunque google-auth pida más o no pida nada.
TIEMPO_MAXIMO = 5
#: Certificados públicos con los que google-auth verifica los ID tokens de Google (la misma URL que usa google-auth).
URL_CERTIFICADOS = "https://www.googleapis.com/oauth2/v1/certs"
#: Vigencia de la caché: el ``max-age`` de la respuesta, acotado a [VIGENCIA_MINIMA, VIGENCIA_MAXIMA]. Sin cabecera,
#: VIGENCIA_POR_DEFECTO.
VIGENCIA_MINIMA = 60
#: Una hora como mucho, aunque Google diga más: si rota su llave, un ID token firmado con la nueva no debe fallar horas
#: (cuesta una petición por hora y proceso).
VIGENCIA_MAXIMA = 3600
VIGENCIA_POR_DEFECTO = 3600

#: Reloj monotónico de la caché. Las pruebas lo sustituyen para avanzar el tiempo sin esperar.
reloj = time.monotonic

_FORMA_JWT = re.compile(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
_MAX_AGE = re.compile(r"max-age\s*=\s*(\d+)", re.IGNORECASE)

_cerrojo = threading.Lock()
#: (respuesta completa del transporte, instante en que caduca según ``reloj``). ``None`` si no hay nada guardado.
_entrada = None


def tiene_forma_de_jwt(credential):
    """Tres segmentos ``[A-Za-z0-9_-]+`` separados por puntos, y como mucho ``LONGITUD_MAXIMA`` caracteres."""
    return len(credential) <= LONGITUD_MAXIMA and _FORMA_JWT.fullmatch(credential) is not None


def clear_certs_cache():
    """Vacía la caché de certificados."""
    global _entrada
    with _cerrojo:
        _entrada = None


def _leer_cache(ahora):
    with _cerrojo:
        if _entrada is not None and ahora < _entrada[1]:
            return _entrada[0]
    return None


def _guardar_cache(respuesta, caduca):
    global _entrada
    with _cerrojo:
        _entrada = (respuesta, caduca)


def _vigencia(respuesta):
    """Segundos que puede guardarse ``respuesta``: su ``max-age`` (la cabecera sin distinguir mayúsculas)."""
    for nombre, valor in (getattr(respuesta, "headers", None) or {}).items():
        if str(nombre).lower() == "cache-control":
            coincidencia = _MAX_AGE.search(str(valor))
            if coincidencia:
                return min(max(int(coincidencia.group(1)), VIGENCIA_MINIMA), VIGENCIA_MAXIMA)
    return VIGENCIA_POR_DEFECTO


def _tope(timeout):
    """El tiempo pedido si ya es de 5 s o menos; en cualquier otro caso (más, nada, no numérico), 5 s."""
    if isinstance(timeout, (int, float)) and timeout <= TIEMPO_MAXIMO:
        return timeout
    return TIEMPO_MAXIMO


class CachedCertsRequest:
    """Transporte de google-auth con tope de tiempo y caché de los certificados de Google.

    Solo se guarda un ``GET`` a ``URL_CERTIFICADOS`` que responde 200: un fallo de red o un estado distinto se propaga
    y no se guarda. Dos hilos con la caché vacía pueden bajar los certificados dos veces; la caché no se corrompe.
    """

    def __init__(self, transporte):
        self._transporte = transporte

    def __call__(self, url, method="GET", body=None, headers=None, timeout=None, **kwargs):
        es_certificados = method == "GET" and url == URL_CERTIFICADOS
        ahora = reloj()
        if es_certificados:
            guardada = _leer_cache(ahora)
            if guardada is not None:
                return guardada
        respuesta = self._transporte(
            url, method=method, body=body, headers=headers, timeout=_tope(timeout), **kwargs
        )
        if es_certificados and respuesta.status == 200:
            _guardar_cache(respuesta, ahora + _vigencia(respuesta))
        return respuesta
