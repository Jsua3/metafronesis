"""Edición de diálogos, herramientas, personajes y orden de escenas."""
from uuid import uuid4

from django.db import transaction
from django.shortcuts import get_object_or_404

from apps.simulation.models import DecisionOption, SimulationNode
from apps.simulation.models.world import CaseCharacter, ClinicalTool, DialogueChoice, DialogueLine, DialogueTree, MapObject, SceneMap
from apps.simulation.services.audit_service import auditable
from shared.jsonutils import write_map
from . import editor, guardas, mundo


def _texto(valor, nombre, limite=None, obligatorio=False):
    if not isinstance(valor, str) or (obligatorio and not valor.strip()) or (limite and len(valor) > limite):
        mundo._error(f"El campo {nombre} no es válido.")
    return valor


def _lineas(arbol, lineas, campo_orden):
    if not isinstance(lineas, list) or any(not isinstance(linea, dict) for linea in lineas):
        mundo._error("Las líneas deben ser una lista de objetos.")
    ordenes = [mundo._entero_mundo(linea.get(campo_orden), "orden") for linea in lineas]
    if len(set(ordenes)) != len(ordenes):
        mundo._error("Las líneas deben tener órdenes únicos.")
    anteriores = dict(arbol.lines.values_list("display_order", "ai_suggested"))
    arbol.lines.all().delete()
    for linea, orden in zip(lineas, ordenes):
        if "aiSuggested" in linea and not isinstance(linea["aiSuggested"], bool):
            mundo._error("La marca de sugerencia debe ser verdadera o falsa.")
        DialogueLine.objects.create(dialogue_tree=arbol, display_order=orden,
            speaker_name=_texto(linea.get("speakerName") or arbol.speaker_name, "speakerName", 255),
            text=_texto(linea.get("text") or "", "text"),
            emotion=_texto(linea.get("emotion") if linea.get("emotion") is not None else "neutral", "emotion", 60),
            ai_suggested=linea.get("aiSuggested", anteriores.get(orden, False)))


def _opciones(version, arbol, opciones):
    if not isinstance(opciones, list) or any(not isinstance(opcion, dict) for opcion in opciones):
        mundo._error("Las opciones deben ser una lista de objetos.")
    claves = [_texto(opcion.get("key") or "", "key", 120) for opcion in opciones]
    if len(set(claves)) != len(claves):
        mundo._error("Las opciones deben tener claves únicas.")
    arbol.choices.all().delete()
    for opcion, clave in zip(opciones, claves):
        decision_id = opcion.get("decisionOptionId")
        decision = get_object_or_404(DecisionOption, case_version=version, pk=decision_id) if decision_id is not None else None
        efecto = opcion.get("effect") or {}
        if not isinstance(efecto, dict):
            mundo._error("El efecto debe ser un objeto.")
        herramienta = opcion.get("requiredToolCode")
        if herramienta is not None:
            _texto(herramienta, "requiredToolCode", 80)
        DialogueChoice.objects.create(dialogue_tree=arbol, choice_key=clave, text=_texto(opcion.get("text") or "", "text"),
            decision_option=decision, required_tool_code=herramienta, effect_json=write_map(efecto),
            display_order=mundo._entero_mundo(opcion.get("displayOrder"), "displayOrder"))


def guardar_dialogos(version, mapa, dialogos):
    if not isinstance(dialogos, list) or any(not isinstance(dialogo, dict) for dialogo in dialogos):
        mundo._error("Los diálogos deben ser una lista de objetos.")
    claves = [_texto(dialogo.get("key") or "", "key", 120) for dialogo in dialogos]
    if len(set(claves)) != len(claves):
        mundo._error("Los diálogos deben tener claves únicas.")
    existentes = list(DialogueTree.objects.filter(scene_map=mapa))
    por_id = {arbol.pk: arbol for arbol in existentes}
    por_clave = {arbol.tree_key: arbol for arbol in existentes}
    for dialogo in dialogos:
        if dialogo.get("id") is not None:
            mundo._entero_mundo(dialogo["id"], "dialogues.id")
    reclamados = {dialogo.get("id") for dialogo in dialogos if dialogo.get("id") in por_id}
    elegidos = []
    for datos, clave in zip(dialogos, claves):
        identificador = datos.get("id")
        if identificador is not None:
            mundo._entero_mundo(identificador, "dialogues.id")
        arbol = por_id.get(identificador)
        if arbol is None:
            candidato = por_clave.get(clave)
            arbol = candidato if candidato and candidato.pk not in reclamados else None
        arbol = arbol or DialogueTree(scene_map=mapa)
        if arbol.pk and arbol.pk in [elegido.pk for elegido in elegidos]:
            mundo._error("Un diálogo aparece más de una vez.")
        elegidos.append(arbol)
    DialogueTree.objects.filter(scene_map=mapa).exclude(pk__in=[arbol.pk for arbol in elegidos if arbol.pk]).delete()
    for arbol in elegidos:
        if arbol.pk:
            DialogueTree.objects.filter(pk=arbol.pk).update(tree_key=f"__temporal_{uuid4().hex}")
    for datos, clave, arbol in zip(dialogos, claves, elegidos):
        arbol.tree_key = clave
        arbol.speaker_name = _texto(datos.get("speakerName") or "", "speakerName", 255)
        arbol.portrait_key = datos.get("portraitKey")
        if arbol.portrait_key is not None:
            _texto(arbol.portrait_key, "portraitKey", 120)
        arbol.emotion = _texto(datos.get("emotion") if datos.get("emotion") is not None else "neutral", "emotion", 60)
        objeto_id = datos.get("mapObjectId")
        objeto_clave = datos.get("mapObjectKey")
        arbol.map_object = get_object_or_404(MapObject, scene_map=mapa, object_key=objeto_clave) if objeto_clave is not None else (get_object_or_404(MapObject, scene_map=mapa, pk=objeto_id) if objeto_id is not None else None)
        arbol.save()
        _lineas(arbol, datos.get("lines") or [], "order")
        _opciones(version, arbol, datos.get("choices") or [])


@transaction.atomic
def operar(usuario, version_id, datos, tipo, operacion, elemento_id=None, mapa_id=None):
    version = mundo._revision(usuario, version_id, datos)
    if tipo == "orden":
        orden = datos["order"]
        identificadores = set(version.nodes.values_list("id", flat=True))
        if len(orden) != len(set(orden)) or set(orden) != identificadores:
            mundo._error("El orden debe incluir cada nodo del caso exactamente una vez.")
        for posicion, nodo_id in enumerate(orden):
            SimulationNode.objects.filter(case_version=version, pk=nodo_id).update(display_order=posicion)
    else:
        modelo = {"dialogo": DialogueTree, "herramienta": ClinicalTool, "personaje": CaseCharacter}[tipo]
        if operacion == "crear":
            elemento = modelo(scene_map=get_object_or_404(SceneMap, case_version=version, pk=mapa_id)) if tipo == "dialogo" else modelo(case_version=version)
        else:
            filtros = {"scene_map__case_version": version} if tipo == "dialogo" else {"case_version": version}
            elemento = get_object_or_404(modelo, pk=elemento_id, **filtros)
        if operacion == "borrar":
            elemento.delete()
        elif tipo == "dialogo":
            elemento.tree_key = datos["treeKey"]
            mundo._unica(DialogueTree, elemento, "Ya hay un diálogo con esa clave en este mapa.", scene_map=elemento.scene_map, tree_key=elemento.tree_key)
            elemento.speaker_name = datos["speakerName"]
            elemento.portrait_key = datos.get("portraitKey")
            elemento.emotion = datos.get("emotion") if datos.get("emotion") is not None else "neutral"
            if operacion == "crear" and datos.get("mapObjectId") is not None:
                elemento.map_object = get_object_or_404(MapObject, scene_map=elemento.scene_map, pk=datos["mapObjectId"])
            elemento.save()
            _lineas(elemento, datos.get("lines") or [], "displayOrder")
        elif tipo == "herramienta":
            elemento.tool_code = datos["toolCode"]
            mundo._unica(ClinicalTool, elemento, "Ya hay una herramienta con ese código en el caso.", case_version=version, tool_code=elemento.tool_code)
            icono = datos.get("icon")
            if icono and icono != elemento.icon and icono not in mundo._iconos():
                mundo._error("El icono no está en la lista de iconos disponibles.")
            elemento.label = datos["label"]
            elemento.icon = icono if icono is not None else "psychology"
            elemento.category = datos.get("category") if datos.get("category") is not None else "clinical"
            elemento.description = datos.get("description") or ""
            elemento.active = True
            elemento.save()
        else:
            elemento.character_key = datos["characterKey"]
            mundo._unica(CaseCharacter, elemento, "Ya hay un personaje con esa clave en el caso.", case_version=version, character_key=elemento.character_key)
            for clave, campo in (("characterKey", "character_key"), ("displayName", "display_name"), ("roleLabel", "role_label"), ("portraitKey", "portrait_key"), ("showInBrief", "show_in_brief"), ("displayOrder", "display_order")):
                if clave in datos:
                    valor = datos[clave]
                    if isinstance(valor, str) and mundo.CONTROL_TEXTO.search(valor):
                        mundo._error(f"El campo {clave} debe ser texto plano en una línea.")
                    setattr(elemento, campo, valor)
            elemento.save()
    guardas.tocar(version, usuario)
    return editor.editor(usuario, version_id)
