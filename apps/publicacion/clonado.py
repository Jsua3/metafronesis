from django.db import transaction

from apps.simulation.models import CaseVersion, DecisionOption, SimulationNode, SimulationRubricAssignment
from apps.simulation.services.audit_service import auditable
from .ciclo import _exigir_estado, version_accesible
from apps.simulation.models import CaseVersionStatus


def _valores(objeto, excluidos):
    return {campo.attname: getattr(objeto, campo.attname) for campo in objeto._meta.concrete_fields
            if not campo.primary_key and campo.name not in excluidos}


def _siguiente(version):
    mayor, menor, _ = version.semantic_version.split('.')
    ocupadas = set(version.simulation_case.versions.values_list('semantic_version', flat=True))
    menor = int(menor) + 1
    while f'{mayor}.{menor}.0' in ocupadas:
        menor += 1
    return f'{mayor}.{menor}.0'


def _copiar_arbol(original, clon):
    nodos = {}
    for nodo in original.nodes.all():
        copia = SimulationNode.objects.create(case_version=clon, **_valores(nodo, {'case_version'}))
        nodos[nodo.pk] = copia.pk
    for opcion in original.decisions.all():
        valores = _valores(opcion, {'case_version', 'source_node', 'target_node'})
        DecisionOption.objects.create(case_version=clon, source_node_id=nodos[opcion.source_node_id],
                                      target_node_id=nodos[opcion.target_node_id], **valores)


@auditable('CASE_VERSION_CLONED', 'CASE_VERSION', resource_id=lambda args, kwargs, result: result.pk)
@transaction.atomic
def clonar(usuario, case_version_id) -> CaseVersion:
    original = version_accesible(usuario, case_version_id, lock=True)
    _exigir_estado(original, (CaseVersionStatus.PUBLISHED, CaseVersionStatus.ARCHIVED))
    type(original.simulation_case).objects.select_for_update().get(pk=original.simulation_case_id)
    valores = _valores(original, {'semantic_version', 'status', 'cloned_from', 'published_at', 'validated_at',
                                  'definition_hash', 'reuse_ratio', 'created_by', 'created_at', 'version',
                                  'last_edited_by', 'edited_alone_since'})
    clon = CaseVersion.objects.create(**valores, semantic_version=_siguiente(original), cloned_from=original, created_by=usuario)
    _copiar_arbol(original, clon)
    for asignacion in original.rubric_assignments.filter(active=True):
        SimulationRubricAssignment.objects.create(case_version=clon, rubric=asignacion.rubric, assigned_by=usuario)
    return clon
