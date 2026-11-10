from django.db import transaction
from django.shortcuts import get_object_or_404

from apps.simulation.services.audit_service import auditable
from shared.exceptions import ApiError
from shared.policies import ADMIN, PROFESOR

from .models import CustomUser, PermisoDeAutoria


def puede_autorar(usuario) -> bool:
    if not getattr(usuario, "is_authenticated", False):
        return False
    if usuario.role == ADMIN:
        return True
    return usuario.role == PROFESOR and PermisoDeAutoria.objects.filter(docente=usuario).exists()


def exigir_autoria(usuario):
    if not puede_autorar(usuario):
        raise ApiError("AUTHORING_NOT_ALLOWED", "No tiene permiso para crear o editar casos.", 403)


def _docente(user_id):
    usuario = get_object_or_404(CustomUser.objects.select_for_update(), pk=user_id)
    if usuario.role != PROFESOR:
        raise ApiError("NOT_A_TEACHER", "El usuario no es profesor.", 400)
    return usuario


@auditable("AUTHORING_PERMISSION_GRANTED", "USER", resource_id_param_index=1)
@transaction.atomic
def otorgar(admin, user_id):
    docente = _docente(user_id)
    PermisoDeAutoria.objects.get_or_create(docente=docente, defaults={"otorgado_por": admin})


@auditable("AUTHORING_PERMISSION_REVOKED", "USER", resource_id_param_index=1)
@transaction.atomic
def retirar(admin, user_id):
    docente = _docente(user_id)
    PermisoDeAutoria.objects.filter(docente=docente).delete()
