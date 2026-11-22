from django.db import transaction

from apps.simulation.models import (CaseCharacter, CaseVersion, CaseVersionStatus, ClinicalTool, CollisionZone,
                                    DecisionOption, DialogueChoice, DialogueLine, DialogueTree, MapObject,
                                    SceneHint, SceneMap, SimulationNode, SimulationRubricAssignment)
from apps.simulation.services.audit_service import auditable
from .ciclo import _exigir_estado, version_accesible


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
    opciones = {}
    for opcion in original.decisions.all():
        valores = _valores(opcion, {'case_version', 'source_node', 'target_node'})
        copia = DecisionOption.objects.create(case_version=clon, source_node_id=nodos[opcion.source_node_id],
                                              target_node_id=nodos[opcion.target_node_id], **valores)
        opciones[opcion.pk] = copia.pk
    personajes = {}
    for personaje in original.characters.all():
        copia = CaseCharacter.objects.create(case_version=clon, **_valores(personaje, {'case_version'}))
        personajes[personaje.pk] = copia.pk
    for herramienta in original.clinical_tools.all():
        ClinicalTool.objects.create(case_version=clon, **_valores(herramienta, {'case_version'}))
    for mapa in original.scene_maps.all():
        copia_mapa = SceneMap.objects.create(case_version=clon, node_id=nodos[mapa.node_id],
                                             **_valores(mapa, {'case_version', 'node', 'created_at', 'updated_at'}))
        for pista in mapa.hints.all():
            SceneHint.objects.create(scene_map=copia_mapa, **_valores(pista, {'scene_map'}))
        for zona in mapa.collision_zones.all():
            CollisionZone.objects.create(scene_map=copia_mapa, **_valores(zona, {'scene_map'}))
        objetos = {}
        for objeto in mapa.map_objects.all():
            copia = MapObject.objects.create(scene_map=copia_mapa,
                decision_option_id=opciones[objeto.decision_option_id] if objeto.decision_option_id else None,
                character_id=personajes[objeto.character_id] if objeto.character_id else None,
                **_valores(objeto, {'scene_map', 'decision_option', 'character', 'created_at', 'updated_at'}))
            objetos[objeto.pk] = copia.pk
        for arbol in mapa.dialogue_trees.all():
            copia = DialogueTree.objects.create(scene_map=copia_mapa,
                map_object_id=objetos[arbol.map_object_id] if arbol.map_object_id else None,
                **_valores(arbol, {'scene_map', 'map_object', 'created_at'}))
            for linea in arbol.lines.all():
                DialogueLine.objects.create(dialogue_tree=copia, **_valores(linea, {'dialogue_tree'}))
            for eleccion in arbol.choices.all():
                DialogueChoice.objects.create(dialogue_tree=copia,
                    decision_option_id=opciones[eleccion.decision_option_id] if eleccion.decision_option_id else None,
                    **_valores(eleccion, {'dialogue_tree', 'decision_option'}))


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
