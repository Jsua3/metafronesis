from django.apps import AppConfig


class ProgressionConfig(AppConfig):
    name = "apps.progression"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from apps.simulation.signals import attempt_completed
        from .services import record_completion

        attempt_completed.connect(
            record_completion, dispatch_uid="progression.s4.complete"
        )
