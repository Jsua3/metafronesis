"""Clases de límite por alcance para las vistas (S1-2, DJA-2).

Cada clase lleva el alcance de ``limits.LIMITS``. Las de IP cuentan por la IP agrupada (``rate_limit_ip``, hallazgo #1);
las de cuenta, por el id de la persona autenticada. Una petición sin clave utilizable pasa sin contar. El 429 lo
convierte ``shared.exceptions`` en la forma ``THROTTLED``. Los límites de la solicitud de acceso (por correo y global)
no son clases: cuentan en la vista, después de validar (``apps.users.views._contar_solicitud``, hallazgo #3).
"""
from rest_framework.throttling import BaseThrottle

from shared.client_ip import rate_limit_ip

from .limiter import hit, key_hash, retry_after
from .limits import LIMITS


class ScopedThrottle(BaseThrottle):
    scope = ""
    #: Métodos HTTP que cuentan (``None``: todos). Un ``GET`` sobre una ruta que solo acepta ``POST`` no gasta cupo.
    methods = None

    def key(self, request, view):
        """Clave del contador (un hash de la IP del cliente agrupada por bloque). ``None``: la petición no cuenta."""
        return key_hash(rate_limit_ip(request))

    def allow_request(self, request, view):
        if self.methods is not None and request.method not in self.methods:
            return True
        clave = self.key(request, view)
        if clave is None:
            return True
        if hit(self.scope, clave) <= LIMITS[self.scope].limit:
            return True
        self._espera = retry_after(self.scope)
        return False

    def wait(self):
        return getattr(self, "_espera", None)


class LoginIpThrottle(ScopedThrottle):
    scope = "login_ip"
    methods = ("POST",)


class GoogleIpThrottle(ScopedThrottle):
    scope = "google_ip"
    methods = ("POST",)


class AccessRequestIpThrottle(ScopedThrottle):
    scope = "access_request_ip"
    methods = ("POST",)


class CspReportIpThrottle(ScopedThrottle):
    """Informes de violaciones de la CSP (S2-3a, RNF-002): anónimos, así que el límite cuenta por IP de cliente
    (agrupada, como las demás). Solo cuentan los ``POST``: un ``GET`` a la ruta de informes no gasta cupo (hallazgo #17)."""

    scope = "csp_report_ip"
    methods = ("POST",)


class _PersonaThrottle(ScopedThrottle):
    def key(self, request, view):
        pk = getattr(getattr(request, "user", None), "pk", None)
        return key_hash(pk) if pk is not None else None


class ImportUserThrottle(_PersonaThrottle):
    scope = "import_user"


class HeavyUserThrottle(_PersonaThrottle):
    scope = "heavy_user"


class PasswordChangeUserThrottle(_PersonaThrottle):
    scope = "password_change_user"
