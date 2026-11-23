"""El generador determinista del proveedor falso: arma un esqueleto y sus escenas válidos desde el contexto del lugar.

Sin red ni azar: la misma petición da siempre la misma salida. Es lo que usan las pruebas y el desarrollo.
"""
import json

#: La primera línea de las instrucciones de toda generación; ``ProveedorFalso`` la reconoce con ella.
MARCA = "GENERACION-DE-CASOS"
ESCENAS_DEL_FALSO = 4
MAXIMO_CONTEXTO_DEL_FALSO = 1000
PRIMERAS_OPCIONES = ("opcion-1", "opcion-2", "opcion-3", "opcion-4")


def _esqueleto(descripcion: str, contexto: dict) -> dict:
    con_personas = [sala for sala in contexto["salas"] if sala["personas"]][:ESCENAS_DEL_FALSO]
    ultima = len(con_personas) - 1
    escenas = []
    for posicion, sala in enumerate(con_personas):
        siguientes = [] if posicion == ultima else [
            destino["id"] for destino in con_personas[posicion + 1:posicion + 3]
        ]
        escenas.append({
            "sala": sala["id"], "titulo": sala["nombre"], "persona": sala["personas"][0]["clave"],
            "intensidad": "HIGH" if posicion == 1 else "MEDIUM",
            "advertencia": "Esta escena trata una situación delicada." if posicion == 1 else "",
            "final": posicion == ultima, "siguientes": siguientes,
        })
    return {
        "titulo": f"Caso en {contexto['lugar']['nombre']}",
        "contexto": descripcion[:MAXIMO_CONTEXTO_DEL_FALSO],
        "objetivosAprendizaje": ["Reconocer las señales de riesgo en la atención.", "Elegir una respuesta que cuide a la persona."],
        "escenas": escenas,
        "hitos": [hito["clave"] for hito in contexto["hitos"][:2]],
        "finales": [
            {"clave": "final-logrado", "titulo": "Acompañamiento logrado", "mensaje": "La persona se sintió escuchada y acompañada.",
             "tono": "positive", "cuando": json.dumps({"count": "recommended", "gte": 1})},
            {"clave": "final-abierto", "titulo": "Camino por continuar", "mensaje": "La atención sigue abierta.",
             "tono": "neutral", "cuando": ""},
        ],
    }


def _opcion(posicion: int, destino: str, clase: str, hitos: list[str], competencias: list[str]) -> dict:
    contraindicada = clase == "CONTRAINDICATED"
    return {
        "clave": PRIMERAS_OPCIONES[posicion], "texto": f"Respuesta {posicion + 1} de la persona profesional.", "clase": clase,
        "retroalimentacion": "Esta respuesta tiene consecuencias en el vínculo con la persona consultante.",
        "razonProhibicion": "Puede poner en riesgo a la persona." if contraindicada else "", "destino": destino,
        "efectoVinculo": -1 if contraindicada else 1, "efectoActivacion": 1 if contraindicada else 0,
        "hitos": hitos if clase == "RECOMMENDED" else [], "competencias": competencias if clase == "RECOMMENDED" else [],
        "requiere": "", "reaccionLinea": "", "reaccionEmocion": "", "reaccionGesto": "",
    }


def _escena(entrada: dict) -> dict:
    esqueleto, sala, contexto = entrada["esqueleto"], entrada["sala"], entrada["contexto"]
    escena = next(candidata for candidata in esqueleto["escenas"] if candidata["sala"] == sala)
    persona = next(persona for sala_del_lugar in contexto["salas"] if sala_del_lugar["id"] == sala for persona in sala_del_lugar["personas"])
    siguientes = escena["siguientes"]
    hitos = esqueleto["hitos"][:1]
    competencias = [competencia["codigo"] for competencia in contexto["competencias"][:1]]
    clases = [(destino, "RECOMMENDED") for destino in siguientes]
    if siguientes:
        clases += [(siguientes[0], "ACCEPTABLE"), (siguientes[-1], "CONTRAINDICATED")]
    return {
        "narracion": f"La conversación continúa en {escena['titulo']}.",
        "pregunta": "" if escena["final"] else "¿Cómo respondes a la persona?",
        "lineas": [
            {"personaje": persona["personaje"], "texto": "Necesito contarte lo que me pasa.", "emocion": "preocupada"},
            {"personaje": persona["personaje"], "texto": "No sé si es buena idea hablarlo.", "emocion": "cautelosa"},
        ],
        "opciones": [_opcion(posicion, destino, clase, hitos, competencias) for posicion, (destino, clase) in enumerate(clases)],
        "pistas": ["Observa con calma lo que dice la persona."],
        "comentarios": [{"personaje": persona["personaje"], "linea": "Gracias por escucharme.", "cuando": "", "emocion": "", "gesto": ""}],
    }


def responder(mensajes: list[dict]) -> str:
    """El JSON de la etapa que pide el último mensaje."""
    entrada = json.loads(mensajes[-1]["content"])
    if entrada["etapa"] == "esqueleto":
        return json.dumps(_esqueleto(entrada["descripcion"], entrada["contexto"]), ensure_ascii=False)
    return json.dumps(_escena(entrada), ensure_ascii=False)
