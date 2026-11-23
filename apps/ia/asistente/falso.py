"""El asistente de autoría del proveedor falso: determinista, sin red ni azar.

Sirve a las pruebas y al desarrollo: una propuesta siempre válida (una escena nueva) y una guía que elige la primera
acción del catálogo que recibe.
"""
import json

#: La primera línea de las instrucciones de cada tarea; ``ProveedorFalso`` la reconoce con ella.
MARCA_PROPONER = "ASISTENTE-DE-AUTORIA-PROPONER"
MARCA_GUIA = "ASISTENTE-DE-AUTORIA-GUIA"
MODO_DEL_FALSO = "resaltar"


def proponer() -> str:
    escena = {
        "op": "add-scene", "id": "nueva-1", "title": "Una conversación tranquila",
        "narrative": "Las dos personas se sientan a hablar con calma.", "intensity": "MEDIUM",
        "warningMessage": "", "afterNodeId": None,
    }
    return json.dumps({"message": "Te propongo agregar una escena para conversar con calma.", "changes": [escena]},
                      ensure_ascii=False)


def guiar(mensajes: list[dict]) -> str:
    """La guía del falso: la primera acción del catálogo (``null`` si el catálogo viene vacío o ilegible)."""
    accion_id = None
    try:
        catalogo = json.loads(mensajes[-1]["content"].split("\n", 2)[1])
        accion_id = catalogo[0]["id"] if catalogo else None
    except (IndexError, KeyError, TypeError, ValueError):
        pass
    return json.dumps({"accionId": accion_id, "modo": MODO_DEL_FALSO, "mensaje": "Te muestro dónde está."},
                      ensure_ascii=False)
