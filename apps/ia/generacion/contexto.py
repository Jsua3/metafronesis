"""El contexto que se le da a la IA: lo que el lugar de la biblioteca ofrece y las competencias del catálogo.

``del_lugar`` es puro (recibe datos). Las claves de objeto salen de ``copiar_al_caso.claves_de_sala``: son las mismas que la
copia crea en la base, así que lo que la IA nombra existe en el caso. ``competencias_activas`` es la única consulta.
"""
from apps.biblioteca.services import copiar_al_caso
from apps.simulation.models import Competency
from apps.simulation.models.vocabulary import Intensity, ResponseClass
from apps.simulation.services.disponibilidad_mundo import EXPRESIONES, GESTOS

from .esquemas import TONOS_DE_FINAL


def competencias_activas() -> list[dict]:
    return [{"codigo": competencia.code, "nombre": competencia.name} for competencia in Competency.objects.filter(active=True)]


def _sala(sala: dict, personajes: dict, objetos: dict) -> dict:
    claves = copiar_al_caso.claves_de_sala(sala)
    personas = []
    for colocado, clave in zip(sala.get("personajes", []), claves["personajes"]):
        info = personajes.get(colocado["ref"], {})
        personas.append({"clave": clave, "personaje": colocado["ref"], "nombre": info.get("nombre", ""), "rol": info.get("rol", "")})
    revisables = []
    for colocado, clave in zip(sala.get("objetos", []), claves["objetos"]):
        modelo = objetos.get(colocado["ref"], {})
        revisables.append({"clave": clave, "nombre": modelo.get("nombre", ""), "alRevisar": modelo.get("alRevisar", "")})
    return {
        "id": sala["id"], "nombre": sala.get("nombre", ""), "descripcion": sala.get("descripcion", ""),
        "personas": personas, "objetos": revisables,
    }


def del_lugar(lugar: dict, competencias: list[dict]) -> dict:
    """El contexto del lugar: salas con sus personas y objetos revisables, hitos, competencias y vocabularios."""
    catalogo = lugar.get("catalogo", {})
    personajes = {personaje["id"]: personaje for personaje in lugar.get("personajes", [])}
    objetos = {objeto["id"]: objeto for objeto in catalogo.get("objetos", [])}
    return {
        "lugar": {"id": lugar["id"], "nombre": lugar.get("nombre", ""), "descripcion": lugar.get("descripcion", "")},
        "salas": [_sala(sala, personajes, objetos) for sala in lugar.get("salas", [])],
        "hitos": [
            {
                "clave": copiar_al_caso.clave_de_hito(hito["key"]), "nombre": hito.get("label", ""),
                "descripcion": hito.get("description", ""), "decisivo": bool(hito.get("decisive", False)),
            }
            for hito in lugar.get("hitos", [])
        ],
        "competencias": [{"codigo": competencia["codigo"], "nombre": competencia["nombre"]} for competencia in competencias],
        "listas": {
            "clases": [miembro.value for miembro in ResponseClass],
            "emociones": list(EXPRESIONES),
            "gestos": list(GESTOS),
            "intensidades": [miembro.value for miembro in Intensity],
            "tonos": list(TONOS_DE_FINAL),
        },
    }
