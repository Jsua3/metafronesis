import pytest
from django.core.exceptions import ValidationError

from apps.simulation.models import (CaseCharacter, CaseVersion, DialogueChoice, DialogueTree, MapObject, SceneMap,
                                   SimulationNode)


pytestmark = [pytest.mark.django_db, pytest.mark.req("RF-07")]


def test_objeto_rechaza_personaje_de_otra_version(scene):
    otra_version = CaseVersion.objects.create(
        simulation_case=scene["case"], semantic_version="2.0.0", created_by=scene["teacher"]
    )
    personaje = CaseCharacter.objects.create(
        case_version=otra_version, character_key="persona", display_name="Persona"
    )
    mapa = SceneMap.objects.create(
        case_version=scene["version"], node=scene["node"], map_key="sala", title="Sala"
    )
    objeto = MapObject(scene_map=mapa, object_key="persona", label="Persona", object_type="PERSON", character=personaje)
    with pytest.raises(ValidationError) as error:
        objeto.full_clean()
    assert "character" in error.value.message_dict


def test_mapa_rechaza_nodo_de_otra_version(scene):
    otra_version = CaseVersion.objects.create(
        simulation_case=scene["case"], semantic_version="2.0.0", created_by=scene["teacher"]
    )
    nodo = SimulationNode.objects.create(case_version=otra_version, node_key="otro", title="Otro", narrative="Otra escena")
    mapa = SceneMap(case_version=scene["version"], node=nodo, map_key="sala", title="Sala")
    with pytest.raises(ValidationError) as error:
        mapa.full_clean()
    assert "node" in error.value.message_dict


def test_objeto_rechaza_opcion_de_otra_version(scene):
    otra_version = CaseVersion.objects.create(
        simulation_case=scene["case"], semantic_version="2.0.0", created_by=scene["teacher"]
    )
    nodo = SimulationNode.objects.create(case_version=otra_version, node_key="otro", title="Otro", narrative="Escena")
    mapa = SceneMap.objects.create(case_version=otra_version, node=nodo, map_key="sala", title="Sala")
    objeto = MapObject(scene_map=mapa, object_key="objeto", label="Objeto", object_type="OBJECT",
                       decision_option=scene["option"])
    with pytest.raises(ValidationError) as error:
        objeto.full_clean()
    assert "decision_option" in error.value.message_dict



def test_objeto_valido_acepta_los_campos_opcionales_vacios(scene):
    mapa = SceneMap.objects.create(
        case_version=scene["version"], node=scene["node"], map_key="sala", title="Sala"
    )
    objeto = MapObject(scene_map=mapa, object_key="objeto", label="Objeto", object_type="OBJECT")
    objeto.full_clean()


def test_dialogo_rechaza_objeto_de_otra_sala(scene):
    sala = SceneMap.objects.create(case_version=scene["version"], node=scene["node"], map_key="sala", title="Sala")
    otro_nodo = SimulationNode.objects.create(case_version=scene["version"], node_key="pasillo", title="Pasillo",
                                              narrative="Otra escena")
    pasillo = SceneMap.objects.create(case_version=scene["version"], node=otro_nodo, map_key="pasillo", title="Pasillo")
    persona = MapObject.objects.create(scene_map=pasillo, object_key="persona", label="Persona", object_type="PERSON")
    dialogo = DialogueTree(scene_map=sala, map_object=persona, tree_key="saludo", speaker_name="Persona")
    with pytest.raises(ValidationError) as error:
        dialogo.full_clean()
    assert "map_object" in error.value.message_dict


def test_opcion_de_dialogo_rechaza_decision_de_otra_version(scene):
    otra_version = CaseVersion.objects.create(
        simulation_case=scene["case"], semantic_version="2.0.0", created_by=scene["teacher"]
    )
    nodo = SimulationNode.objects.create(case_version=otra_version, node_key="otro", title="Otro", narrative="Escena")
    sala = SceneMap.objects.create(case_version=otra_version, node=nodo, map_key="sala", title="Sala")
    dialogo = DialogueTree.objects.create(scene_map=sala, tree_key="saludo", speaker_name="Persona")
    eleccion = DialogueChoice(dialogue_tree=dialogo, choice_key="preguntar", text="Preguntar",
                              decision_option=scene["option"])
    with pytest.raises(ValidationError) as error:
        eleccion.full_clean()
    assert "decision_option" in error.value.message_dict
