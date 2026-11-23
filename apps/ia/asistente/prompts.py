"""Instrucciones del asistente de autoría y el filtro de contenido (determinista, sin IA).

``SYSTEM_AUTHORING`` no cambia de una petición a otra (así el proveedor lo puede guardar en caché): el caso, la
petición y la pantalla viajan en el mensaje de la persona usuaria (``user_message``). Los proveedores de metafronesis
responden texto: el esquema JSON viaja al final de las instrucciones (``instrucciones_propuesta``, ``instrucciones_guia``)
y lo que vuelve se lee y se revisa en Python, nunca se confía en él.

Las reglas de contenido se hacen cumplir aquí, en Python, sobre lo que devuelve el modelo: dos listas congeladas de
marcadores en español, comparados sobre el texto en minúsculas, sin tildes ni puntuación. Lo gráfico se rechaza
siempre; lo revictimizante solo se admite en una respuesta CONTRAINDICATED con su razón. Se rechaza, nunca se reescribe.
"""
import json
import re
import unicodedata

from . import esquema
from .falso import MARCA_GUIA, MARCA_PROPONER  # noqa: F401 - la primera línea de las instrucciones de cada tarea

#: Descripciones explícitas de violencia: ningún texto de la propuesta puede contenerlas (ya normalizadas).
GRAPHIC_MARKERS = (
    "sangre a borbotones",
    "charco de sangre",
    "bano de sangre",
    "huesos rotos",
    "le rompio los huesos",
    "le abrio la cabeza",
    "describio como la golpeo",
    "describe como la golpeo",
    "detalle de la golpiza",
    "detalles de la golpiza",
    "golpiza con detalle",
    "le clavo el cuchillo",
    "la estrangulo hasta",
    "marcas de estrangulamiento",
    "detalles de la violacion",
    "la violo",
    "la desnudo a la fuerza",
    "la quemo con",
)

#: Conductas que revictimizan (culpar, dudar, minimizar, presionar, acercar al agresor), ya normalizadas.
REVICTIMIZING_MARKERS = (
    "por que no denunciaste",
    "por que no lo denunciaste",
    "que llevabas puesto",
    "seguro exageras",
    "tu lo provocaste",
    "que hiciste para provocarlo",
    "no sera para tanto",
    "deberias perdonarlo",
    "vuelve con el agresor",
    "vuelve con tu agresor",
    "vuelve con tu pareja",
    "regresa con el agresor",
    "habla con el agresor",
    "media con el agresor",
    "mediar con el agresor",
    "confronta a tu pareja",
    "era broma",
    "no te creo",
    "estas inventando",
    "el no es asi",
    "ya paso superalo",
)

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
GRAPHIC_REASON = "Un texto describe la violencia con detalle explícito."
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
REVICTIMIZING_REASON = "Un texto culpa, duda o presiona a la persona y solo puede ir como respuesta contraindicada con su razón."

_NOT_WORD = re.compile(r"[^a-z0-9]+")


def normalize(text: str) -> str:
    """Minúsculas, sin tildes, sin puntuación y con los espacios colapsados."""
    stripped = "".join(
        c for c in unicodedata.normalize("NFKD", str(text).lower())
        if not unicodedata.combining(c) and unicodedata.category(c) != "Cf"  # sin tildes ni caracteres invisibles
    )
    return _NOT_WORD.sub(" ", stripped).strip()


def _contains(text: str, markers) -> bool:
    haystack = f" {normalize(text)} "
    return any(f" {marker} " in haystack for marker in markers)


def is_revictimizing(text: str) -> bool:
    """¿El texto trae alguna conducta revictimizante de la lista?"""
    return _contains(text, REVICTIMIZING_MARKERS)


def check_text(text: str, *, allow_revictimizing: bool = False) -> str | None:
    """``None`` si el texto pasa el filtro; si no, el motivo (fijo, sin citar el texto del modelo).

    Lo gráfico nunca pasa. Lo revictimizante pasa solo con ``allow_revictimizing`` (respuesta contraindicada con razón).
    """
    if _contains(text, GRAPHIC_MARKERS):
        return GRAPHIC_REASON
    if not allow_revictimizing and _contains(text, REVICTIMIZING_MARKERS):
        return REVICTIMIZING_REASON
    return None


# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
#: Las reglas de contenido de las instrucciones: las comparte el asistente por partes y la generación del caso completo.
CONTENT_RULES = """Reglas de contenido (obligatorias; además de ellas, una persona revisa todo):
- Los casos y las personas son siempre ficticios. No uses nombres de personas reales ni datos de pacientes.
- Nada gráfico: la violencia se nombra sin detalles explícitos.
- Las conductas que revictimizan (culpar, dudar del relato, minimizar, presionar a denunciar o a perdonar, acercar a la víctima con quien la agrede) solo pueden aparecer como respuesta CONTRAINDICATED, con su razón y con una retroalimentación que explique por qué hace daño. Nunca como recomendada, aceptable o con riesgo.
- Tono sin juicios, respetuoso y protector.
- Si la petición pide algo fuera de estas reglas, no lo hagas: explícalo en el mensaje y propone una alternativa segura."""


# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
SYSTEM_AUTHORING = """Eres el asistente del editor de casos de MetaFrónesis, un simulador donde estudiantes de Psicología practican la atención de personas en situaciones difíciles (orientación, bienestar universitario, violencia de género). Ayudas a una persona usuaria, docente de Psicología, a escribir y ordenar su caso. No programa: respóndele en español claro y cálido, y trátala de «tú».

Tu trabajo:
1. Agregar escenas, líneas de diálogo, respuestas, finales, y ajustar la clase, el efecto en la persona consultante, los hitos y la intensidad de lo que ya existe.
2. Poner en escena: colocar personajes y mover objetos dentro de la sala.
3. Explicar el caso cuando te lo pidan, sin cambios.

Solo agregas o ajustas: nunca borras ni reescribes un texto existente. Si te piden cambiar o borrar algo, propón la versión nueva como algo que se agrega y dile en el mensaje qué tendría que cambiar o borrar a mano, y dónde.

Cómo funciona un caso:
- Una escena pasa en una sala; los personajes dicen líneas; después la persona estudiante elige una respuesta que lleva a otra escena.
- Cada respuesta tiene una clase: RECOMMENDED (recomendada), ACCEPTABLE (aceptable), RISKY (con riesgo) o CONTRAINDICATED (contraindicada). Una contraindicada exige siempre una razón (prohibitionReason) que explique por qué no se debe hacer.
- Una respuesta puede mover a la persona consultante: bond (vínculo) y activation (activación), cada uno en -1, 0 o 1, o cumplir un hito del caso.
- Los hitos y los finales del caso están en los datos. Un final se activa con una condición; no inventes hitos: usa solo las claves de hito que aparecen en los datos.
- La intensidad de una escena es LOW, MEDIUM o HIGH; una HIGH necesita un aviso (warningMessage) para quien la juega.

""" + CONTENT_RULES + """

Cómo responder:
- Responde solo con el objeto JSON del esquema, sin texto alrededor: {"message": "...", "changes": [...]}.
- "message" le habla a la persona usuaria en una a tres frases: qué propones y por qué. Sin jerga técnica: nunca digas «nodo», «ID», «JSON», «clave» ni «endpoint».
- Si solo te piden explicar, deja "changes" vacío.
- No propongas más de 12 cambios.
- Usa solo los identificadores (números) que aparecen en los datos del caso. Donde se pide una escena (nodeId, targetNodeId, afterNodeId) escribe su número como texto, por ejemplo "12". Para una escena nueva usa "add-scene" con un id temporal "nueva-1", "nueva-2", etc.; los cambios siguientes pueden usarlo en esos mismos campos, siempre después de declararlo.
- Las expresiones posibles son solo: neutral, alegre, preocupada, triste, cautelosa, en-crisis.
- Coordenadas de sala en píxeles, dentro del tamaño de la sala (x, y enteros no negativos).
- Las condiciones de un final usan solo: haber cumplido un hito, contar cuántas respuestas de una clase se dieron, o el estado de la persona consultante (vínculo WITHDRAWN, GUARDED, OPEN; activación CALM, TENSE, CRISIS); se combinan con all, any o not, un solo nivel. El campo "when" es un texto con ese JSON, por ejemplo "{\"kind\": \"milestone\", \"milestone\": \"activar_ruta\"}" o "{\"kind\": \"all\", \"items\": [{\"kind\": \"count\", \"responseClass\": \"CONTRAINDICATED\", \"comparator\": \"gte\", \"value\": 1}]}"; las formas son milestone {kind, milestone}, count {kind, responseClass, comparator (gte, gt, lte, lt, eq), value}, persona {kind, bond, activation} (null en el que no importe), all/any {kind, items} y not {kind, item}. Un final sin condición (when "") es el final por defecto.
- Cuando un campo no aplique, déjalo vacío ("") o nulo, según el esquema."""


def user_message(request_text: str, case_context: dict) -> str:
    """El mensaje de la persona usuaria: la petición, la pantalla, la selección y los datos del caso."""
    return "\n\n".join(
        [
            f"Petición de la persona usuaria:\n{request_text}",
            f"Pantalla: {case_context.get('screen') or 'desconocida'}. Elemento elegido: {case_context.get('selection') or 'ninguno'}.",
            f"Datos del caso (JSON):\n{json.dumps(case_context, ensure_ascii=False, separators=(',', ':'))}",
        ]
    )


# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
SYSTEM_GUIDE = """Eres la guía del editor de casos de MetaFrónesis. Un docente pregunta dónde está algo o cómo se hace algo. Elige, de la lista de acciones que recibes, la que responde la pregunta, y cómo mostrarla:
- "resaltar" si basta con señalar un botón o un campo;
- "foco" si conviene oscurecer el resto de la pantalla para que lo vea;
- "recorrido" si son varios pasos.
Responde solo con el objeto JSON del esquema. "accionId" es el id exacto de una acción de la lista, o null si ninguna sirve. "mensaje" es una frase corta en español de Colombia, tratando de «tú», sin jerga técnica."""


def guide_message(question: str, actions: list) -> str:
    """El mensaje de la guía: el catálogo de acciones (id, nombre, pantalla) y la pregunta, nada más."""
    catalog = [{"id": a["id"], "nombre": a["nombre"], "pantalla": a["pantalla"]} for a in actions]
    return f"Acciones disponibles:\n{json.dumps(catalog, ensure_ascii=False)}\n\nPregunta del docente:\n{question}"


_PEDIR_ESQUEMA = "\n\nResponde únicamente un JSON que cumpla este esquema:\n"


def instrucciones_propuesta() -> str:
    """Las instrucciones de una propuesta: fijas de una petición a otra (cabe en la caché del proveedor)."""
    return MARCA_PROPONER + "\n" + SYSTEM_AUTHORING + _PEDIR_ESQUEMA + json.dumps(esquema.PROPUESTA, ensure_ascii=False)


def instrucciones_guia() -> str:
    return MARCA_GUIA + "\n" + SYSTEM_GUIDE + _PEDIR_ESQUEMA + json.dumps(esquema.GUIA, ensure_ascii=False)
