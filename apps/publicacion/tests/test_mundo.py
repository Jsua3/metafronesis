import pytest

from apps.publicacion.huella import huella_de
from apps.simulation.models import CaseCharacter, MapObject, SceneMap


pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-26")]


def test_clonado_conserva_mundo_y_remapea_relaciones(caso):
    version = caso["version"]
    mapa = SceneMap.objects.create(case_version=version, node=caso["inicio"], map_key="sala", title="Sala")
    personaje = CaseCharacter.objects.create(case_version=version, character_key="p", display_name="Persona")
    MapObject.objects.create(scene_map=mapa, object_key="p", label="Persona", object_type="PERSON",
                             character=personaje, decision_option=caso["opciones"][0])
    version.status = "PUBLISHED"
    version.save()
    respuesta = caso["cliente"].post(f"/api/authoring/cases/{version.pk}/clone-version", {}, format="json")
    assert respuesta.status_code == 201
    copia = SceneMap.objects.get(case_version_id=respuesta.data["data"]["versionId"])
    objeto = copia.map_objects.get()
    assert copia.node.case_version_id == copia.case_version_id
    assert objeto.character.case_version_id == copia.case_version_id
    assert objeto.decision_option.case_version_id == copia.case_version_id


def test_huella_cambia_al_modificar_el_mundo(caso):
    version = caso["version"]
    mapa = SceneMap.objects.create(case_version=version, node=caso["inicio"], map_key="sala", title="Sala")
    antes = huella_de(version)
    mapa.title = "Otra sala"
    mapa.save()
    assert huella_de(version) != antes


def test_clonado_preserva_huella_y_todos_los_elementos_del_mundo(caso):
    from apps.simulation.models import ClinicalTool, CollisionZone, DialogueChoice, DialogueLine, DialogueTree, SceneHint

    version = caso["version"]
    mapa = SceneMap.objects.create(case_version=version, node=caso["inicio"], map_key="sala", title="Sala")
    personaje = CaseCharacter.objects.create(case_version=version, character_key="p", display_name="Persona")
    objeto = MapObject.objects.create(scene_map=mapa, object_key="p", label="Persona", object_type="PERSON",
                                      character=personaje, decision_option=caso["opciones"][0])
    ClinicalTool.objects.create(case_version=version, tool_code="PAP", label="Herramienta")
    SceneHint.objects.create(scene_map=mapa, hint_order=1, text="Pista")
    CollisionZone.objects.create(scene_map=mapa, zone_key="pared")
    árbol = DialogueTree.objects.create(scene_map=mapa, map_object=objeto, tree_key="diálogo", speaker_name="Persona")
    DialogueLine.objects.create(dialogue_tree=árbol, display_order=1, speaker_name="Persona", text="Hola")
    DialogueChoice.objects.create(dialogue_tree=árbol, choice_key="elección", text="Seguir", decision_option=caso["opciones"][0])
    huella = huella_de(version)
    version.status = "PUBLISHED"
    version.save()
    respuesta = caso["cliente"].post(f"/api/authoring/cases/{version.pk}/clone-version", {}, format="json")
    assert respuesta.status_code == 201
    copia = version.simulation_case.versions.get(pk=respuesta.data["data"]["versionId"])
    assert huella_de(copia) == huella
    sala = copia.scene_maps.get()
    assert sala.hints.count() == sala.collision_zones.count() == copia.clinical_tools.count() == 1
    diálogo = sala.dialogue_trees.get()
    assert diálogo.map_object.scene_map == sala
    assert diálogo.lines.get().text == "Hola"
    assert diálogo.choices.get().decision_option.case_version == copia
