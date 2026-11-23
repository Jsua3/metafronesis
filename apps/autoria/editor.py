"""Lectura del editor y lista de publicación."""
from django.conf import settings
from django.db import transaction
from django.http import Http404
from django.utils import timezone

from apps.simulation.models import CaseReview, PublicationChecklist, PublicationChecklistItem
from apps.simulation.models.world import CaseCharacter, ClinicalTool, MapObject, SceneHint, SceneMap
from apps.simulation.services import case_rules
from apps.simulation.services.audit_service import auditable
from apps.users.permisos import exigir_autoria
from shared.jsonutils import read_map, read_string_list
from . import guardas

ITEMS = (
    ("contentOriginal", "Contenido original — sin copiar personajes, mapas ni narrativa comercial.", "author"),
    ("ethicsReviewed", "Revisión ética — caso validado por experto o comité.", "constancia"),
    ("safetyProtocols", "Protocolos de seguridad — ruta VBG, NNA y salida segura incluidos.", "system"),
    ("noStigmatizing", "Sin lenguaje estigmatizante ni estereotipos clínicos.", "author"),
    ("triggerWarnings", "Advertencias de contenido sensible configuradas en nodos.", "system"),
    ("accessibilityOk", "Accesibilidad — fallback accesible y controles táctiles probados.", "author"),
    ("scopeEducational", "El caso declara su alcance educativo: es un ejercicio formativo, no un diagnóstico ni una intervención clínica real.", "author"),
)
ETIQUETAS = {"author": "Declaración de quien autora el caso", "system": "Lo comprueba el sistema", "constancia": "Lo respalda la constancia de Psicología"}


def version_visible(usuario, version_id):
    exigir_autoria(usuario)
    try:
        return guardas.versiones_visibles(usuario).get(pk=version_id)
    except guardas.CaseVersion.DoesNotExist:
        raise Http404 from None


def lista(version, nodos):
    estricta = settings.REVIEW_WORKFLOW_STRICT
    ultima = version.checklists.prefetch_related("items").order_by("-submitted_at", "-id").first()
    marcados = {item.code for item in ultima.items.all() if item.fulfilled} if ultima else set()
    revision = CaseReview.objects.filter(case_version=version, content_reference__isnull=False).order_by("-id").first()
    constancia = {"fulfilled": bool(revision)}
    if revision:
        constancia.update(reviewer=revision.content_reviewer, reviewedOn=revision.content_reviewed_on.isoformat() if revision.content_reviewed_on else None, reference=revision.content_reference)
    respaldo = {"safetyProtocols": any(any(isinstance(recurso, str) and recurso.strip() for recurso in read_string_list(nodo.support_resources_json)) for nodo in nodos), "triggerWarnings": bool(str(settings.SIEP_CONTENT_NOTICE_VERSION or "").strip()), "ethicsReviewed": bool(revision)}
    elementos = []
    for codigo, etiqueta, fuente in ITEMS:
        if fuente == "constancia" and not estricta:
            fuente = "author"
        elementos.append({"code": codigo, "label": etiqueta, "required": estricta or codigo != "scopeEducational", "fulfilled": codigo in marcados, "draft": codigo == "scopeEducational", "backing": fuente, "backed": respaldo.get(codigo) if fuente != "author" else None, "backingLabel": ETIQUETAS[fuente]})
    requeridos = [elemento for elemento in elementos if elemento["required"]]
    porcentaje = round(sum(elemento["fulfilled"] for elemento in requeridos) * 100 / len(requeridos))
    if ultima and not ultima.items.all():
        porcentaje = min(int(ultima.completion_ratio), round(600 / 7)) if estricta else int(ultima.completion_ratio)
    return {"items": elementos, "contentReview": constancia, "strict": estricta}, porcentaje


def editor(usuario, version_id):
    return vista(version_visible(usuario, version_id))


def vista(version):
    """La vista del editor de una versión ya autorizada (la usa también el 409 de revisión vencida)."""
    nodos = list(version.nodes.order_by("id"))
    decisiones = version.decisions.select_related("source_node", "target_node").order_by("id")
    mapas = list(SceneMap.objects.filter(case_version=version).select_related("node").order_by("id"))
    objetos = MapObject.objects.filter(scene_map__case_version=version).order_by("id")
    reglas = case_rules.rules_of(version)
    checklist, porcentaje = lista(version, nodos)
    return {
        "caseVersionId": version.pk, "revision": version.version, "title": version.simulation_case.title,
        "semanticVersion": version.semantic_version, "status": version.status, "context": version.narrative_context or "",
        "learningObjectives": read_string_list(version.learning_objectives), "contentWarnings": read_string_list(version.content_warnings), "rehearsedToEnd": False,
        "rules": {"milestones": [{"key": hito.key, "label": hito.label, "description": hito.description, "decisive": hito.decisive} for hito in reglas.milestones], "riskLevel": reglas.risk_level.value if reglas.risk_level else None, "endings": list(reglas.endings)},
        "nodes": [{"id": nodo.pk, "key": nodo.node_key, "title": nodo.title, "narrative": nodo.narrative, "supportResources": read_string_list(nodo.support_resources_json), "requiredTools": read_string_list(nodo.required_tools_json), "sensitiveContent": nodo.sensitive_content, "safeExitRequired": nodo.safe_exit_required, "warningMessage": nodo.warning_message, "terminal": nodo.terminal_node, "startNode": nodo.start_node, "positionX": nodo.position_x, "positionY": nodo.position_y, "decisionPrompt": nodo.decision_prompt, "goal": nodo.goal, "comments": read_string_list(nodo.comments_json), "displayOrder": nodo.display_order, "intensity": nodo.intensity, "aiSuggested": nodo.ai_suggested} for nodo in nodos],
        "decisions": [{"id": decision.pk, "optionKey": decision.option_key, "sourceNodeId": decision.source_node_id, "sourceKey": decision.source_node.node_key, "targetNodeId": decision.target_node_id, "targetKey": decision.target_node.node_key, "text": decision.text, "responseClass": decision.response_class, "prohibitedConduct": decision.response_class == "CONTRAINDICATED", "prohibitionReason": decision.prohibition_reason, "immediateFeedback": decision.immediate_feedback, "consequenceText": decision.consequence_text, "theoryBasis": decision.theory_basis, "feedbackText": decision.feedback_text, "effects": read_map(decision.effects), "requires": read_map(decision.requires_json), "reaction": read_map(decision.reaction_json), "aiSuggested": decision.ai_suggested} for decision in decisiones],
        "maps": [{"id": mapa.pk, "key": mapa.map_key, "title": mapa.title, "width": mapa.width, "height": mapa.height, "theme": mapa.theme, "spawnX": mapa.spawn_x, "spawnY": mapa.spawn_y, "nodeId": mapa.node_id, "nodeKey": mapa.node.node_key} for mapa in mapas],
        "objects": [{"id": objeto.pk, "key": objeto.object_key, "label": objeto.label, "type": objeto.object_type, "x": objeto.position_x, "y": objeto.position_y, "width": objeto.width, "height": objeto.height, "colorHex": objeto.color_hex, "icon": objeto.icon, "shortCode": objeto.short_code, "collision": objeto.collision, "visible": objeto.visible, "interactionPrompt": objeto.interaction_prompt, "interactionText": objeto.interaction_text, "decisionOptionId": objeto.decision_option_id, "characterId": objeto.character_id, "toolCode": objeto.tool_code, "mapId": objeto.scene_map_id, "aiSuggested": objeto.ai_suggested} for objeto in objetos],
        "tools": [{"id": herramienta.pk, "code": herramienta.tool_code, "label": herramienta.label, "icon": herramienta.icon, "category": herramienta.category, "description": herramienta.description, "active": herramienta.active} for herramienta in ClinicalTool.objects.filter(case_version=version).order_by("id")],
        "hints": [{"id": pista.pk, "mapId": pista.scene_map_id, "order": pista.hint_order, "text": pista.text} for pista in SceneHint.objects.filter(scene_map__case_version=version).order_by("scene_map_id", "hint_order", "id")],
        "characters": [{"id": personaje.pk, "key": personaje.character_key, "displayName": personaje.display_name, "roleLabel": personaje.role_label, "portraitKey": personaje.portrait_key, "showInBrief": personaje.show_in_brief, "displayOrder": personaje.display_order} for personaje in CaseCharacter.objects.filter(case_version=version).order_by("display_order", "id")],
        "rubrics": [rubrica_editor(rubrica) for rubrica in version.rubrics.filter(active=True).prefetch_related("criteria").order_by("id")], "checklistCompletion": porcentaje, "publishable": porcentaje >= 100, "checklist": checklist,
    }


def rubrica_editor(rubrica):
    return {
        "rubricId": rubrica.pk, "rubricName": rubrica.name, "description": rubrica.description,
        "criteria": [{"id": criterio.pk, "competency": criterio.competency, "title": criterio.title,
                      "description": criterio.description, "displayOrder": criterio.display_order,
                      "weight": float(criterio.weight or criterio.max_score), "active": criterio.active,
                      "levelDescriptors": {}} for criterio in rubrica.criteria.all()],
        "scores": [], "comment": None,
    }


@auditable("ADMIN_CHECKLIST_UPDATE", "CASE_VERSION", resource_id_param_index=1)
@transaction.atomic
def actualizar_checklist(usuario, version_id, datos):
    version = guardas.version_editable(usuario, version_id)
    guardas.exigir_revision(version, datos.get("revision"))
    estricta = settings.REVIEW_WORKFLOW_STRICT
    requeridos = [codigo for codigo, _, _ in ITEMS if estricta or codigo != "scopeEducational"]
    porcentaje = round(sum(datos.get(codigo, False) for codigo in requeridos) * 100 / len(requeridos))
    checklist = PublicationChecklist.objects.create(case_version=version, submitted_by=usuario, completion_ratio=porcentaje, status="COMPLETE" if porcentaje == 100 else "PENDING", completed_at=timezone.now() if porcentaje == 100 else None)
    PublicationChecklistItem.objects.bulk_create([PublicationChecklistItem(checklist=checklist, code=codigo, label=etiqueta, required=codigo in requeridos, fulfilled=datos.get(codigo, False)) for codigo, etiqueta, _ in ITEMS])
    guardas.tocar(version, usuario)
    return vista(version)
