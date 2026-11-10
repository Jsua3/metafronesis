from django.db import transaction
from django.shortcuts import get_object_or_404

from apps.simulation.models import SimulationNode
from apps.simulation.services.audit_service import auditable
from shared.exceptions import ApiError
from . import guardas, servicios


def _aplicar(version, nodo, datos):
    key = datos.get("key", nodo.node_key)
    if version.nodes.filter(node_key=key).exclude(pk=nodo.pk).exists():
        raise ApiError("NODE_KEY_TAKEN", "La clave de escena ya está en uso.", 409)
    if datos.get("start"):
        version.nodes.exclude(pk=nodo.pk).update(start_node=False)
    for clave, campo in (("key", "node_key"), ("title", "title"), ("narrative", "narrative"),
                         ("question", "decision_prompt"), ("start", "start_node"),
                         ("terminal", "terminal_node"), ("order", "display_order")):
        if clave in datos:
            setattr(nodo, campo, datos[clave])
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
    nodo.delete()
    guardas.tocar(version, usuario)
