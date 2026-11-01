from django.apps import AppConfig


class UsersConfig(AppConfig):
    name = "apps.users"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        # Registra los checks de base de datos del proyecto (siep.E001, historial viejo).
        from shared import checks  # noqa: F401

        # S1-3 · calienta el hash ficticio: el primer inicio de sesión con un correo inexistente no debe tardar el doble.
        from .models import _hash_ficticio

        _hash_ficticio()
