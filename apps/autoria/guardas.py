from django.conf import settings
from django.http import Http404
from apps.simulation.models import CaseVersion, CaseVersionStatus
from apps.users.permisos import exigir_autoria
from shared.exceptions import ApiError
from shared.policies import ADMIN, PROFESOR
from . import autoria


def versiones_visibles(usuario):
    """Lo que ve cada rol (autoría compartida, ``autoria.py``): el ADMIN todo; el PROFESOR sus casos (menos los borradores
    ajenos), las versiones que creó en casos ajenos y las publicadas de cualquier caso."""
    versiones = CaseVersion.objects.select_related("simulation_case")
    if usuario.role == ADMIN:
        return versiones
    if usuario.role == PROFESOR:
        return versiones.filter(autoria.filtro_visibles(usuario))
    return versiones.none()


def version_editable(usuario, case_version_id: int) -> CaseVersion:
    exigir_autoria(usuario)
    try:
        version = versiones_visibles(usuario).select_for_update().get(pk=case_version_id)
    except CaseVersion.DoesNotExist:
        raise Http404 from None
    if version.status != CaseVersionStatus.DRAFT:
        raise ApiError("VERSION_NOT_EDITABLE", "La versión no es editable.", 409)
    if not autoria.puede_editar(usuario, version):
        # Un borrador es de quien lo creó: el ajeno ni siquiera se ve (``versiones_visibles``); esto es la segunda llave.
        raise Http404
    return version


def exigir_revision(version, revision: int | None) -> None:
    if revision is None:
        if settings.REVISION_REQUIRED:
            raise ApiError("REVISION_REQUIRED", "La revisión es obligatoria.", 400)
    elif revision != version.version:
        from .editor import vista  # perezoso: editor importa este módulo
        raise ApiError("REVISION_CONFLICT", "La revisión no está actualizada.", 409, revision=version.version, current=vista(version))


def tocar(version, usuario) -> None:
    version.version += 1
    version.last_edited_by = usuario
    version.save(update_fields=["version", "last_edited_by"])
