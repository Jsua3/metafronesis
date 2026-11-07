"""Autenticación JWT con el cambio de contraseña obligatorio (E2-9, RN-10) y sesión revocable (S1-4).

Una cuenta aprobada por el ADMIN nace con una contraseña temporal y ``must_change_password``:
hasta que la persona fije la suya, **toda** orden responde 403 ``PASSWORD_CHANGE_REQUIRED``
salvo las de autenticación (``/api/auth/**``: entrar, ver quién soy, cambiar la contraseña) y
la salud del servicio. Es la autenticación por defecto de DRF (``REST_FRAMEWORK``).

Sesión revocable (S1-4): el token lleva la época de sesión de su dueño (claim ``ep``). Si la base tiene una época
mayor (se cerró la sesión, cambió la contraseña, se desactivó o reactivó la cuenta o cambió el rol), el token se
rechaza aunque no haya caducado. Esa comprobación va ANTES del cambio obligatorio de contraseña.
"""
from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

#: Rutas que una cuenta con cambio pendiente sí puede usar.
ALLOWED_PREFIXES = ("/api/auth/", "/api/health")


def _epoca_del_token(token):
    """La época de sesión del token. Sin la claim (anterior a S1-4) o si no es un entero, cuenta como 0."""
    try:
        return int(token.get("ep", 0))
    except (TypeError, ValueError):
        return 0


class SiepJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        try:
            return super().get_user(validated_token)
        except (TypeError, ValueError, OverflowError):
            # S7-1a · un ``userId`` firmado que no es un número de cuenta (texto, lista, objeto) llegaba al ORM y daba 500:
            # es un token que no apunta a nadie, igual que el de una cuenta que no existe.
            raise AuthenticationFailed("User not found", code="user_not_found") from None

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, token = result
        # S1-4 · sesión revocable: un token emitido antes de la última revocación ya no vale.
        if settings.SIEP_SESSION_EPOCH_ENFORCE and _epoca_del_token(token) < user.session_epoch:
            raise AuthenticationFailed(
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                "La sesión se cerró o cambió; vuelve a entrar.",
                code="token_not_valid",
            )
        # Importación perezosa: DRF carga esta clase al leer sus ajustes, mientras
        # ``shared.exceptions`` (que importa DRF) todavía se está inicializando.
        from shared.exceptions import ApiError

        if getattr(user, "must_change_password", False) and not request.path.startswith(ALLOWED_PREFIXES):
            raise ApiError(
                "PASSWORD_CHANGE_REQUIRED",
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                "Debes cambiar tu contraseña temporal antes de continuar.",
                status.HTTP_403_FORBIDDEN,
            )
        return result
