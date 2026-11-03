"""Identificador y duración de cada request (RNF-06, TD-10)."""
import logging
import re
import time
import uuid
from contextvars import ContextVar

request_id_var = ContextVar("siep_request_id", default="-")
_VALID_ID = re.compile(r"[A-Za-z0-9._-]{8,64}")
logger = logging.getLogger("siep.request")


class RequestContextMiddleware:
    """Asigna ``X-Request-Id`` y registra UNA línea por request (sin query string)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        incoming = request.META.get("HTTP_X_REQUEST_ID", "")
        request_id = incoming if _VALID_ID.fullmatch(incoming) else uuid.uuid4().hex
        request.request_id = request_id
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status = 500
        try:
            response = self.get_response(request)
            status = response.status_code
            response["X-Request-Id"] = request_id
            return response
        finally:
            logger.info(
                "request",
                extra={
                    "request_id": request_id,
                    "fields": {
                        "method": request.method,
                        "path": request.path,
                        "status": status,
                        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                    },
                },
            )
            request_id_var.reset(token)
