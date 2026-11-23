import hashlib
import json

from .arbol import arbol_de


def _campos(objeto, nombres):
    return {nombre: getattr(objeto, nombre) for nombre in nombres}


def _datos_mundo(objeto, excluir=()):
    omitidos = {'id', 'created_at', 'updated_at', *excluir}
    return {campo.name: getattr(objeto, campo.attname) for campo in objeto._meta.concrete_fields
            if campo.name not in omitidos and not campo.is_relation}


def _mundo_de(version):
    personajes = [_datos_mundo(p) for p in version.characters.order_by('character_key')]
    herramientas = [_datos_mundo(h) for h in version.clinical_tools.order_by('tool_code')]
    mapas = []
    for mapa in version.scene_maps.select_related('node').order_by('map_key'):
        datos = _datos_mundo(mapa)
        datos['nodo'] = mapa.node.node_key
        datos['pistas'] = [_datos_mundo(p) for p in mapa.hints.order_by('hint_order', 'id')]
        datos['colisiones'] = [_datos_mundo(z) for z in mapa.collision_zones.order_by('zone_key')]
        datos['objetos'] = []
        for objeto in mapa.map_objects.select_related('character', 'decision_option').order_by('object_key'):
            datos['objetos'].append({**_datos_mundo(objeto),
                'personaje': objeto.character.character_key if objeto.character_id else None,
                'opcion': objeto.decision_option.option_key if objeto.decision_option_id else None})
        datos['dialogos'] = []
        for arbol in mapa.dialogue_trees.select_related('map_object').order_by('tree_key'):
            dialogo = {**_datos_mundo(arbol), 'objeto': arbol.map_object.object_key if arbol.map_object_id else None}
            dialogo['lineas'] = [_datos_mundo(linea) for linea in arbol.lines.order_by('display_order')]
            dialogo['opciones'] = [{**_datos_mundo(o),
                'decision': o.decision_option.option_key if o.decision_option_id else None}
                for o in arbol.choices.select_related('decision_option').order_by('display_order', 'choice_key')]
            datos['dialogos'].append(dialogo)
        mapas.append(datos)
    return {'personajes': personajes, 'herramientas': herramientas, 'mapas': mapas}


def huella_de(version) -> str:
    arbol = arbol_de(version)
    documento = _campos(version, ('narrative_context', 'learning_objectives', 'estimated_minutes', 'rules', 'world_schema_version'))
    documento['caso'] = _campos(version.simulation_case, ('code', 'title', 'description'))
    claves = {h.escena.pk: h.escena.node_key for h in arbol.hijos}
    documento['escenas'] = []
    for hijo in arbol.hijos:
        escena = _campos(hijo.escena, ('node_key', 'title', 'narrative', 'decision_prompt', 'start_node', 'terminal_node', 'display_order', 'support_resources_json', 'required_tools_json', 'sensitive_content', 'safe_exit_required', 'warning_message', 'position_x', 'position_y', 'intensity'))
        if hijo.escena.goal:
            escena['goal'] = hijo.escena.goal
        if hijo.escena.comments_json != '[]':
            escena['comments_json'] = hijo.escena.comments_json
        escena['opciones'] = []
        for hoja in hijo.hijos:
            opcion = _campos(hoja.opcion, ('option_key', 'text', 'response_class', 'immediate_feedback', 'feedback_text', 'theory_basis', 'prohibition_reason', 'consequence_text', 'effects'))
            for campo in ('requires_json', 'reaction_json'):
                if getattr(hoja.opcion, campo) != '{}':
                    opcion[campo] = getattr(hoja.opcion, campo)
            opcion['destino'] = claves.get(hoja.opcion.target_node_id)
            escena['opciones'].append(opcion)
        documento['escenas'].append(escena)
    if arbol.asignacion:
        rubrica = arbol.asignacion.rubric
        documento['rubrica'] = {'name': rubrica.name, 'description': rubrica.description, 'criteria': [
            {**_campos(c, ('competency', 'title', 'description', 'max_score', 'active', 'display_order')), 'weight': str(c.weight)}
            for c in sorted(rubrica.criteria.all(), key=lambda c: (c.display_order, c.pk))]}
    else:
        documento['rubrica'] = None
    mundo = _mundo_de(version)
    if any(mundo.values()):
        documento['mundo'] = mundo
    contenido = json.dumps(documento, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return 'sha256:' + hashlib.sha256(contenido.encode('utf-8')).hexdigest()
