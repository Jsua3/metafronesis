"""Las comprobaciones de lo que escribe la IA: Python nunca confía en el modelo.

Cada ``validar_*`` recibe la salida cruda (ya convertida de JSON), mide topes, vocabularios y referencias contra el contexto
del lugar y devuelve una copia normalizada (condiciones como diccionarios, ``requiere`` vacío como ``{}``). Si algo falla lanza
``GeneracionInvalida`` con motivos de texto fijo: nunca llevan texto del modelo ni de la descripción.
"""
import json
import re

from apps.simulation.casedef import conditions
from apps.simulation.models.vocabulary import Intensity, ResponseClass
from apps.simulation.services import case_rules
from apps.simulation.services.disponibilidad_mundo import EXPRESIONES, GESTOS
from shared.plain_text import plain_text_problem

from . import esquemas

MAXIMO_TITULO = 120
MAXIMO_CONTEXTO = 1500
MAXIMO_OBJETIVO = 200
MAXIMO_ADVERTENCIA = 300
MAXIMO_MENSAJE_FINAL = 600
MAXIMO_NARRACION = 1500
MAXIMO_PREGUNTA = 300
MAXIMO_LINEA = 500
MAXIMO_OPCION = 400
MAXIMO_RETROALIMENTACION = 600
MAXIMO_PISTA = 280
MAXIMO_REACCION = 400
MAXIMO_CONDICION = 2000
CLAVE = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
MAXIMO_CLAVE = 40
CORREO = re.compile(r"[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}")
NUMERO_LARGO = re.compile(r"\d(?:[\s.-]?\d){6,}")


class GeneracionInvalida(Exception):
    """La salida del modelo no cumple: ``motivos`` son textos fijos que se le devuelven para reparar."""

    def __init__(self, motivos):
        super().__init__("; ".join(motivos))
        self.motivos = list(motivos)


class _Motivos(list):
    def falta(self, mensaje):
        self.append(mensaje)

    def cerrar(self):
        if self:
            raise GeneracionInvalida(self)


def comprobar_descripcion(texto: str) -> None:
    """La descripción no manda datos personales al proveedor: nada se guarda ni se envía si trae un correo o un número largo."""
    if CORREO.search(texto) or NUMERO_LARGO.search(texto):
        raise GeneracionInvalida(["La descripción no debe contener correos ni números de contacto o de documento."])


def _claves_exactas(valor, propiedades, ruta, motivos) -> bool:
    if not isinstance(valor, dict):
        motivos.falta(f"{ruta}: debe ser un objeto.")
        return False
    sobran, faltan = set(valor) - set(propiedades), set(propiedades) - set(valor)
    if sobran or faltan:
        motivos.falta(f"{ruta}: los campos no son los del esquema.")
        return False
    return True


def _texto(valor, maximo, ruta, motivos, *, obligatorio=True, multilinea=False) -> str:
    if not isinstance(valor, str):
        motivos.falta(f"{ruta}: debe ser un texto.")
        return ""
    texto = valor.strip()
    if obligatorio and not texto:
        motivos.falta(f"{ruta}: no puede estar vacío.")
    elif plain_text_problem(texto, maximo, multiline=multilinea) is not None:
        motivos.falta(f"{ruta}: debe ser texto plano y de hasta {maximo} caracteres.")
    return texto


def _clave(valor, ruta, motivos) -> str:
    if not isinstance(valor, str) or len(valor) > MAXIMO_CLAVE or not CLAVE.fullmatch(valor):
        motivos.falta(f"{ruta}: debe ser una clave de minúsculas, números y guiones.")
        return ""
    return valor


def _lista(valor, ruta, motivos, *, minimo=0, maximo) -> list:
    if not isinstance(valor, list):
        motivos.falta(f"{ruta}: debe ser una lista.")
        return []
    if not minimo <= len(valor) <= maximo:
        motivos.falta(f"{ruta}: debe tener entre {minimo} y {maximo} elementos.")
    return valor[:maximo]


def _condicion(valor, ruta, motivos, *, con_hechos, hitos=None) -> dict:
    """Una condición escrita como texto con el JSON de la gramática; ``""`` es sin condición (``{}``)."""
    if not isinstance(valor, str):
        motivos.falta(f"{ruta}: debe ser un texto.")
        return {}
    if not valor.strip():
        return {}
    try:
        decodificada = json.loads(valor) if len(valor) <= MAXIMO_CONDICION else None
    except ValueError:
        decodificada = None
    if not conditions.is_valid(decodificada, facts=con_hechos):
        motivos.falta(f"{ruta}: no es una condición de la gramática del caso.")
        return {}
    if hitos is not None and any(hito not in hitos for hito in _hitos_de(decodificada)):
        motivos.falta(f"{ruta}: nombra un hito que el caso no declara.")
    return decodificada


def _hitos_de(condicion, profundidad=0) -> list[str]:
    if profundidad > conditions.MAX_DEPTH or not isinstance(condicion, dict):
        return []
    encontrados = []
    for grupo in ("all", "any"):
        for elemento in condicion.get(grupo, []) if isinstance(condicion.get(grupo), list) else []:
            encontrados += _hitos_de(elemento, profundidad + 1)
    if "not" in condicion:
        encontrados += _hitos_de(condicion["not"], profundidad + 1)
    if isinstance(condicion.get("milestone"), str):
        encontrados.append(condicion["milestone"])
    return encontrados


# ─── el esqueleto ─────────────────────────────────────────────────────────────────────────────────


def _escena_del_esqueleto(crudo, contexto, motivos, ruta):
    propiedades = esquemas.ESQUELETO["properties"]["escenas"]["items"]["properties"]
    if not _claves_exactas(crudo, propiedades, ruta, motivos):
        return None
    salas = {sala["id"]: sala for sala in contexto["salas"]}
    sala = crudo["sala"]
    if sala not in salas:
        motivos.falta(f"{ruta}: la sala no existe en el lugar.")
        return None
    personas = {persona["clave"] for persona in salas[sala]["personas"]}
    if crudo["persona"] not in personas:
        motivos.falta(f"{ruta}: la persona a atender no está en esa sala.")
    if crudo["intensidad"] not in {miembro.value for miembro in Intensity}:
        motivos.falta(f"{ruta}: la intensidad no es válida.")
    if not isinstance(crudo["final"], bool):
        motivos.falta(f"{ruta}: final debe ser verdadero o falso.")
    advertencia = _texto(crudo["advertencia"], MAXIMO_ADVERTENCIA, f"{ruta}.advertencia", motivos, obligatorio=False)
    if crudo["intensidad"] == Intensity.HIGH.value and not advertencia:
        motivos.falta(f"{ruta}: una escena de intensidad alta exige una advertencia.")
    siguientes = _lista(crudo["siguientes"], f"{ruta}.siguientes", motivos, maximo=esquemas.MAXIMO_OPCIONES)
    return {
        "sala": sala, "titulo": _texto(crudo["titulo"], MAXIMO_TITULO, f"{ruta}.titulo", motivos),
        "persona": crudo["persona"], "intensidad": crudo["intensidad"], "advertencia": advertencia,
        "final": crudo["final"], "siguientes": [destino for destino in siguientes if isinstance(destino, str)],
    }


def _final_del_esqueleto(crudo, hitos, motivos, ruta):
    propiedades = esquemas.ESQUELETO["properties"]["finales"]["items"]["properties"]
    if not _claves_exactas(crudo, propiedades, ruta, motivos):
        return None
    if crudo["tono"] not in esquemas.TONOS_DE_FINAL:
        motivos.falta(f"{ruta}: el tono no es válido.")
    return {
        "clave": _clave(crudo["clave"], f"{ruta}.clave", motivos),
        "titulo": _texto(crudo["titulo"], MAXIMO_TITULO, f"{ruta}.titulo", motivos),
        "mensaje": _texto(crudo["mensaje"], MAXIMO_MENSAJE_FINAL, f"{ruta}.mensaje", motivos),
        "tono": crudo["tono"],
        "cuando": _condicion(crudo["cuando"], f"{ruta}.cuando", motivos, con_hechos=False, hitos=hitos),
    }


def _grafo_del_esqueleto(escenas, motivos) -> None:
    claves = [escena["sala"] for escena in escenas]
    if len(set(claves)) != len(claves):
        motivos.falta("escenas: una sala se repite.")
        return
    if not any(escena["final"] for escena in escenas):
        motivos.falta("escenas: debe haber al menos una escena final.")
    alcanzadas, pendientes = set(), [claves[0]]
    por_sala = {escena["sala"]: escena for escena in escenas}
    while pendientes:
        sala = pendientes.pop()
        if sala in alcanzadas:
            continue
        alcanzadas.add(sala)
        pendientes += [destino for destino in por_sala[sala]["siguientes"] if destino in por_sala]
    for escena in escenas:
        if escena["final"] and escena["siguientes"]:
            motivos.falta("escenas: una escena final no tiene siguientes.")
        if not escena["final"] and not escena["siguientes"]:
            motivos.falta("escenas: una escena que no es final necesita al menos un siguiente.")
        if any(destino not in por_sala or destino == escena["sala"] for destino in escena["siguientes"]):
            motivos.falta("escenas: un siguiente no es otra escena del caso.")
        if escena["sala"] not in alcanzadas:
            motivos.falta("escenas: una escena no se alcanza desde la primera.")


def validar_esqueleto(crudo, contexto) -> dict:
    motivos = _Motivos()
    if not _claves_exactas(crudo, esquemas.ESQUELETO["properties"], "esqueleto", motivos):
        motivos.cerrar()
    hitos_del_lugar = {hito["clave"] for hito in contexto["hitos"]}
    hitos = _lista(crudo["hitos"], "hitos", motivos, maximo=len(hitos_del_lugar))
    if any(hito not in hitos_del_lugar for hito in hitos) or len(set(hitos)) != len(hitos):
        motivos.falta("hitos: deben ser claves distintas de los hitos del lugar.")
    objetivos = [
        _texto(objetivo, MAXIMO_OBJETIVO, f"objetivosAprendizaje[{posicion}]", motivos)
        for posicion, objetivo in enumerate(_lista(crudo["objetivosAprendizaje"], "objetivosAprendizaje", motivos, minimo=1, maximo=esquemas.MAXIMO_OBJETIVOS))
    ]
    escenas = [
        _escena_del_esqueleto(escena, contexto, motivos, f"escenas[{posicion}]")
        for posicion, escena in enumerate(_lista(crudo["escenas"], "escenas", motivos, minimo=esquemas.MINIMO_ESCENAS, maximo=esquemas.MAXIMO_ESCENAS))
    ]
    finales = [
        _final_del_esqueleto(final, set(hitos), motivos, f"finales[{posicion}]")
        for posicion, final in enumerate(_lista(crudo["finales"], "finales", motivos, minimo=esquemas.MINIMO_FINALES, maximo=esquemas.MAXIMO_FINALES))
    ]
    motivos.cerrar()
    escenas, finales = [escena for escena in escenas if escena], [final for final in finales if final]
    _grafo_del_esqueleto(escenas, motivos)
    claves_de_final = [final["clave"] for final in finales]
    if len(set(claves_de_final)) != len(claves_de_final):
        motivos.falta("finales: una clave se repite.")
    por_defecto = [posicion for posicion, final in enumerate(finales) if not final["cuando"]]
    if por_defecto != [len(finales) - 1]:
        motivos.falta("finales: solo el último puede ir sin condición, y debe ir sin condición.")
    esqueleto = {
        "titulo": _texto(crudo["titulo"], MAXIMO_TITULO, "titulo", motivos),
        "contexto": _texto(crudo["contexto"], MAXIMO_CONTEXTO, "contexto", motivos, multilinea=True),
        "objetivosAprendizaje": objetivos, "escenas": escenas, "hitos": hitos, "finales": finales,
    }
    motivos.cerrar()
    return esqueleto


# ─── una escena ───────────────────────────────────────────────────────────────────────────────────


def _linea(crudo, personajes, motivos, ruta):
    propiedades = esquemas.ESCENA["properties"]["lineas"]["items"]["properties"]
    if not _claves_exactas(crudo, propiedades, ruta, motivos):
        return None
    if crudo["personaje"] not in personajes:
        motivos.falta(f"{ruta}: el personaje no está en esa sala.")
    if crudo["emocion"] not in EXPRESIONES:
        motivos.falta(f"{ruta}: la emoción no es válida.")
    return {
        "personaje": crudo["personaje"], "texto": _texto(crudo["texto"], MAXIMO_LINEA, f"{ruta}.texto", motivos),
        "emocion": crudo["emocion"],
    }


def _paso(valor) -> bool:
    return type(valor) is int and -1 <= valor <= 1


def _opcion(crudo, esqueleto, escena, competencias, motivos, ruta):
    propiedades = esquemas.ESCENA["properties"]["opciones"]["items"]["properties"]
    if not _claves_exactas(crudo, propiedades, ruta, motivos):
        return None
    if crudo["clase"] not in {miembro.value for miembro in ResponseClass}:
        motivos.falta(f"{ruta}: la clase no es válida.")
    razon = _texto(crudo["razonProhibicion"], MAXIMO_RETROALIMENTACION, f"{ruta}.razonProhibicion", motivos, obligatorio=False)
    if crudo["clase"] == ResponseClass.CONTRAINDICATED.value and not razon:
        motivos.falta(f"{ruta}: una opción contraindicada exige su razón.")
    if crudo["destino"] not in escena["siguientes"]:
        motivos.falta(f"{ruta}: el destino debe ser uno de los siguientes de la escena.")
    if not _paso(crudo["efectoVinculo"]) or not _paso(crudo["efectoActivacion"]):
        motivos.falta(f"{ruta}: los efectos sobre la persona van de -1 a 1.")
    hitos = _lista(crudo["hitos"], f"{ruta}.hitos", motivos, maximo=case_rules.MAX_EFFECT_ENTRIES)
    if any(hito not in esqueleto["hitos"] for hito in hitos):
        motivos.falta(f"{ruta}: nombra un hito que el caso no declara.")
    codigos = _lista(crudo["competencias"], f"{ruta}.competencias", motivos, maximo=case_rules.MAX_EFFECT_ENTRIES)
    if any(codigo not in competencias for codigo in codigos):
        motivos.falta(f"{ruta}: nombra una competencia que el catálogo no tiene.")
    if crudo["reaccionEmocion"] not in ("", *EXPRESIONES) or crudo["reaccionGesto"] not in ("", *GESTOS):
        motivos.falta(f"{ruta}: la reacción usa una emoción o un gesto fuera del vocabulario.")
    return {
        "clave": _clave(crudo["clave"], f"{ruta}.clave", motivos),
        "texto": _texto(crudo["texto"], MAXIMO_OPCION, f"{ruta}.texto", motivos),
        "clase": crudo["clase"],
        "retroalimentacion": _texto(crudo["retroalimentacion"], MAXIMO_RETROALIMENTACION, f"{ruta}.retroalimentacion", motivos),
        "razonProhibicion": razon, "destino": crudo["destino"],
        "efectoVinculo": crudo["efectoVinculo"], "efectoActivacion": crudo["efectoActivacion"],
        "hitos": list(dict.fromkeys(hitos)), "competencias": list(dict.fromkeys(codigos)),
        "requiere": _condicion(crudo["requiere"], f"{ruta}.requiere", motivos, con_hechos=True),
        "reaccionLinea": _texto(crudo["reaccionLinea"], MAXIMO_REACCION, f"{ruta}.reaccionLinea", motivos, obligatorio=False),
        "reaccionEmocion": crudo["reaccionEmocion"], "reaccionGesto": crudo["reaccionGesto"],
    }


def _comentario(crudo, personajes, motivos, ruta):
    propiedades = esquemas.ESCENA["properties"]["comentarios"]["items"]["properties"]
    if not _claves_exactas(crudo, propiedades, ruta, motivos):
        return None
    if crudo["personaje"] not in personajes:
        motivos.falta(f"{ruta}: el personaje no está en esa sala.")
    if crudo["emocion"] not in ("", *EXPRESIONES) or crudo["gesto"] not in ("", *GESTOS):
        motivos.falta(f"{ruta}: usa una emoción o un gesto fuera del vocabulario.")
    return {
        "personaje": crudo["personaje"], "linea": _texto(crudo["linea"], MAXIMO_REACCION, f"{ruta}.linea", motivos),
        "cuando": _condicion(crudo["cuando"], f"{ruta}.cuando", motivos, con_hechos=True),
        "emocion": crudo["emocion"], "gesto": crudo["gesto"],
    }


def validar_escena(crudo, esqueleto, sala, contexto, competencias) -> dict:
    """La escena ``sala`` del esqueleto: líneas de los personajes de la sala y opciones que llevan a sus siguientes."""
    motivos = _Motivos()
    if not _claves_exactas(crudo, esquemas.ESCENA["properties"], "escena", motivos):
        motivos.cerrar()
    escena = next(entrada for entrada in esqueleto["escenas"] if entrada["sala"] == sala)
    sala_del_lugar = next(entrada for entrada in contexto["salas"] if entrada["id"] == sala)
    personajes = {persona["personaje"] for persona in sala_del_lugar["personas"]}
    codigos = {competencia["codigo"] for competencia in competencias}
    lineas = [
        _linea(linea, personajes, motivos, f"lineas[{posicion}]")
        for posicion, linea in enumerate(_lista(crudo["lineas"], "lineas", motivos, minimo=1, maximo=esquemas.MAXIMO_LINEAS))
    ]
    minimo_de_opciones = 0 if escena["final"] else esquemas.MINIMO_OPCIONES
    maximo_de_opciones = 0 if escena["final"] else esquemas.MAXIMO_OPCIONES
    opciones = [
        _opcion(opcion, esqueleto, escena, codigos, motivos, f"opciones[{posicion}]")
        for posicion, opcion in enumerate(_lista(crudo["opciones"], "opciones", motivos, minimo=minimo_de_opciones, maximo=maximo_de_opciones))
    ]
    pistas = [
        _texto(pista, MAXIMO_PISTA, f"pistas[{posicion}]", motivos)
        for posicion, pista in enumerate(_lista(crudo["pistas"], "pistas", motivos, maximo=esquemas.MAXIMO_PISTAS))
    ]
    comentarios = [
        _comentario(comentario, personajes, motivos, f"comentarios[{posicion}]")
        for posicion, comentario in enumerate(_lista(crudo["comentarios"], "comentarios", motivos, maximo=esquemas.MAXIMO_COMENTARIOS))
    ]
    motivos.cerrar()
    opciones = [opcion for opcion in opciones if opcion]
    claves = [opcion["clave"] for opcion in opciones]
    if len(set(claves)) != len(claves):
        motivos.falta("opciones: una clave se repite.")
    if opciones and all(opcion["clase"] == ResponseClass.CONTRAINDICATED.value for opcion in opciones):
        motivos.falta("opciones: alguna debe poder elegirse sin ser contraindicada.")
    if set(escena["siguientes"]) - {opcion["destino"] for opcion in opciones} and not escena["final"]:
        motivos.falta("opciones: cada siguiente de la escena necesita al menos una opción que lleve a él.")
    normalizada = {
        "narracion": _texto(crudo["narracion"], MAXIMO_NARRACION, "narracion", motivos, multilinea=True),
        "pregunta": _texto(crudo["pregunta"], MAXIMO_PREGUNTA, "pregunta", motivos, obligatorio=not escena["final"]),
        "lineas": [linea for linea in lineas if linea], "opciones": opciones, "pistas": pistas,
        "comentarios": [comentario for comentario in comentarios if comentario],
    }
    motivos.cerrar()
    return normalizada
