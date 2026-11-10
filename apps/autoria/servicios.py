import json
from django.db import transaction
from django.db.models import Prefetch
from django.http import Http404
from apps.simulation.models import DecisionOption, SimulationNode
from apps.simulation.services.audit_service import auditable
from apps.users.permisos import exigir_autoria
from .constructor import ConstructorDeBorrador
from . import guardas


def ficha(version):
    caso = version.simulation_case
    return {"code": caso.code, "title": caso.title, "description": caso.description,
        "narrativeContext": version.narrative_context, "learningObjectives": json.loads(version.learning_objectives),
        "estimatedMinutes": version.estimated_minutes}


def resumen(version):
    return {"versionId": version.pk, "status": version.status, "revision": version.version, "brief": ficha(version)}


@auditable("CASE_CREATED", "CASE", resource_id=lambda args, kwargs, result: result.pk)
@transaction.atomic
def crear_borrador(autor, datos: dict):
    exigir_autoria(autor)
    return (ConstructorDeBorrador(autor).con_ficha(datos["code"], datos["title"], datos.get("description", ""))
        .con_contexto(datos.get("narrativeContext", "")).con_objetivos(datos.get("learningObjectives", []))
        .con_tiempo_estimado(datos.get("estimatedMinutes")).construir())


def listar(usuario) -> list[dict]:
    return [resumen(v) for v in guardas.versiones_visibles(usuario).order_by("pk")]


def _decision(opcion):
    return {"id": opcion.pk, "key": opcion.option_key, "text": opcion.text,
        "responseClass": opcion.response_class, "feedback": opcion.feedback_text,
        "theoryBasis": opcion.theory_basis, "targetNodeId": opcion.target_node_id}


def _nodo(nodo):
    return {"id": nodo.pk, "key": nodo.node_key, "title": nodo.title, "narrative": nodo.narrative,
        "question": nodo.decision_prompt, "start": nodo.start_node, "terminal": nodo.terminal_node,
        "order": nodo.display_order, "decisions": [_decision(o) for o in nodo.options.all()]}


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
    version.save(update_fields=["narrative_context", "estimated_minutes", "learning_objectives"])
    guardas.tocar(version, usuario)
    return resumen(version)
