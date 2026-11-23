"""El contexto del caso que se le cuenta a la IA: solo contenido del caso, nunca datos de intentos ni de cuentas.

Se arma desde la vista de lectura del editor (``apps.autoria.editor.vista``) más los diálogos, con los mismos nombres de
campo que usan las propuestas (``nodeId``, ``mapId``, ``characterId``…), de modo que un id del contexto es un id que
la propuesta puede nombrar. Los textos largos se recortan para no gastar contexto.
"""
import json

from apps.autoria.editor import vista
from apps.simulation.models.world import DialogueLine, DialogueTree

MAX_TEXT = 600
MAX_SELECTION = 200


def _clip(value, limit=MAX_TEXT):
    text = value if isinstance(value, str) else ""
    return text if len(text) <= limit else text[:limit]


def _selection(selection):
    if selection is None:
        return None
    text = selection if isinstance(selection, str) else json.dumps(selection, ensure_ascii=False)
    return text[:MAX_SELECTION]


def _dialogues(case_version_id, objects):
    """Las líneas de los diálogos de la versión; el personaje sale del objeto al que está atado el diálogo."""
    character_of = {o["id"]: o["characterId"] for o in objects}
    trees = {
        tree.id: tree
        for tree in DialogueTree.objects.filter(scene_map__case_version_id=case_version_id).order_by("id")
    }
    lines = DialogueLine.objects.filter(dialogue_tree_id__in=list(trees)).order_by("dialogue_tree_id", "display_order", "id")
    return [
        {
            "dialogueId": line.dialogue_tree_id,
            "mapId": trees[line.dialogue_tree_id].scene_map_id,
            "characterId": character_of.get(trees[line.dialogue_tree_id].map_object_id),
            "text": _clip(line.text),
            "expression": line.emotion,
            "order": line.display_order,
        }
        for line in lines
    ]


def construir(case_version, screen: str, selection=None) -> dict:
    """Escenas, líneas, respuestas (con clase), salas y sus elementos, personajes, hitos y finales de la versión."""
    view = vista(case_version)
    rules = view["rules"]
    return {
        "screen": screen,
        "selection": _selection(selection),
        "title": view["title"],
        "nodes": [
            {
                "id": n["id"], "title": n["title"], "text": _clip(n["narrative"]), "prompt": _clip(n["decisionPrompt"]),
                "order": n["displayOrder"], "intensity": n["intensity"], "terminal": n["terminal"], "start": n["startNode"],
            }
            for n in view["nodes"]
        ],
        "dialogues": _dialogues(case_version.id, view["objects"]),
        "decisions": [
            {
                "id": d["id"], "nodeId": d["sourceNodeId"], "text": _clip(d["text"]), "responseClass": d["responseClass"],
                "effects": d["effects"], "feedback": _clip(d["feedbackText"]), "nextNodeId": d["targetNodeId"],
                "prohibitionReason": _clip(d["prohibitionReason"]),
            }
            for d in view["decisions"]
        ],
        "maps": [
            {"id": m["id"], "name": m["title"], "mapKey": m["key"], "nodeId": m["nodeId"], "width": m["width"], "height": m["height"]}
            for m in view["maps"]
        ],
        "objects": [
            {"id": o["id"], "mapId": o["mapId"], "type": o["type"], "name": o["label"], "x": o["x"], "y": o["y"],
             "characterId": o["characterId"]}
            for o in view["objects"]
        ],
        "characters": [{"id": c["id"], "name": c["displayName"], "role": c["roleLabel"]} for c in view["characters"]],
        "milestones": [
            {"key": m["key"], "label": m["label"], "detail": _clip(m["description"]), "decisive": m["decisive"]}
            for m in rules["milestones"]
        ],
        "endings": [dict(e) for e in rules["endings"]],
        "riskLevel": rules["riskLevel"],
    }
