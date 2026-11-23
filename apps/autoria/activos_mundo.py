"""Comprobación de las rutas de recursos del mundo."""
import ipaddress
import re
from urllib.parse import urlsplit

from django.conf import settings

LIMITE_URL = 300
CODIFICADO = re.compile(r"%(?:2e|2f|5c)", re.IGNORECASE)
CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def recurso_permitido(valor):
    if valor is None or valor == "":
        return True
    if not isinstance(valor, str) or len(valor) > LIMITE_URL or CONTROL.search(valor) or "\\" in valor or CODIFICADO.search(valor):
        return False
    if valor.startswith("/assets/"):
        return ".." not in valor and "//" not in valor
    if not valor.lower().startswith("https://"):
        return False
    try:
        partes = urlsplit(valor)
        host = partes.hostname or ""
        if not host or "@" in partes.netloc or ":" in partes.netloc or "[" in partes.netloc or partes.path in ("", "/"):
            return False
        try:
            ipaddress.ip_address(host)
            return False
        except ValueError:
            return host in {permitido.lower() for permitido in settings.SIEP_ALLOWED_ASSET_HOSTS}
    except ValueError:
        return False
