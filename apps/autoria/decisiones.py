import json

from django.db import transaction
from django.shortcuts import get_object_or_404

from apps.simulation.models import CaseCharacter, DecisionOption
from apps.simulation.services import case_rules
from apps.simulation.models.vocabulary import ResponseClass
from apps.simulation.services.audit_service import auditable
from shared.exceptions import ApiError
from . import contenido, ensayo, guardas, servicios


def _aplicar(version, decision, datos):
    clase = datos.get("responseClass", decision.response_class)
    if clase not in {opcion.value for opcion in ResponseClass}:
        raise ApiError("VALIDATION_ERROR", "La clase de respuesta no es válida.", 400)
    origen = datos.get("sourceNodeId", decision.source_node_id)
    destino = datos.get("targetNodeId", decision.target_node_id)
    if version.nodes.filter(pk__in={origen, destino}).count() != len({origen, destino}):
        raise ApiError("NODE_NOT_IN_VERSION", "La escena no pertenece a la versión.", 400)
    if origen == destino:
        raise ApiError("DECISION_LOOP", "La decisión no puede volver a su origen.", 400)
    decision.source_node_id, decision.target_node_id = origen, destino
    for clave, campo in (("text", "text"), ("responseClass", "response_class"),
                         ("feedback", "feedback_text"), ("theoryBasis", "theory_basis")):
        if clave in datos:
            setattr(decision, campo, datos[clave])
    if "prohibitionReason" in datos:
        decision.prohibition_reason = contenido.texto_plano(datos["prohibitionReason"], "prohibitionReason", contenido.MAX_TEXTO_DECISION, multilinea=True) or None
    if "immediateFeedback" in datos:
        decision.immediate_feedback = contenido.texto_plano(datos["immediateFeedback"], "immediateFeedback", contenido.MAX_TEXTO_DECISION, multilinea=True)
    if "consequenceText" in datos:
        decision.consequence_text = contenido.texto_plano(datos["consequenceText"], "consequenceText", contenido.MAX_TEXTO_DECISION, multilinea=True) or None
    if "effects" in datos:
        hitos = {hito.key for hito in case_rules.rules_of(version).milestones}
        decision.effects = json.dumps(case_rules.validate_effects(datos["effects"], hitos), ensure_ascii=False)
    if "requires" in datos:
        decision.requires_json = json.dumps(contenido.requisito(datos["requires"]), ensure_ascii=False)
    if "reaction" in datos:
        personajes = set(CaseCharacter.objects.filter(case_version=version).values_list("character_key", flat=True))
        decision.reaction_json = json.dumps(contenido.reaccion(datos["reaction"], personajes), ensure_ascii=False)
    decision.save()


@auditable("DECISION_CREATED", "CASE", resource_id_param_index=1)
@transaction.atomic
def crear(usuario, case_version_id, datos, revision):
    version = guardas.version_editable(usuario, case_version_id)
    guardas.exigir_revision(version, revision)
    numero = 1
    while version.decisions.filter(option_key=f"decision-{numero}").exists():
        numero += 1
    decision = DecisionOption(case_version=version, option_key=f"decision-{numero}")
    _aplicar(version, decision, datos)
    guardas.tocar(version, usuario)
    return servicios._decision(decision)


@auditable("DECISION_UPDATED", "CASE", resource_id_param_index=1)
@transaction.atomic
def actualizar(usuario, case_version_id, decision_id, datos, revision):
    version = guardas.version_editable(usuario, case_version_id)
    guardas.exigir_revision(version, revision)
    decision = get_object_or_404(DecisionOption, case_version=version, pk=decision_id)
    _aplicar(version, decision, datos)
    guardas.tocar(version, usuario)
    return servicios._decision(decision)


@auditable("DECISION_DELETED", "CASE", resource_id_param_index=1)
@transaction.atomic
def borrar(usuario, case_version_id, decision_id, revision):
    version = guardas.version_editable(usuario, case_version_id)
    guardas.exigir_revision(version, revision)
    opcion = get_object_or_404(DecisionOption, case_version=version, pk=decision_id)
    ensayo.descartar_de_version(version.pk)
    opcion.delete()
    guardas.tocar(version, usuario)
