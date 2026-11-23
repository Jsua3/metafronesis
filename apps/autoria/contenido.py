"""Validación de lo que el editor escribe en escenas, decisiones y ficha: texto plano, listas y condiciones del caso."""
import json

from apps.simulation.casedef import conditions
from apps.simulation.services.disponibilidad_mundo import EXPRESIONES, GESTOS
from shared.exceptions import ApiError
from .reglas import TEXTO_PROHIBIDO

MAX_ADVERTENCIAS = 8
MAX_ADVERTENCIA = 60
MAX_RECURSOS = 50
MAX_RECURSO = 500
MAX_AVISO = 1000
MAX_TEXTO_DECISION = 1200
MAX_LINEA = 400
MAX_REQUISITO = 2000
MAX_COMENTARIOS = 6
CLAVES_REACCION = ("linea", "emocion", "gesto", "personaje")
CLAVES_COMENTARIO = ("personaje", "linea", "cuando", "emocion", "gesto")


def error(campo, mensaje):
    raise ApiError("VALIDATION_ERROR", mensaje, 400, field=campo)


def texto_plano(valor, campo, limite, multilinea=False, indice=None):
    """El texto sin espacios sobrantes, sin marcado ni enlaces y con tope; ``None`` es el texto vacío."""
    if valor is None:
        return ""
    if not isinstance(valor, str) or len(valor) > limite or TEXTO_PROHIBIDO.search(valor) or (not multilinea and ("\n" in valor or "\r" in valor)):
        error(campo, "El texto no es válido o supera el límite permitido." if indice is None else f"El elemento {indice + 1} no es un texto válido o supera el límite permitido.")
    return valor.strip()


def advertencias(crudo):
    """Hasta ocho temas sensibles de una línea; los vacíos se descartan y los repetidos (sin mayúsculas) se guardan una vez."""
    if crudo is None:
        return []
    if not isinstance(crudo, list) or len(crudo) > MAX_ADVERTENCIAS:
        error("contentWarnings", f"Un caso admite hasta {MAX_ADVERTENCIAS} temas sensibles.")
    temas, vistos = [], set()
    for posicion, elemento in enumerate(crudo):
        texto = texto_plano(elemento, "contentWarnings", MAX_ADVERTENCIA, indice=posicion)
        if texto and texto.casefold() not in vistos:
            vistos.add(texto.casefold())
            temas.append(texto)
    return temas


def lista_de_textos(crudo, campo):
    """Una lista de textos cortos (recursos de apoyo, herramientas): se recortan y se descartan los vacíos."""
    if crudo is None:
        return []
    if not isinstance(crudo, list) or len(crudo) > MAX_RECURSOS or not all(isinstance(elemento, str) and len(elemento) <= MAX_RECURSO for elemento in crudo):
        error(campo, f"La lista admite hasta {MAX_RECURSOS} textos de hasta {MAX_RECURSO} caracteres.")
    return [elemento.strip() for elemento in crudo if elemento.strip()]


def requisito(crudo):
    """El requisito de una opción: una condición del vocabulario del caso; ``None`` y ``{}`` lo limpian."""
    if crudo is None or crudo == {}:
        return {}
    if not isinstance(crudo, dict) or not conditions.is_valid(crudo, facts=True):
        error("requires", "El requisito no es una condición válida del vocabulario del caso.")
    if len(json.dumps(crudo, ensure_ascii=False)) > MAX_REQUISITO:
        error("requires", f"El requisito es demasiado largo: el máximo es {MAX_REQUISITO} caracteres.")
    return crudo


def _expresion(clave, valor, campo):
    if clave == "emocion" and valor not in EXPRESIONES:
        error(campo, f"La emoción «{valor}» no existe: {', '.join(EXPRESIONES)}.")
    if clave == "gesto" and valor not in GESTOS:
        error(campo, f"El gesto «{valor}» no existe: {', '.join(GESTOS)}.")


def _campos_de_dialogo(crudo, claves, campo, personajes):
    """Las claves con valor de una reacción o un comentario: ``linea``, ``emocion``, ``gesto`` y ``personaje``."""
    desconocidas = [clave for clave in crudo if clave not in claves]
    if desconocidas:
        error(campo, f"No se admite «{desconocidas[0]}»: solo {', '.join(claves)}.")
    resultado = {}
    for clave in claves:
        valor = crudo.get(clave)
        if clave == "cuando" or valor is None or valor == "":
            continue
        if not isinstance(valor, str):
            error(campo, f"«{clave}» debe ser un texto.")
        if clave == "linea":
            valor = texto_plano(valor, campo, MAX_LINEA)
            if not valor:
                continue
        _expresion(clave, valor, campo)
        if clave == "personaje" and valor not in personajes:
            error(campo, f"El caso no tiene el personaje «{valor}».")
        resultado[clave] = valor
    return resultado


def reaccion(crudo, personajes):
    """La reacción de una opción: solo las claves con valor; ``None`` y ``{}`` la limpian."""
    if crudo is None or crudo == {}:
        return {}
    if not isinstance(crudo, dict):
        error("reaction", "La reacción debe ser un objeto con linea, emocion, gesto y personaje.")
    return _campos_de_dialogo(crudo, CLAVES_REACCION, "reaction", personajes)


def comentarios(crudo, personajes):
    """Los comentarios de una escena (hasta seis): cada uno con ``personaje`` y ``linea``; ``None`` y ``[]`` los limpian."""
    if crudo is None or crudo == []:
        return []
    if not isinstance(crudo, list) or len(crudo) > MAX_COMENTARIOS:
        error("comments", f"Los comentarios son una lista de hasta {MAX_COMENTARIOS}.")
    resultado = []
    for entrada in crudo:
        if not isinstance(entrada, dict):
            error("comments", "Cada comentario debe ser un objeto con personaje y linea.")
        comentario = _campos_de_dialogo(entrada, CLAVES_COMENTARIO, "comments", personajes)
        condicion = entrada.get("cuando")
        if condicion not in (None, {}):
            if not isinstance(condicion, dict) or not conditions.is_valid(condicion, facts=True) or len(json.dumps(condicion, ensure_ascii=False)) > MAX_REQUISITO:
                error("comments", "La condición del comentario no es válida en el vocabulario del caso.")
            comentario["cuando"] = condicion
        if "personaje" not in comentario or "linea" not in comentario:
            error("comments", "Cada comentario necesita personaje y linea.")
        resultado.append(comentario)
    return resultado
