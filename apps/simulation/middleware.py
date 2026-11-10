"""Binds the current request to a thread-local so the audit decorator can read
the authenticated actor + IP/User-Agent (Spring reads SecurityContextHolder /
RequestContextHolder). DRF writes the authenticated user back onto the Django
request, so by the time a service runs ``request.user`` is the actor."""
from apps.simulation.services import audit_service


class AuditContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        audit_service.bind_request(request)
        try:
            return self.get_response(request)
        finally:
            audit_service.clear_request()
