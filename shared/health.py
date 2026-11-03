"""GET /api/health (C11): salud mínima del servicio.

Vista de Django puro (no DRF): es pública por diseño y no devuelve nada interno
(ni versiones, ni DSN, ni el texto del error de la base de datos).
"""
import logging

from django.db import connection
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET

logger = logging.getLogger("siep.health")


@require_GET
@never_cache
def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:  # cualquier fallo de la BD es 503; el detalle va al log, no a la respuesta
        logger.exception("health: la base de datos no responde")
        return JsonResponse(
            {"success": False, "data": {"status": "degraded", "db": "error"}}, status=503
        )
    return JsonResponse({"success": True, "data": {"status": "ok", "db": "ok"}})
