"""Estado completo del intento para el juego del estudiante, con la forma que consume el cliente."""

from apps.simulation.casedef.vocabulary import INITIAL_PERSONA, LABELS, step_persona
from apps.simulation.models import DecisionOption
from apps.simulation.services import attempt_api, disponibilidad_mundo, informe_estudiante, world
from shared.jsonutils import read_string_list

MENSAJE_REINTENTO = "Puedes volver a elegir en esta escena."
RECURSOS = [
    "Puedes pausar el intento y retomarlo con acompañamiento docente.",
    "Si el contenido activa malestar, contacta al Centro Integral de Psicología o a Bienestar Universitario.",
    "En riesgo inmediato, prioriza líneas locales de emergencia y rutas institucionales de protección.",
]


def _opciones_ofrecidas(intento):
    """Solo id y texto: la clasificación de una opción no viaja antes de elegirla."""
    if intento.status != "IN_PROGRESS" or intento.current_node.terminal_node:
        return []
    return [{"id": opcion.pk, "text": opcion.text} for opcion in disponibilidad_mundo.opciones(intento)]


def persona_de(intento):
    """La persona consultante del intento como viaja al cliente: ``{bond, activation, label}``."""
    cambios = intento.state_json.get("persona", {})
    vinculo, activacion = step_persona(*INITIAL_PERSONA, cambios.get("bond", 0), cambios.get("activation", 0))
    return {"bond": vinculo.value, "activation": activacion.value,
            "label": f"se muestra {LABELS[vinculo]} y {LABELS[activacion]}"}


def construir(intento):
    nodo = intento.current_node
    return {
        "attemptId": str(intento.pk), "attemptToken": "", "caseVersionId": intento.case_version_id,
        "caseTitle": intento.case_version.simulation_case.title, "status": intento.status,
        "persona": persona_de(intento),
        "currentNode": {"id": nodo.pk, "key": nodo.node_key, "title": nodo.title, "narrative": nodo.narrative,
                        "supportResources": read_string_list(nodo.support_resources_json),
                        "requiredTools": read_string_list(nodo.required_tools_json),
                        "sensitiveContent": nodo.sensitive_content, "safeExitRequired": nodo.safe_exit_required,
                        "warningMessage": nodo.warning_message, "intensity": nodo.intensity,
                        "terminal": nodo.terminal_node, "decisionPrompt": nodo.decision_prompt,
                        "goal": nodo.goal, "displayOrder": nodo.display_order, "options": _opciones_ofrecidas(intento)},
        "completionReport": informe_estudiante.congelado(intento),
        "supportResources": RECURSOS if intento.status == "PAUSED" else [],
    }


def leer(usuario, identificador):
    """El estado del intento propio, bajo el mismo cerrojo de lectura que las rutas del mundo."""
    return world._ejecutar(usuario, identificador, construir)


def _consecuencia(opcion):
    """Lo que pasa en el caso al elegir: el texto de la opción o la narrativa de la escena destino."""
    texto = (opcion.consequence_text or "").strip()
    if texto:
        return {"text": texto, "source": "OPTION"}
    return {"text": opcion.target_node.narrative or "", "source": "NODE"}


def decidir(usuario, identificador, opcion_id, solicitud):
    """La decisión de siempre más la consecuencia, el reintento y el estado del intento."""
    respuesta = attempt_api.decide(usuario, identificador, opcion_id, solicitud)
    opcion = DecisionOption.objects.select_related("target_node").get(pk=opcion_id)
    reintento = bool(respuesta.get("retry_required"))
    respuesta["consequence"] = None if reintento else _consecuencia(opcion)
    if reintento:
        respuesta["retry"] = {"allowed": True, "message": MENSAJE_REINTENTO}
    respuesta["attempt"] = construir(attempt_api.owned(usuario, identificador))
    return respuesta
