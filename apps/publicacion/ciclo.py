from django.http import Http404

from apps.simulation.models import CaseVersion
from shared.policies import can
from .arbol import arbol_de


def validar(usuario, case_version_id) -> list:
    version = CaseVersion.objects.select_related('simulation_case').filter(pk=case_version_id).first()
    if version is None or not can(usuario, 'case', 'author', owner_id=version.simulation_case.created_by_id):
        raise Http404
    return arbol_de(version).problemas()
