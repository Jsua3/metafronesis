import json
from pathlib import Path

from django.db import transaction
from jsonschema import Draft202012Validator

from apps.simulation.models import DecisionOption
from apps.users.permisos import exigir_autoria
from shared.exceptions import ApiError
from . import decisiones, escenas, servicios


ESQUEMA = json.loads(Path(__file__).with_name("esquema_caso.json").read_text(encoding="utf-8"))


def exportar(usuario, case_version_id):
    definicion = servicios.definicion(usuario, case_version_id)
    nodos = definicion["nodes"]
    claves = {nodo["id"]: nodo["key"] for nodo in nodos}
    escenas_dsl = [{k: n[k] for k in ("key", "title", "narrative", "question", "start", "terminal", "order")} for n in nodos]
    opciones = []
    for nodo in nodos:
        for opcion in nodo["decisions"]:
            opciones.append({**{k: opcion[k] for k in ("key", "text", "responseClass", "feedback", "theoryBasis")},
                             "source": nodo["key"], "target": claves[opcion["targetNodeId"]]})
    return {"formato": "metafronesis-caso", "version": 1, "ficha": definicion["brief"],
            "escenas": escenas_dsl, "decisiones": opciones}


def _validar(documento):
    error = next(Draft202012Validator(ESQUEMA).iter_errors(documento), None)
    if error:
        ruta = ".".join(str(p) for p in error.absolute_path) or "documento"
        raise ApiError("VALIDATION_ERROR", "El documento no cumple el esquema.", 400, field=ruta, details=error.message)
    nodos = documento["escenas"]
    claves = [n["key"] for n in nodos]
    opciones = documento["decisiones"]
    if (len(set(claves)) != len(claves) or sum(n["start"] for n in nodos) != 1
            or len({d["key"] for d in opciones}) != len(opciones)
            or any(d["source"] not in claves or d["target"] not in claves or d["source"] == d["target"] for d in opciones)):
        raise ApiError("VALIDATION_ERROR", "Las escenas o sus referencias no son v?lidas.", 400, field="escenas")


@transaction.atomic
def importar(usuario, documento):
    exigir_autoria(usuario)
    _validar(documento)
    version = servicios.crear_borrador(usuario, documento["ficha"])
    inicial = version.nodes.get()
    nodos = {}
    for escena in sorted(documento["escenas"], key=lambda n: not n["start"]):
        version.refresh_from_db()
        if escena["start"]:
            nodo = escenas.actualizar(usuario, version.pk, inicial.pk, escena, version.version)
        else:
            nodo = escenas.crear(usuario, version.pk, escena, version.version)
        nodos[escena["key"]] = nodo["id"]
    for opcion in documento["decisiones"]:
        version.refresh_from_db()
        datos = {**opcion, "sourceNodeId": nodos[opcion["source"]], "targetNodeId": nodos[opcion["target"]]}
        creada = decisiones.crear(usuario, version.pk, datos, version.version)
        DecisionOption.objects.filter(pk=creada["id"]).update(option_key=opcion["key"])
    version.refresh_from_db()
    return version
