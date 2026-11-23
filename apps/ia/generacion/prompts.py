"""Las instrucciones y los mensajes que se le mandan al proveedor en cada etapa.

El mensaje es un JSON con la etapa, el contexto del lugar y lo ya escrito: el proveedor falso lo lee para armar su salida y los
reales lo reciben como texto. La descripción de la docente ya pasó por ``comprobar_descripcion`` y por el filtro de datos
personales de los asistentes.
"""
import json

from apps.ia.asistentes import sin_datos_personales

from . import esquemas
from .falso import MARCA

MAXIMO_DESCRIPCION = 2000

INSTRUCCIONES = {
    "esqueleto": (
        f"{MARCA}\nEscribe el esqueleto de un caso de simulación para psicología: entre {esquemas.MINIMO_ESCENAS} y "
        f"{esquemas.MAXIMO_ESCENAS} escenas en salas distintas del lugar, con la persona a atender de cada sala, hitos del "
        "lugar y finales. Usa solo salas, personas, hitos y claves del contexto. Responde únicamente un JSON que cumpla este "
        "esquema:\n"
    ),
    "escena": (
        f"{MARCA}\nEscribe una escena del caso: narración, líneas de los personajes de la sala, opciones que lleven a los "
        "siguientes de la escena, pistas y comentarios. Usa solo personajes, hitos y competencias del contexto. Responde "
        "únicamente un JSON que cumpla este esquema:\n"
    ),
}
ESQUEMA_DE = {"esqueleto": esquemas.ESQUELETO, "escena": esquemas.ESCENA}


def instrucciones(etapa: str) -> str:
    return INSTRUCCIONES[etapa] + json.dumps(ESQUEMA_DE[etapa], ensure_ascii=False)


def _mensaje(contenido: dict) -> list[dict]:
    return [{"role": "user", "content": sin_datos_personales(json.dumps(contenido, ensure_ascii=False))}]


def mensajes_esqueleto(contexto: dict, descripcion: str, reparar: dict | None) -> list[dict]:
    contenido = {"etapa": "esqueleto", "descripcion": descripcion, "contexto": contexto}
    if reparar:
        contenido["reparar"] = reparar
    return _mensaje(contenido)


def mensajes_escena(contexto: dict, esqueleto: dict, sala: str, reparar: dict | None) -> list[dict]:
    contenido = {"etapa": "escena", "sala": sala, "esqueleto": esqueleto, "contexto": contexto}
    if reparar:
        contenido["reparar"] = reparar
    return _mensaje(contenido)
