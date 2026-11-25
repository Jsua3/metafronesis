"""Las instrucciones de la IA coautora (preguntar y resumir), sus mensajes y la ficha vuelta descripción para la generación.

Las instrucciones son fijas de una llamada a otra (caben en la caché del proveedor); lo que cambia viaja en el mensaje de la
persona usuaria como JSON, sin correos ni números largos. La primera línea de cada instrucción es la marca que reconoce el
proveedor falso.
"""
import json

from apps.ia.asistente.prompts import CONTENT_RULES
from apps.ia.privacidad import sin_datos_personales

from . import esquemas
from .falso import MARCA_PREGUNTAR, MARCA_RESUMIR

_PEDIR_ESQUEMA = "\n\nResponde únicamente un JSON que cumpla este esquema, sin texto alrededor:\n"

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
_QUIEN = """Eres la IA coautora del editor de casos de MetaFrónesis, un simulador donde estudiantes de Psicología practican la atención de personas en situaciones difíciles (orientación, bienestar universitario, violencia de género). Trabajas con una persona docente de Psicología que no programa: le hablas en español claro y cálido, y la tratas de «tú»."""

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
SISTEMA_PREGUNTAR = _QUIEN + f"""

Antes de construir el caso, aclaras la idea del docente con preguntas. Recibes su idea, el contexto (el lugar o el caso que ya existe) y las preguntas que ya respondió.

Cómo preguntar:
- Una sola pregunta por vez, sobre una duda real que la idea y las respuestas anteriores no resuelven. Nunca repitas algo que ya respondió.
- Elige el ámbito: historia (objetivo clínico, qué pasa), personajes, lugar (salas, si es de día o de noche) o evaluación (qué cuenta como buena respuesta, finales).
- "porque" explica en una frase por qué la haces y qué cambia en el caso.
- Exactamente tres opciones distintas, concretas y cortas (máximo 160 caracteres). "recomendada" es la posición (0, 1 o 2) de la que mejor sirve al aprendizaje, según lo que ya sabes.
- Pregunta solo lo necesario: hay un tope de {esquemas.TOPE_PREGUNTAS} preguntas. Cuando ya tengas lo necesario para un buen caso, responde "listo": true (los demás campos vacíos).
- Sin jerga técnica: nunca digas «nodo», «ID», «JSON» ni «clave».

""" + CONTENT_RULES

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
SISTEMA_RESUMIR = _QUIEN + """

Escribes la ficha «Lo que acordamos»: el caso tal como quedó tras las preguntas. Recibes la idea, el contexto y las respuestas. Si además recibes "fichaAnterior" y "cambio", reescribe la ficha anterior aplicando el cambio que pide el docente y conserva el resto.

Cómo escribirla:
- "titulo": corto. "objetivo": qué aprende quien juega el caso.
- "personajes": de 1 a 6, con nombre ficticio y una frase que los describa. "lugar": dónde pasa y en qué salas. "momento": "dia" o "noche".
- "escenas": de 2 a 8, en orden, cada una con título y propósito.
- "hitos": de 0 a 6 logros que quien juega puede cumplir. "finales": de 1 a 4, con título y qué pasa.
- "intensidad": LOW, MEDIUM o HIGH (la más alta del caso). "temasSensibles": de 0 a 6 temas que necesitan aviso.
- Respeta lo que el docente eligió en cada respuesta.

""" + CONTENT_RULES


def instrucciones_preguntar() -> str:
    return MARCA_PREGUNTAR + "\n" + SISTEMA_PREGUNTAR + _PEDIR_ESQUEMA + json.dumps(esquemas.PREGUNTA, ensure_ascii=False)


def instrucciones_resumir() -> str:
    return MARCA_RESUMIR + "\n" + SISTEMA_RESUMIR + _PEDIR_ESQUEMA + json.dumps(esquemas.FICHA, ensure_ascii=False)


def mensajes(idea: str, contexto: dict, respuestas: list[dict], **extra) -> list[dict]:
    """El mensaje de la persona usuaria: idea, contexto, respuestas y lo que pida la etapa (número de pregunta, cambio…)."""
    contenido = {"idea": idea, "contexto": contexto, "respuestas": respuestas, **extra}
    return [{"role": "user", "content": sin_datos_personales(json.dumps(contenido, ensure_ascii=False))}]


_MOMENTO = {"dia": "de día", "noche": "de noche"}
_INTENSIDAD = {"LOW": "baja", "MEDIUM": "media", "HIGH": "alta"}


def descripcion(ficha: dict, tope: int) -> str:
    """La ficha como la descripción que recibe la generación por etapas: texto plano en varias líneas, hasta ``tope``."""
    lineas = [
        f"Caso: {ficha['titulo']}.",
        f"Objetivo: {ficha['objetivo']}",
        f"Lugar: {ficha['lugar']} Ocurre {_MOMENTO[ficha['momento']]}.",
        "Personajes: " + "; ".join(f"{p['nombre']}, {p['descripcion']}" for p in ficha["personajes"]),
        "Escenas en orden: " + "; ".join(f"{i}. {e['titulo']}: {e['proposito']}" for i, e in enumerate(ficha["escenas"], 1)),
    ]
    if ficha["hitos"]:
        lineas.append("Hitos: " + "; ".join(ficha["hitos"]))
    lineas.append("Finales: " + "; ".join(f"{f['titulo']}: {f['descripcion']}" for f in ficha["finales"]))
    lineas.append(f"Intensidad máxima: {_INTENSIDAD[ficha['intensidad']]}.")
    if ficha["temasSensibles"]:
        lineas.append("Temas sensibles: " + "; ".join(ficha["temasSensibles"]))
    texto = ""
    for linea in lineas:
        siguiente = f"{texto}\n{linea}" if texto else linea
        if len(siguiente) > tope:
            break
        texto = siguiente
    return texto
