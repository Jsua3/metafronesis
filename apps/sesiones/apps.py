from django.apps import AppConfig


class SesionesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.sesiones"

    def ready(self):
        from apps.simulation.services import limites, reglas_de_inicio
        from . import reglas
        reglas_de_inicio.registrar(reglas.verificar)
        limites.registrar(reglas.limite)
