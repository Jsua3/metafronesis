from django.contrib.auth import get_user_model

from apps.grupos.models import GrupoEstudiante, MembershipStatus
from shared.policies import ADMIN, ESTUDIANTE


def estudiantes_de(docente):
    estudiantes = get_user_model().objects.filter(role=ESTUDIANTE)
    if docente.role == ADMIN:
        return estudiantes.values_list("pk", flat=True)
    miembros = GrupoEstudiante.objects.filter(
        grupo__profesor=docente, grupo__activo=True, status=MembershipStatus.ACTIVE
    ).values("estudiante_id")
    return estudiantes.filter(pk__in=miembros).values_list("pk", flat=True)
