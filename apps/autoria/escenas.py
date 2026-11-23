import json

from django.db import transaction
from django.shortcuts import get_object_or_404

from apps.simulation.models import CaseCharacter, SimulationNode
from apps.simulation.models.vocabulary import Intensity
from apps.simulation.services.audit_service import auditable
from shared.exceptions import ApiError
from . import contenido, ensayo, guardas, servicios


def _aplicar(version, nodo, datos):
    key = datos.get("key", nodo.node_key)
    if version.nodes.filter(node_key=key).exclude(pk=nodo.pk).exists():
        raise ApiError("NODE_KEY_TAKEN", "La clave de escena ya está en uso.", 409)
    if datos.get("start"):
        version.nodes.exclude(pk=nodo.pk).update(start_node=False)
    for clave, campo in (("key", "node_key"), ("title", "title"), ("narrative", "narrative"),
                         ("question", "decision_prompt"), ("start", "start_node"),
                         ("terminal", "terminal_node"), ("order", "display_order"),
                         ("sensitiveContent", "sensitive_content"), ("safeExitRequired", "safe_exit_required"),
                         ("positionX", "position_x"), ("positionY", "position_y"), ("intensity", "intensity")):
        if clave in datos:
            setattr(nodo, campo, datos[clave])
    if nodo.pk is None and "intensity" not in datos and nodo.sensitive_content:
        nodo.intensity = Intensity.HIGH.value
    for clave, campo in (("supportResources", "support_resources_json"), ("requiredTools", "required_tools_json")):
        if clave in datos:
            setattr(nodo, campo, json.dumps(contenido.lista_de_textos(datos[clave], clave), ensure_ascii=False))
    if "warningMessage" in datos:
        nodo.warning_message = contenido.texto_plano(datos["warningMessage"], "warningMessage", contenido.MAX_AVISO, multilinea=True) or None
    if "comments" in datos:
        personajes = set(CaseCharacter.objects.filter(case_version=version).values_list("character_key", flat=True))
        nodo.comments_json = json.dumps(contenido.comentarios(datos["comments"], personajes), ensure_ascii=False)
    nodo.save()


@auditable("NODE_CREATED", "CASE", resource_id_param_index=1)
@transaction.atomic
def crear(usuario, case_version_id, datos, revision):
    version = guardas.version_editable(usuario, case_version_id)
    guardas.exigir_revision(version, revision)
    numero = 1
    while version.nodes.filter(node_key=f"escena-{numero}").exists():
        numero += 1
    nodo = SimulationNode(case_version=version, node_key=datos.get("key", f"escena-{numero}"))
    _aplicar(version, nodo, datos)
    guardas.tocar(version, usuario)
    return servicios._nodo(nodo)


@auditable("NODE_UPDATED", "CASE", resource_id_param_index=1)
@transaction.atomic
def actualizar(usuario, case_version_id, node_id, datos, revision):
    version = guardas.version_editable(usuario, case_version_id)
    guardas.exigir_revision(version, revision)
    nodo = get_object_or_404(SimulationNode, case_version=version, pk=node_id)
    _aplicar(version, nodo, datos)
    guardas.tocar(version, usuario)
    return servicios._nodo(nodo)


@auditable("NODE_DELETED", "CASE", resource_id_param_index=1)
@transaction.atomic
def borrar(usuario, case_version_id, node_id, revision):
    version = guardas.version_editable(usuario, case_version_id)
    guardas.exigir_revision(version, revision)
    nodo = get_object_or_404(SimulationNode, case_version=version, pk=node_id)
    if nodo.incoming_options.exists():
        raise ApiError("NODE_IN_USE", "La escena es destino de una decisión.", 409)
    ensayo.descartar_de_version(version.pk)
    nodo.delete()
    guardas.tocar(version, usuario)
