"""Finalizaciones únicas por estudiante y caso; contrato del paquete de Bonilla."""

from django.db import models


class StudentCaseCompletion(models.Model):
    student_id = models.BigIntegerField()
    simulation_case_id = models.BigIntegerField()
    first_completed_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "student_case_completion"
        managed = True
        constraints = [
            models.UniqueConstraint(
                fields=["student_id", "simulation_case_id"],
                name="uq_student_case_completion",
            )
        ]
