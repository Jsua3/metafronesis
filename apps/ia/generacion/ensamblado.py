"""Ensamblado del caso generado: el esqueleto y las escenas pasan a un borrador con sus escenas, decisiones y mundo.

``comprobar`` es puro (recibe datos y devuelve las faltas por escena); ``ensamblar`` toca la base de datos pero solo crea el
borrador dentro de un punto de guardado: con ``needs_repair`` o ``failed`` no queda ni un caso, ni una versión, ni una fila
del mundo a medias. Python no confía en el modelo: la escritura pasa por las validaciones de los modelos de la simulación y por
``case_rules.validate_effects``.
"""
import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Literal

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import IntegrityError, transaction
from rest_framework import status

from apps.biblioteca.services import copiar_al_caso, lugares
from apps.simulation.models import (
    CaseVersion,
    DecisionOption,
    DialogueChoice,
    DialogueLine,
    DialogueTree,
    MapObject,
    SceneHint,
    SceneMap,
    SimulationCase,
)
from apps.simulation.models.vocabulary import Intensity
from apps.simulation.services import case_rules
from shared.exceptions import ApiError

from . import ciclo, contexto as contexto_del_lugar

logger = logging.getLogger(__name__)

#: Las faltas llevan siempre este formato: ``{code, severity, message, path?}``.
CODIGO_ESCENA_FALTANTE = "GENERATION.SCENE_MISSING"
CODIGO_ESCENA_INVALIDA = "GENERATION.SCENE_INVALID"
CODIGO_ENSAMBLADO = "GENERATION.ASSEMBLY_FAILED"
SEVERIDAD = "error"
VERSION_SEMANTICA = "1.0.0"
PREFIJO_DEL_CODIGO = "IA-"
LARGO_DEL_CODIGO = 8
INTENTOS_DE_CODIGO = 5
EMOCION_DEL_GUION = "neutral"


@dataclass
class ResultadoEnsamblado:
    resultado: Literal["imported", "needs_repair", "failed"]
    case_version_id: int | None
    issues: list[dict]
    por_escena: dict[str, list[dict]] = field(default_factory=dict)


def _falta(codigo: str, mensaje: str, ruta: str | None = None) -> dict:
    falta = {"code": codigo, "severity": SEVERIDAD, "message": mensaje}
    if ruta:
        falta["path"] = ruta
    return falta


def comprobar(esqueleto: dict, escenas: dict, contexto: dict, codigos_de_competencias: set[str]) -> dict[str, list[dict]]:
    """Las faltas por sala: la escena que no llegó y lo que ya no cuadra con el lugar o con el esqueleto."""
    por_sala: dict[str, list[dict]] = {}
    salas = {sala["id"]: sala for sala in contexto["salas"]}
    for posicion, outline in enumerate(esqueleto["escenas"]):
        sala, ruta = outline["sala"], f"escenas[{posicion}]"
        faltas = por_sala.setdefault(sala, [])
        escrita = escenas.get(sala)
        if escrita is None:
            faltas.append(_falta(CODIGO_ESCENA_FALTANTE, "La escena aún no está escrita.", ruta))
            continue
        personajes = {persona["personaje"] for persona in salas[sala]["personas"]} if sala in salas else set()
        if any(linea["personaje"] not in personajes for linea in escrita["lineas"]):
            faltas.append(_falta(CODIGO_ESCENA_INVALIDA, "Una línea la dice un personaje que no está en la sala.", ruta))
        if any(opcion["destino"] not in outline["siguientes"] for opcion in escrita["opciones"]):
            faltas.append(_falta(CODIGO_ESCENA_INVALIDA, "Una opción lleva a una escena que no sigue a esta.", ruta))
        if any(codigo not in codigos_de_competencias for opcion in escrita["opciones"] for codigo in opcion["competencias"]):
            faltas.append(_falta(CODIGO_ESCENA_INVALIDA, "Una opción nombra una competencia que ya no está en el catálogo.", ruta))
    return {sala: faltas for sala, faltas in por_sala.items() if faltas}


def _efectos(opcion: dict, hitos_del_caso: list[str]) -> dict:
    efectos = {}
    if opcion["efectoVinculo"] or opcion["efectoActivacion"]:
        efectos["persona"] = {"bond": opcion["efectoVinculo"], "activation": opcion["efectoActivacion"]}
    if opcion["hitos"]:
        efectos["milestones"] = list(opcion["hitos"])
    if opcion["competencias"]:
        efectos["competencies"] = list(opcion["competencias"])
    return case_rules.validate_effects(efectos, hitos_del_caso)


def _reaccion(opcion: dict) -> dict:
    pares = (("linea", opcion["reaccionLinea"]), ("emocion", opcion["reaccionEmocion"]), ("gesto", opcion["reaccionGesto"]))
    return {clave: valor for clave, valor in pares if valor}


def _comentarios(escena: dict) -> list[dict]:
    comentarios = []
    for comentario in escena["comentarios"]:
        guardado = {"personaje": comentario["personaje"], "linea": comentario["linea"], "cuando": comentario["cuando"]}
        guardado.update({clave: comentario[clave] for clave in ("emocion", "gesto") if comentario[clave]})
        comentarios.append(guardado)
    return comentarios


def _codigo_libre() -> str:
    for _ in range(INTENTOS_DE_CODIGO):
        codigo = PREFIJO_DEL_CODIGO + uuid.uuid4().hex[:LARGO_DEL_CODIGO].upper()
        if not SimulationCase.objects.filter(code=codigo).exists():
            return codigo
    raise ApiError("CASE_CODE_TAKEN", "No se pudo asignar un código al caso. Vuelve a intentarlo.", status.HTTP_409_CONFLICT)


def _crear_borrador(actor, esqueleto: dict, escenas: dict, lugar: dict) -> int:
    caso = SimulationCase.objects.create(
        created_by=actor, code=_codigo_libre(), title=esqueleto["titulo"], description=esqueleto["contexto"],
    )
    version = CaseVersion.objects.create(
        simulation_case=caso, created_by=actor, semantic_version=VERSION_SEMANTICA, narrative_context=esqueleto["contexto"],
        learning_objectives=json.dumps(esqueleto["objetivosAprendizaje"], ensure_ascii=False),
    )
    copia = copiar_al_caso.copiar_al_caso(version, lugar, [outline["sala"] for outline in esqueleto["escenas"]])
    reglas = json.loads(version.rules)
    reglas["milestones"] = [hito for hito in reglas.get("milestones", []) if hito["key"] in esqueleto["hitos"]]
    reglas["endings"] = [
        {"key": final["clave"], "title": final["titulo"], "message": final["mensaje"], "tone": final["tono"],
         "aiSuggested": True, **({"when": final["cuando"]} if final["cuando"] else {})}
        for final in esqueleto["finales"]
    ]
    version.rules = json.dumps(reglas, ensure_ascii=False)
    version.save(update_fields=["rules"])

    mapas = {mapa.node_id: mapa for mapa in SceneMap.objects.filter(case_version=version)}
    for posicion, outline in enumerate(esqueleto["escenas"]):
        escrita = escenas[outline["sala"]]
        nodo = copia.nodo_por_sala[outline["sala"]]
        nodo.title, nodo.narrative, nodo.decision_prompt = outline["titulo"], escrita["narracion"], escrita["pregunta"]
        nodo.intensity = outline["intensidad"]
        nodo.sensitive_content = outline["intensidad"] == Intensity.HIGH.value
        nodo.warning_message = outline["advertencia"] or None
        nodo.start_node, nodo.terminal_node, nodo.ai_suggested = posicion == 0, outline["final"], True
        nodo.comments_json = json.dumps(_comentarios(escrita), ensure_ascii=False)
        nodo.full_clean(exclude=["decision_prompt"])  # la escena final no declara enunciado de decisión
        nodo.save()
        for orden, pista in enumerate(escrita["pistas"], start=1):
            fila = SceneHint(scene_map=mapas[nodo.pk], hint_order=orden, text=pista)
            fila.full_clean()
            fila.save()

    for outline in esqueleto["escenas"]:
        _decisiones_y_guion(version, copia, mapas, outline, escenas[outline["sala"]], esqueleto["hitos"])
    return version.pk


def _decisiones_y_guion(version, copia, mapas, outline: dict, escrita: dict, hitos_del_caso: list[str]) -> None:
    sala = outline["sala"]
    nodo = copia.nodo_por_sala[sala]
    opciones = []
    for opcion in escrita["opciones"]:
        opciones.append(DecisionOption.objects.create(
            case_version=version, option_key=f"{sala}-{opcion['clave']}", source_node=nodo,
            target_node=copia.nodo_por_sala[opcion["destino"]], text=opcion["texto"], immediate_feedback=opcion["retroalimentacion"],
            feedback_text=opcion["retroalimentacion"], prohibition_reason=opcion["razonProhibicion"] or None,
            response_class=opcion["clase"], effects=json.dumps(_efectos(opcion, hitos_del_caso), ensure_ascii=False),
            requires_json=json.dumps(opcion["requiere"], ensure_ascii=False),
            reaction_json=json.dumps(_reaccion(opcion), ensure_ascii=False), ai_suggested=True,
        ))
    persona = MapObject.objects.get(scene_map=mapas[nodo.pk], object_key=outline["persona"], object_type="PERSON")
    persona.metadata_json = json.dumps({**json.loads(persona.metadata_json), "personaClave": True}, ensure_ascii=False)
    persona.ai_suggested = True
    persona.save(update_fields=["metadata_json", "ai_suggested"])
    nombres = copia.nombre_por_personaje
    arbol = DialogueTree(
        scene_map=mapas[nodo.pk], map_object=persona, tree_key=f"guion-{sala}",
        speaker_name=nombres[escrita["lineas"][0]["personaje"]], emotion=EMOCION_DEL_GUION,
    )
    arbol.full_clean(exclude=["portrait_key"])
    arbol.save()
    for orden, linea in enumerate(escrita["lineas"], start=1):
        DialogueLine.objects.create(
            dialogue_tree=arbol, display_order=orden, speaker_name=nombres[linea["personaje"]], text=linea["texto"],
            emotion=linea["emocion"], ai_suggested=True,
        )
    for orden, opcion in enumerate(opciones, start=1):
        eleccion = DialogueChoice(
            dialogue_tree=arbol, choice_key=opcion.option_key, text=opcion.text, decision_option=opcion, display_order=orden,
        )
        eleccion.full_clean(exclude=["required_tool_code"])
        eleccion.save()


def ensamblar(generacion, actor) -> ResultadoEnsamblado:
    """Decide y, solo si hay que importar, crea el borrador: ``imported``, ``needs_repair`` o ``failed``."""
    esqueleto = json.loads(generacion.skeleton_json)
    escenas = {
        clave: entrada["data"] for clave, entrada in json.loads(generacion.scenes_json).items()
        if isinstance(entrada, dict) and entrada.get("data")
    }
    lugar = lugares.cargar_lugar(generacion.lugar_id, por_piezas=True)
    competencias = contexto_del_lugar.competencias_activas()
    contexto = contexto_del_lugar.del_lugar(lugar, competencias)
    por_escena = comprobar(esqueleto, escenas, contexto, {competencia["codigo"] for competencia in competencias})
    if por_escena:
        faltas = [falta for faltas in por_escena.values() for falta in faltas]
        quedan_rondas = generacion.repair_rounds < ciclo.RONDAS_DE_REPARACION
        return ResultadoEnsamblado("needs_repair" if quedan_rondas else "failed", None, faltas, por_escena)
    try:
        with transaction.atomic():
            version_id = _crear_borrador(actor, esqueleto, escenas, lugar)
    except ApiError as error:
        return ResultadoEnsamblado("failed", None, [_falta(CODIGO_ENSAMBLADO, str(error.detail))])
    except (ValidationError, IntegrityError, KeyError, ObjectDoesNotExist) as error:
        # Solo la clase: el mensaje podría traer texto del modelo.
        logger.warning("ensamblado_no_representable", extra={"fields": {"clase": type(error).__name__}})
        return ResultadoEnsamblado("failed", None, [_falta(CODIGO_ENSAMBLADO, "El caso generado no se pudo representar en el simulador.")])
    return ResultadoEnsamblado("imported", version_id, [])
