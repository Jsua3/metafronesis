"""Middleware de atestacion habilitado exclusivamente por settings.test."""

from django.conf import settings


class TestEnvironmentAttestationMiddleware:
    """Atesta que la respuesta proviene del stack Django de test aislado."""

    __test__ = False

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["X-SIEP-Test-Environment"] = "isolated"
        response["X-SIEP-Test-Run"] = settings.SIEP_TEST_ATTESTATION_NONCE
        response["Cache-Control"] = "no-store"
        return response
