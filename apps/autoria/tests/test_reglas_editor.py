from decimal import Decimal

import pytest

from apps.simulation.models import CaseVersion, DecisionOption, SimulationNode
from apps.simulation.models.rubric import AuditLog, Competency, Rubric, RubricCriterion, SimulationRubricAssignment
from apps.simulation.models.world import DialogueLine, DialogueTree, MapObject, SceneMap
from .test_borrador import crear

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-22", "SIEP-23")]


def test_reglas_conservan_las_demas_y_rechazan_valores_invalidos(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    base = f"/api/authoring/cases/{version_id}/rules"
    hitos = [{"key": "escucha", "label": "Escucha"}]
    respuesta = cliente.put(f"{base}/milestones", {"milestones": hitos}, format="json")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["rules"]["milestones"][0]["key"] == "escucha"
    assert cliente.put(f"{base}/risk", {"riskLevel": "SEVERE"}, format="json").status_code == 200
    assert cliente.put(f"{base}/risk", {"riskLevel": "INVALIDO"}, format="json").status_code == 400
    final = {"key": "fin", "title": "Final", "message": "Mensaje", "when": {"milestone": "escucha"}}
    assert cliente.put(f"{base}/endings", {"endings": [final]}, format="json").status_code == 200
    assert cliente.put(f"{base}/milestones", {"milestones": []}, format="json").status_code == 400
    assert cliente.put(f"{base}/endings", {"endings": [{**final, "when": {"milestone": "ausente"}}]}, format="json").status_code == 400


def test_aceptar_nodo_respeta_propiedad_borrador_y_revision(cliente, usuarios, settings):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    nodo.ai_suggested = True
    nodo.save(update_fields=["ai_suggested"])
    ruta = f"/api/authoring/cases/{version_id}/nodes/{nodo.pk}/accept-ai"
    cliente.force_authenticate(usuarios[1])
    assert cliente.post(ruta, {"revision": 0}, format="json").status_code == 404
    cliente.force_authenticate(usuarios[2])
    assert cliente.post(ruta, {"revision": 0}, format="json").status_code == 403
    cliente.force_authenticate(usuarios[0])
    CaseVersion.objects.filter(pk=version_id).update(status="PUBLISHED")
    assert cliente.post(ruta, {"revision": 0}, format="json").status_code == 409
    CaseVersion.objects.filter(pk=version_id).update(status="DRAFT")
    assert cliente.post(ruta, {"revision": 0}, format="json").status_code == 200
    nodo.refresh_from_db()
    assert nodo.ai_suggested is False
    assert cliente.post(ruta, {"revision": 0}, format="json").data["code"] == "REVISION_CONFLICT"


@pytest.mark.parametrize("seccion,datos", [
    ("milestones", {"milestones": []}),
    ("risk", {"riskLevel": None}),
    ("endings", {"endings": []}),
    ("rubric", {"fromCompetencies": True}),
])
def test_operaciones_rechazan_rol_propiedad_borrador_y_revision(cliente, usuarios, settings, seccion, datos):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    ruta = f"/api/authoring/cases/{version_id}/" + (seccion if seccion == "rubric" else f"rules/{seccion}")
    metodo = cliente.post if seccion == "rubric" else cliente.put
    cliente.force_authenticate(usuarios[1])
    assert metodo(ruta, {**datos, "revision": 0}, format="json").status_code == 404
    cliente.force_authenticate(usuarios[2])
    assert metodo(ruta, {**datos, "revision": 0}, format="json").status_code == 403
    cliente.force_authenticate(usuarios[0])
    CaseVersion.objects.filter(pk=version_id).update(status="PUBLISHED")
    assert metodo(ruta, {**datos, "revision": 0}, format="json").status_code == 409
    CaseVersion.objects.filter(pk=version_id).update(status="DRAFT")
    assert metodo(ruta, {**datos, "revision": 99}, format="json").data["code"] == "REVISION_CONFLICT"


def test_aceptaciones_de_decision_dialogo_y_objeto_auditan_y_aislan_versiones(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    otra_id = crear(cliente, "OTRA").data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    mapa = SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    decision = DecisionOption.objects.create(case_version_id=version_id, source_node=nodo, target_node=nodo, option_key="decision", text="Decisión", response_class="RECOMMENDED", ai_suggested=True)
    objeto = MapObject.objects.create(scene_map=mapa, object_key="objeto", label="Objeto", object_type="OBJECT", ai_suggested=True)
    dialogo = DialogueTree.objects.create(scene_map=mapa, tree_key="dialogo", speaker_name="Ana")
    linea = DialogueLine.objects.create(dialogue_tree=dialogo, speaker_name="Ana", text="Hola", ai_suggested=True)
    for tipo, elemento, accion in (("decisions", decision, "ADMIN_ACCEPT_AI_DECISION"), ("objects", objeto, "ADMIN_ACCEPT_AI_OBJECT"), ("dialogues", dialogo, "ADMIN_ACCEPT_AI_DIALOGUE")):
        ruta = f"/api/authoring/cases/{version_id}/{tipo}/{elemento.pk}/accept-ai"
        assert cliente.post(ruta.replace(f"cases/{version_id}/", f"cases/{otra_id}/"), {}, format="json").status_code == 404
        respuesta = cliente.post(ruta, {}, format="json")
        assert respuesta.status_code == 200 and respuesta.data["success"] is True
        assert AuditLog.objects.filter(action=accion, resource_id=str(version_id)).exists()
    decision.refresh_from_db()
    objeto.refresh_from_db()
    linea.refresh_from_db()
    assert not decision.ai_suggested and not objeto.ai_suggested and not linea.ai_suggested


def test_adopcion_copia_rubrica_y_asigna_la_copia(cliente, usuarios):
    version_id = crear(cliente).data["data"]["versionId"]
    fuente = Rubric.objects.create(name="Plantilla", created_by=usuarios[0])
    RubricCriterion.objects.create(rubric=fuente, competency="ESCUCHA", title="Escucha", weight=Decimal("100"))
    respuesta = cliente.post(f"/api/authoring/cases/{version_id}/rubric", {"rubricId": fuente.pk}, format="json")
    assert respuesta.status_code == 200
    copia_id = respuesta.data["data"]["rubrics"][0]["rubricId"]
    assert copia_id != fuente.pk
    assert SimulationRubricAssignment.objects.get(case_version_id=version_id, active=True).rubric_id == copia_id
    fuente.criteria.update(title="Cambio posterior")
    assert Rubric.objects.get(pk=copia_id).criteria.get().title == "Escucha"



def test_rubrica_desde_catalogo_y_visibilidad(cliente, usuarios):
    version_id = crear(cliente).data["data"]["versionId"]
    ruta = f"/api/authoring/cases/{version_id}/rubric"
    assert cliente.post(ruta, {"fromCompetencies": True}, format="json").status_code == 400
    for codigo in ("UNO", "DOS", "TRES"):
        Competency.objects.create(code=codigo, name=codigo)
    respuesta = cliente.post(ruta, {"fromCompetencies": True}, format="json")
    assert respuesta.status_code == 200
    criterios = respuesta.data["data"]["rubrics"][0]["criteria"]
    assert sum(Decimal(str(criterio["weight"])) for criterio in criterios) == Decimal("100")
    ajena = Rubric.objects.create(name="Privada", created_by=usuarios[1])
    assert cliente.post(ruta, {"rubricId": ajena.pk}, format="json").status_code == 404
    assert cliente.post(ruta, {"rubricId": ajena.pk, "fromCompetencies": True}, format="json").status_code == 400


def test_finales_conservan_marca_y_rechazan_campos_desconocidos(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    ruta = f"/api/authoring/cases/{version_id}/rules/endings"
    final = {"key": "fin", "title": "Final", "message": "Mensaje", "aiSuggested": True}
    assert cliente.put(ruta, {"endings": [final]}, format="json").status_code == 200
    del final["aiSuggested"]
    respuesta = cliente.put(ruta, {"endings": [final]}, format="json")
    assert respuesta.data["data"]["rules"]["endings"][0]["aiSuggested"] is True
    assert cliente.put(ruta, {"endings": [{**final, "otro": 1}]}, format="json").status_code == 400
    final["aiSuggested"] = False
    respuesta = cliente.put(ruta, {"endings": [final]}, format="json")
    assert respuesta.data["data"]["rules"]["endings"][0]["aiSuggested"] is False



def test_reglas_toleran_finales_guardados_invalidos(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    CaseVersion.objects.filter(pk=version_id).update(rules='{"endings": null, "milestones": [{"key": "hito", "label": "Hito"}]}')
    base = f"/api/authoring/cases/{version_id}/rules"
    assert cliente.put(f"{base}/milestones", {"milestones": []}, format="json").status_code == 200
    assert cliente.put(f"{base}/endings", {"endings": []}, format="json").status_code == 200
