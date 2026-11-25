"""La IA coautora del proveedor falso: determinista, sin red ni azar. Sirve a las pruebas y al desarrollo.

Pregunta tres veces (una por ámbito) y luego dice ``listo``; el resumen es siempre la misma ficha válida, y si trae un cambio
pedido le agrega «(ajustado)» al título para que se note que lo leyó.
"""
import json

MARCA_PREGUNTAR = "COAUTORA-PREGUNTAR"
MARCA_RESUMIR = "COAUTORA-RESUMIR"

PREGUNTAS = (
    {
        "ambito": "historia", "pregunta": "¿Qué debe aprender a hacer quien juega el caso?",
        "porque": "Esto define qué respuestas serán las recomendadas.",
        "opciones": ["Escuchar sin juzgar", "Activar la ruta de atención", "Contener una crisis"], "recomendada": 0,
    },
    {
        "ambito": "personajes", "pregunta": "¿Cómo llega la persona a la consulta?",
        "porque": "Su actitud inicial marca el tono de la primera escena.",
        "opciones": ["Desconfiada y callada", "Angustiada y con prisa", "Tranquila pero evasiva"], "recomendada": 0,
    },
    {
        "ambito": "lugar", "pregunta": "¿El caso ocurre de día o de noche?",
        "porque": "Cambia la luz de las salas y el ambiente de la historia.",
        "opciones": ["De día, en horario de clases", "De noche, en una guardia", "Empieza de día y termina de noche"],
        "recomendada": 0,
    },
)

FICHA = {
    "titulo": "Primera consulta en bienestar universitario",
    "objetivo": "Establecer un vínculo de confianza con una estudiante que llega desconfiada.",
    "personajes": [
        {"nombre": "Laura", "descripcion": "Estudiante de primer semestre, desconfiada y callada."},
        {"nombre": "Andrés", "descripcion": "Compañero de clase que la acompaña hasta la puerta."},
    ],
    "lugar": "Oficina de bienestar universitario: sala de espera y consultorio.",
    "momento": "dia",
    "escenas": [
        {"titulo": "La sala de espera", "proposito": "Recibir a Laura y presentarse sin presionarla."},
        {"titulo": "El consultorio", "proposito": "Escuchar lo que Laura quiera contar y validar lo que siente."},
        {"titulo": "El cierre", "proposito": "Acordar un siguiente encuentro y dejar claros los apoyos disponibles."},
    ],
    "hitos": ["Laura acepta hablar", "Se acuerda un siguiente encuentro"],
    "finales": [
        {"titulo": "Laura vuelve", "descripcion": "Laura se va con un encuentro acordado y sabe a quién acudir."},
        {"titulo": "Laura se cierra", "descripcion": "Laura se va sin acordar nada y sin saber a quién acudir."},
    ],
    "intensidad": "MEDIUM",
    "temasSensibles": [],
}


def _contenido(mensajes: list[dict]) -> dict:
    try:
        datos = json.loads(mensajes[-1]["content"])
    except (IndexError, KeyError, TypeError, ValueError):
        return {}
    return datos if isinstance(datos, dict) else {}


def preguntar(mensajes: list[dict]) -> str:
    respondidas = len(_contenido(mensajes).get("respuestas") or [])
    if respondidas >= len(PREGUNTAS):
        return json.dumps({"listo": True, "ambito": "historia", "pregunta": "", "porque": "", "opciones": [], "recomendada": 0})
    return json.dumps({"listo": False, **PREGUNTAS[respondidas]}, ensure_ascii=False)


def resumir(mensajes: list[dict]) -> str:
    ficha = dict(FICHA)
    if _contenido(mensajes).get("cambio"):
        ficha["titulo"] = f"{FICHA['titulo']} (ajustado)"
    return json.dumps(ficha, ensure_ascii=False)
