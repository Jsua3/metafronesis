import hashlib
import json

from .arbol import arbol_de


def _campos(objeto, nombres):
    return {nombre: getattr(objeto, nombre) for nombre in nombres}


def huella_de(version) -> str:
    arbol = arbol_de(version)
    documento = _campos(version, ('narrative_context', 'learning_objectives', 'estimated_minutes', 'rules', 'world_schema_version'))
    documento['caso'] = _campos(version.simulation_case, ('code', 'title', 'description'))
    claves = {h.escena.pk: h.escena.node_key for h in arbol.hijos}
    documento['escenas'] = []
    for hijo in arbol.hijos:
        escena = _campos(hijo.escena, ('node_key', 'title', 'narrative', 'decision_prompt', 'start_node', 'terminal_node', 'display_order', 'support_resources_json', 'required_tools_json', 'sensitive_content', 'safe_exit_required', 'warning_message', 'position_x', 'position_y', 'intensity'))
        escena['opciones'] = []
        for hoja in hijo.hijos:
            opcion = _campos(hoja.opcion, ('option_key', 'text', 'response_class', 'immediate_feedback', 'feedback_text', 'theory_basis', 'prohibition_reason', 'consequence_text', 'effects'))
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
    contenido = json.dumps(documento, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return 'sha256:' + hashlib.sha256(contenido.encode('utf-8')).hexdigest()
