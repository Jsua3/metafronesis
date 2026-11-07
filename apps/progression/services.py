"""La finalización se registra una vez en la misma transacción del intento."""

from django.utils import timezone
from .models import StudentCaseCompletion


def record_completion(sender, attempt, **kwargs):
    StudentCaseCompletion.objects.get_or_create(
        student_id=attempt.student_id,
        simulation_case_id=attempt.case_version.simulation_case_id,
        defaults={"first_completed_at": timezone.now()},
    )
