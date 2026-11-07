"""Evaluación formativa mínima congelada, sin rúbrica ni nota clínica."""

from django.db import models


class AttemptEvaluation(models.Model):
    attempt = models.OneToOneField(
        "simulation.SimulationAttempt",
        on_delete=models.CASCADE,
        related_name="evaluation",
    )
    rules_version = models.CharField(max_length=32, default="s4-minimal-1")
    snapshot = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise RuntimeError("La evaluación cerrada es inmutable")
        super().save(*args, **kwargs)
