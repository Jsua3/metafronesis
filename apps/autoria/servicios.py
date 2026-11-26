import json
from django.db import transaction
from django.db.models import Prefetch
from django.http import Http404
from apps.biblioteca.services import copiar_al_caso, lugares
from apps.simulation.models import DecisionOption, SimulationNode
from shared.jsonutils import read_map, read_string_list
from apps.simulation.services.audit_service import auditable
from apps.simulation.services.portadas import datos_portada
from apps.users.permisos import exigir_autoria, puede_autorar
from .constructor import ConstructorDeBorrador
from . import autoria, contenido, guardas


def ficha(version):
    caso = version.simulation_case
    return {"code": caso.code, "title": caso.title, "description": caso.description,
        "narrativeContext": version.narrative_context, "learningObjectives": json.loads(version.learning_objectives),
        "estimatedMinutes": version.estimated_minutes, "contentWarnings": read_string_list(version.content_warnings),
        **datos_portada(version)}


def resumen(version):
    return {"versionId": version.pk, "status": version.status, "revision": version.version, "brief": ficha(version)}


@auditable("CASE_CREATED", "CASE", resource_id=lambda args, kwargs, result: result.pk)
@transaction.atomic
def crear_borrador(autor, datos: dict):
    exigir_autoria(autor)
    constructor = (ConstructorDeBorrador(autor).con_ficha(datos["code"], datos["title"], datos.get("description", ""))
        .con_contexto(datos.get("narrativeContext", "")).con_objetivos(datos.get("learningObjectives", []))
        .con_tiempo_estimado(datos.get("estimatedMinutes"))
        .con_advertencias(contenido.advertencias(datos.get("contentWarnings"))))
    if "lugarId" in datos:
        # El lugar y las salas se comprueban antes de crear nada: 404 si el lugar no está en la biblioteca, 400 si las salas no sirven.
        lugar = lugares.cargar_lugar(datos["lugarId"], por_piezas=bool(datos.get("porPiezas")))
        constructor.con_lugar(lugar, copiar_al_caso.validar_salas(lugar, datos.get("salas")))
    return constructor.construir()


def fila(usuario, version, editores, autoriza) -> dict:
    """Una fila de la lista de casos: el resumen, el autor, quién más lo editó y lo que quien pide puede hacer con ella
    (la interfaz no repite las reglas de ``autoria.py``)."""
    caso = version.simulation_case
    return {**resumen(version), "caseId": caso.pk, "semanticVersion": version.semantic_version,
            "autor": autoria.persona(caso.created_by), "editadoPor": editores.get(caso.pk, []),
            "puedeEditar": autoria.puede_editar(usuario, version),
            "puedeCrearVersion": autoria.puede_crear_version(usuario, version, autoriza)}


def listar(usuario) -> list[dict]:
    versiones = list(guardas.versiones_visibles(usuario).select_related("simulation_case__created_by").order_by("pk"))
    editores = autoria.editores_por_caso(v.simulation_case_id for v in versiones)
    autoriza = puede_autorar(usuario)
    return [fila(usuario, v, editores, autoriza) for v in versiones]


def _decision(opcion):
    return {"id": opcion.pk, "key": opcion.option_key, "text": opcion.text,
        "responseClass": opcion.response_class, "feedback": opcion.feedback_text,
        "theoryBasis": opcion.theory_basis, "targetNodeId": opcion.target_node_id,
        "prohibitionReason": opcion.prohibition_reason, "immediateFeedback": opcion.immediate_feedback,
        "consequenceText": opcion.consequence_text, "effects": read_map(opcion.effects),
        "requires": read_map(opcion.requires_json), "reaction": read_map(opcion.reaction_json)}


def _nodo(nodo):
    return {"id": nodo.pk, "key": nodo.node_key, "title": nodo.title, "narrative": nodo.narrative,
        "question": nodo.decision_prompt, "start": nodo.start_node, "terminal": nodo.terminal_node,
        "order": nodo.display_order, "supportResources": read_string_list(nodo.support_resources_json),
        "requiredTools": read_string_list(nodo.required_tools_json), "sensitiveContent": nodo.sensitive_content,
        "safeExitRequired": nodo.safe_exit_required, "warningMessage": nodo.warning_message,
        "positionX": nodo.position_x, "positionY": nodo.position_y, "intensity": nodo.intensity,
        "comments": read_string_list(nodo.comments_json), "decisions": [_decision(o) for o in nodo.options.all()]}


def definicion(usuario, case_version_id) -> dict:
    nodos = SimulationNode.objects.order_by("display_order", "pk").prefetch_related(
        Prefetch("options", queryset=DecisionOption.objects.order_by("pk")))
    try:
        version = guardas.versiones_visibles(usuario).prefetch_related(Prefetch("nodes", queryset=nodos)).get(pk=case_version_id)
    except guardas.CaseVersion.DoesNotExist:
        raise Http404 from None
    return {**resumen(version), "nodes": [_nodo(nodo) for nodo in version.nodes.all()]}


@auditable("CASE_BRIEF_UPDATED", "CASE", resource_id_param_index=1)
@transaction.atomic
def actualizar_ficha(usuario, case_version_id, datos, revision) -> dict:
    version = guardas.version_editable(usuario, case_version_id)
    guardas.exigir_revision(version, revision)
    caso = version.simulation_case
    for campo in ("code", "title", "description"):
        if campo in datos:
            setattr(caso, campo, datos[campo])
    if "code" in datos and type(caso).objects.filter(code=caso.code).exclude(pk=caso.pk).exists():
        from shared.exceptions import ApiError
        raise ApiError("CASE_CODE_TAKEN", "El código ya está en uso.", 409)
    caso.save(update_fields=[campo for campo in ("code", "title", "description") if campo in datos] + ["updated_at"])
    for clave, campo in (("narrativeContext", "narrative_context"), ("estimatedMinutes", "estimated_minutes")):
        if clave in datos:
            setattr(version, campo, datos[clave])
    if "learningObjectives" in datos:
        version.learning_objectives = json.dumps(datos["learningObjectives"], ensure_ascii=False)
    if "contentWarnings" in datos:
        version.content_warnings = json.dumps(contenido.advertencias(datos["contentWarnings"]), ensure_ascii=False)
    version.save(update_fields=["narrative_context", "estimated_minutes", "learning_objectives", "content_warnings"])
    guardas.tocar(version, usuario)
    return resumen(version)
