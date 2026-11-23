"""Configuración del asistente de autoría, leída de ``django.conf.settings`` (``AI_AUTHORING_*``) en cada llamada."""
from dataclasses import dataclass

from django.conf import settings

from apps.ia.proveedores import REGISTRO


@dataclass(frozen=True)
class Config:
    enabled: bool
    provider: str
    api_key: str
    model_fast: str
    model_capable: str
    daily_limit: int
    monthly_limit: int
    timeout_seconds: int = 60
    max_tokens_propose: int = 8000

    @property
    def conectado(self) -> bool:
        """Encendido, con un proveedor conocido y con qué llamarlo (clave, o el falso, que no usa ninguna)."""
        proveedor = (self.provider or "").strip().lower()
        if not self.enabled or proveedor not in REGISTRO:
            return False
        return bool(self.api_key) or proveedor == "falso"

    def __repr__(self) -> str:
        """Como el de un dataclass, pero con la clave enmascarada: nunca se imprime."""
        campos = ", ".join(
            f"{nombre}={'***' if nombre == 'api_key' and self.api_key else getattr(self, nombre)!r}"
            for nombre in self.__dataclass_fields__
        )
        return f"Config({campos})"

    __str__ = __repr__


def actual() -> Config:
    """La configuración vigente; se lee en cada llamada para que ``settings`` de las pruebas funcione."""
    return Config(
        enabled=bool(settings.AI_AUTHORING_ENABLED),
        provider=settings.AI_AUTHORING_PROVIDER,
        api_key=settings.AI_AUTHORING_API_KEY,
        model_fast=settings.AI_AUTHORING_MODEL,
        model_capable=settings.AI_AUTHORING_MODEL_CAPABLE,
        daily_limit=int(settings.AI_AUTHORING_DAILY_LIMIT_PER_USER),
        monthly_limit=int(settings.AI_AUTHORING_MONTHLY_LIMIT),
        timeout_seconds=int(settings.AI_AUTHORING_TIMEOUT_SECONDS),
        max_tokens_propose=int(settings.AI_AUTHORING_MAX_TOKENS_PROPOSE),
    )
