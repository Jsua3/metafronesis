from django.conf import settings
from django.http import Http404
from apps.simulation.models import CaseVersion, CaseVersionStatus
from shared.exceptions import ApiError
from shared.policies import ADMIN, PROFESOR


def versiones_visibles(usuario):
    versiones = CaseVersion.objects.select_related("simulation_case")
    if usuario.role == ADMIN:
        return versiones
    if usuario.role == PROFESOR:
        return versiones.filter(simulation_case__created_by=usuario)
    return versiones.none()


def version_editable(usuario, case_version_id: int) -> CaseVersion:
    try:
        version = versiones_visibles(usuario).select_for_update().get(pk=case_version_id)
    except CaseVersion.DoesNotExist:
        raise Http404 from None
    if version.status != CaseVersionStatus.DRAFT:
        raise ApiError("VERSION_NOT_EDITABLE", "La versión no es editable.", 409)
    return version


def exigir_revision(version, revision: int | None) -> None:
    if revision is None:
        if settings.REVISION_REQUIRED:
            raise ApiError("REVISION_REQUIRED", "La revisión es obligatoria.", 400)
    elif revision != version.version:
        raise ApiError("REVISION_CONFLICT", "La revisión no está actualizada.", 409)


def tocar(version, usuario) -> None:
    version.version += 1
    version.last_edited_by = usuario
    version.save(update_fields=["version", "last_edited_by"])
