from dataclasses import asdict

from django.conf import settings
from django.db import transaction
from django.http import Http404
from django.utils import timezone

from apps.simulation.models import CaseVersion
from apps.simulation.services.audit_service import auditable
from shared.exceptions import ApiError
from shared.policies import can
from .arbol import arbol_de
from .huella import huella_de
from apps.simulation.models import CaseVersionStatus


def version_accesible(usuario, case_version_id, accion='author', lock=False):
    consulta = CaseVersion.objects.select_related('simulation_case')
    if lock:
        consulta = consulta.select_for_update(of=('self',))
    version = consulta.filter(pk=case_version_id).first()
    if version is None or not can(usuario, 'case', accion, owner_id=version.simulation_case.created_by_id):
        raise Http404
    return version


def validar(usuario, case_version_id) -> list:
    return arbol_de(version_accesible(usuario, case_version_id)).problemas()


def _exigir_estado(version, permitidos):
    if version.status not in permitidos:
        raise ApiError('INVALID_TRANSITION', 'La transición no está permitida.', 409)


def _sellar(version):
    problemas = arbol_de(version).problemas()
    if problemas:
        raise ApiError('CASE_INVALID', 'El caso no es válido.', 400, problems=[asdict(p) for p in problemas])
    version.validated_at = timezone.now()
    version.definition_hash = huella_de(version)


@auditable('CASE_SUBMITTED', 'CASE_VERSION', resource_id_param_index=1)
@transaction.atomic
def enviar_a_revision(usuario, case_version_id):
    version = version_accesible(usuario, case_version_id, 'submit', lock=True)
    _exigir_estado(version, (CaseVersionStatus.DRAFT,))
    _sellar(version)
    version.status = CaseVersionStatus.IN_REVIEW
    version.save(update_fields=['status', 'validated_at', 'definition_hash'])
    return version


@auditable('CASE_PUBLISHED', 'CASE_VERSION', resource_id_param_index=1)
@transaction.atomic
def publicar(admin, case_version_id):
    version = version_accesible(admin, case_version_id, 'publish', lock=True)
    permitidos = (CaseVersionStatus.IN_REVIEW,) if settings.REVIEW_WORKFLOW_STRICT else (CaseVersionStatus.IN_REVIEW, CaseVersionStatus.DRAFT)
    _exigir_estado(version, permitidos)
    if version.status == CaseVersionStatus.DRAFT or not version.validated_at or not version.definition_hash:
        _sellar(version)
    version.status = CaseVersionStatus.PUBLISHED
    version.published_at = timezone.now()
    version.save(update_fields=['status', 'published_at', 'validated_at', 'definition_hash'])
    return version


@auditable('CASE_ARCHIVED', 'CASE_VERSION', resource_id_param_index=1)
@transaction.atomic
def archivar(usuario, case_version_id):
    version = version_accesible(usuario, case_version_id, 'archive', lock=True)
    _exigir_estado(version, (CaseVersionStatus.PUBLISHED,))
    version.status = CaseVersionStatus.ARCHIVED
    version.save(update_fields=['status'])
    return version

