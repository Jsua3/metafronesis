"""Traducción pura del DSL del caso a un plan de carga inmutable."""

from dataclasses import dataclass
from types import MappingProxyType

from apps.simulation.casedef import conditions


def _congelar(valor):
    if isinstance(valor, dict):
        return MappingProxyType({clave: _congelar(dato) for clave, dato in valor.items()})
    if isinstance(valor, list):
        return tuple(_congelar(dato) for dato in valor)
    return valor


def descongelar(valor):
    """Devuelve estructuras JSON ordinarias para el futuro escritor."""
    if isinstance(valor, (dict, type(MappingProxyType({})))):
        return {clave: descongelar(dato) for clave, dato in valor.items()}
    if isinstance(valor, tuple):
        return [descongelar(dato) for dato in valor]
    return valor


@dataclass(frozen=True)
class Elemento:
    """Datos de un modelo y claves de sus relaciones aún no persistidas."""

    clave: str
    datos: object
    nodo: str = ""
    sala: str = ""
    origen: str = ""
    destino: str = ""


@dataclass(frozen=True)
class PlanDeCarga:
    caso: object
    version: object
    nodos: tuple
    opciones: tuple
    comentarios: tuple
    salas: tuple
    objetos: tuple
    zonas: tuple
    pistas: tuple
    dialogos: tuple
    personajes: tuple
    herramientas: tuple
    rubricas: tuple
    no_soportado: tuple


def _elemento(clave, datos, **relaciones):
    return Elemento(clave, _congelar(datos), **relaciones)


def _campos(objeto, permitidos, ruta, avisos):
    for clave in sorted(set(objeto) - set(permitidos.split())):
        avisos.append(f"{ruta}.{clave}: campo desconocido, no se puede traducir.")


def _por_id(elementos):
    return {elemento['id']: elemento for elemento in elementos if 'id' in elemento}


def traducir(documento):
    """Construye un plan sin consultar ni modificar la base de datos."""
    avisos = []
    _campos(documento, 'caso escenas herramientas personajes retroalimentacion rubricas versionDsl x-siep', '$', avisos)
    caso = documento['caso']
    siep = documento['x-siep']
    _campos(caso, 'descripcion escenaInicial estado id objetivosAprendizaje rubrica titulo version', 'caso', avisos)
    _campos(siep, 'contexto escenas herramientas mundoVersion personajes reglas rubricas version', 'x-siep', avisos)
    if documento.get('versionDsl') != '1.0':
        avisos.append('versionDsl: versión del DSL no reconocida.')
    if siep.get('version') != '2.2':
        avisos.append('x-siep.version: solo se admite la versión 2.2.')
    if caso.get('estado') != 'BORRADOR':
        avisos.append('caso.estado: solo se puede preparar un caso en borrador.')
    _campos(siep['reglas'], 'endings milestones riskLevel secondChance', 'x-siep.reglas', avisos)
    bases = _por_id(documento['escenas'])
    claves_escenas = {escena['id']: escena['clave'] for escena in siep['escenas'] if 'id' in escena}
    if caso.get('escenaInicial') not in claves_escenas:
        avisos.append('caso.escenaInicial: no corresponde a una escena de x-siep.')
    elif not any(escena.get('id') == caso['escenaInicial'] and escena.get('inicial') for escena in siep['escenas']):
        avisos.append('caso.escenaInicial: no coincide con la escena inicial de x-siep.')
    retroalimentacion = {item['opcion']: item for item in documento['retroalimentacion'] if 'opcion' in item}
    for numero, item in enumerate(documento['retroalimentacion']):
        _campos(item, 'opcion mensaje fundamentoTeorico', f'retroalimentacion[{numero}]', avisos)
        if item.get('opcion') not in {opcion['id'] for base in documento['escenas'] for opcion in (base.get('decision') or {}).get('opciones', [])}:
            avisos.append(f'retroalimentacion[{numero}].opcion: opción base inexistente.')
    nodos, opciones, comentarios, salas, objetos, zonas, pistas, dialogos = [], [], [], [], [], [], [], []
    for indice, escena in enumerate(siep['escenas']):
        ruta = f'x-siep.escenas[{indice}]'
        _campos(escena, 'id clave titulo descripcion sensible advertencia inicial terminal apoyo herramientasRequeridas salidaSeguraObligatoria intensidad posicion pregunta preguntaDerivada pistas opciones mapa objetivo comentarios', ruta, avisos)
        clave = escena['clave']
        if escena.get('objetivo'):
            avisos.append(f'{ruta}.objetivo: el modelo de nodo no tiene un campo para el objetivo de escena.')
        base = bases.get(escena.get('id'))
        if 'id' in escena and base is None:
            avisos.append(f'{ruta}.id: escena base inexistente.')
        if base:
            _campos(base, 'id titulo descripcion contenidoSensible advertencia decision orden', f'escenas[{documento["escenas"].index(base)}]', avisos)
        decision = (base or {}).get('decision') or {}
        _campos(decision, 'id opciones pregunta pistas', f'{ruta}.decision', avisos)
        posicion = escena.get('posicion', {})
        _campos(posicion, 'x y', f'{ruta}.posicion', avisos)
        pregunta = decision.get('pregunta', escena.get('pregunta', ''))
        if escena.get('preguntaDerivada') and pregunta == '¿Qué decisión tomas en esta escena?':
            pregunta = ''
        nodos.append(_elemento(clave, {
            'node_key': clave, 'title': (base or {}).get('titulo', escena.get('titulo', '')),
            'narrative': (base or {}).get('descripcion', escena.get('descripcion', '')),
            'sensitive_content': (base or {}).get('contenidoSensible', escena.get('sensible', False)),
            'warning_message': (base or {}).get('advertencia', escena.get('advertencia', '')),
            'start_node': escena['inicial'], 'terminal_node': escena['terminal'],
            'support_resources_json': escena['apoyo'], 'required_tools_json': escena['herramientasRequeridas'],
            'safe_exit_required': escena['salidaSeguraObligatoria'], 'intensity': escena['intensidad'],
            'position_x': posicion.get('x', 0), 'position_y': posicion.get('y', 0),
            'display_order': indice, 'decision_prompt': pregunta,
        }))
        for numero, comentario in enumerate(escena.get('comentarios', [])):
            _campos(comentario, 'personaje linea cuando emocion gesto', f'{ruta}.comentarios[{numero}]', avisos)
            comentarios.append(_elemento(str(numero), comentario, nodo=clave))
        extras = _por_id(escena.get('opciones', []))
        entradas = decision.get('opciones', []) if base else escena.get('opciones', [])
        if base:
            for numero, extra in enumerate(escena.get('opciones', [])):
                if extra.get('id') not in _por_id(entradas):
                    avisos.append(f'{ruta}.opciones[{numero}].id: opción base inexistente.')
        for numero, entrada in enumerate(entradas):
            ubicacion = f'{ruta}.opciones[{numero}]'
            extra = extras.get(entrada.get('id'), {}) if base else entrada
            if base and entrada.get('id') not in extras:
                avisos.append(f'{ubicacion}: falta la extensión de la opción en x-siep.')
            if base:
                _campos(entrada, 'id texto clasificacion conductaProhibida motivoProhibicion siguienteEscena consecuencia', f'escenas[{documento["escenas"].index(base)}].decision.opciones[{numero}]', avisos)
            _campos(extra, 'id clave texto destino motivo consecuencia retroalimentacionInmediata mensaje fundamento clase clasificacion prohibida efectos requiere reaccion', ubicacion, avisos)
            if extra.get('clase') not in ('RECOMMENDED', 'ACCEPTABLE', 'RISKY', 'CONTRAINDICATED'):
                avisos.append(f'{ubicacion}.clase: clase de respuesta desconocida.')
            requisito = extra.get('requiere', {})
            if requisito != {} and not conditions.is_valid(requisito, facts=True):
                avisos.append(f'{ubicacion}.requiere: condición no reconocida.')
            _campos(extra.get('efectos', {}), 'persona milestones competencies', f'{ubicacion}.efectos', avisos)
            _campos(extra.get('reaccion', {}), 'personaje linea emocion gesto', f'{ubicacion}.reaccion', avisos)
            retro = retroalimentacion.get(entrada.get('id'), {})
            destino_base = entrada.get('siguienteEscena', extra.get('destino', ''))
            destino = claves_escenas.get(destino_base, destino_base)
            if destino not in {item['clave'] for item in siep['escenas']}:
                avisos.append(f'{ubicacion}: destino {destino!r} inexistente.')
            clave_opcion = extra.get('clave', entrada.get('id', ''))
            opciones.append(_elemento(clave_opcion, {
                'option_key': clave_opcion, 'text': entrada.get('texto', ''),
                'immediate_feedback': extra.get('retroalimentacionInmediata', ''),
                'prohibition_reason': entrada.get('motivoProhibicion', extra.get('motivo', '')),
                'consequence_text': entrada.get('consecuencia', extra.get('consecuencia', '')),
                'feedback_text': retro.get('mensaje', extra.get('mensaje', '')),
                'theory_basis': retro.get('fundamentoTeorico', extra.get('fundamento', '')),
                'response_class': extra.get('clase', ''), 'effects': extra.get('efectos', {}),
                'requires_json': extra.get('requiere', {}), 'reaction_json': extra.get('reaccion', {}),
            }, origen=clave, destino=destino))
        mapa = escena.get('mapa')
        if not mapa:
            avisos.append(f'{ruta}.mapa: la escena no tiene sala.')
            continue
        _campos(mapa, 'clave titulo ancho alto tema aparicion ambiente estructura colisiones objetos dialogos', f'{ruta}.mapa', avisos)
        clave_sala = mapa['clave']
        _campos(mapa['aparicion'], 'x y', f'{ruta}.mapa.aparicion', avisos)
        salas.append(_elemento(clave_sala, {'map_key': clave_sala, 'title': mapa['titulo'], 'width': mapa['ancho'], 'height': mapa['alto'], 'theme': mapa['tema'], 'spawn_x': mapa['aparicion']['x'], 'spawn_y': mapa['aparicion']['y'], 'ambient_json': mapa['ambiente'], 'structure': mapa.get('estructura')}, nodo=clave))
        for numero, objeto in enumerate(mapa['objetos']):
            _campos(objeto, 'clave etiqueta tipo x y ancho alto z orientacion color icono codigoCorto colision visible indicacion texto opcion personaje herramienta desbloqueo movimiento metadatos', f'{ruta}.mapa.objetos[{numero}]', avisos)
            objetos.append(_elemento(objeto['clave'], {'object_key': objeto['clave'], 'label': objeto['etiqueta'], 'object_type': objeto['tipo'], 'position_x': objeto['x'], 'position_y': objeto['y'], 'width': objeto['ancho'], 'height': objeto['alto'], 'z_index': objeto['z'], 'facing': objeto['orientacion'], 'color_hex': objeto['color'], 'icon': objeto['icono'], 'short_code': objeto['codigoCorto'], 'collision': objeto['colision'], 'visible': objeto['visible'], 'interaction_prompt': objeto['indicacion'], 'interaction_text': objeto['texto'], 'decision_option': objeto['opcion'], 'character': objeto['personaje'], 'tool_code': objeto['herramienta'], 'unlock_condition_json': objeto['desbloqueo'], 'movement_pattern_json': objeto['movimiento'], 'metadata_json': objeto['metadatos']}, sala=clave_sala))
        for numero, zona in enumerate(mapa['colisiones']):
            _campos(zona, 'clave etiqueta x y ancho alto', f'{ruta}.mapa.colisiones[{numero}]', avisos)
            zonas.append(_elemento(zona['clave'], {'zone_key': zona['clave'], 'label': zona['etiqueta'], 'position_x': zona['x'], 'position_y': zona['y'], 'width': zona['ancho'], 'height': zona['alto']}, sala=clave_sala))
        for numero, pista in enumerate(decision.get('pistas', []) or escena.get('pistas', [])):
            pistas.append(_elemento(str(numero), {'hint_order': numero, 'text': pista}, sala=clave_sala))
        for numero, dialogo in enumerate(mapa['dialogos']):
            ubicacion = f'{ruta}.mapa.dialogos[{numero}]'
            _campos(dialogo, 'clave hablante retrato emocion objeto lineas elecciones', ubicacion, avisos)
            for indice_linea, linea in enumerate(dialogo['lineas']):
                _campos(linea, 'orden hablante texto emocion', f'{ubicacion}.lineas[{indice_linea}]', avisos)
            for indice_eleccion, eleccion in enumerate(dialogo['elecciones']):
                _campos(eleccion, 'clave texto opcion herramientaRequerida efecto orden', f'{ubicacion}.elecciones[{indice_eleccion}]', avisos)
            dialogos.append(_elemento(dialogo['clave'], {'tree_key': dialogo['clave'], 'speaker_name': dialogo['hablante'], 'portrait_key': dialogo['retrato'], 'emotion': dialogo['emocion'], 'map_object': dialogo['objeto'], 'lines': [{'display_order': linea['orden'], 'speaker_name': linea['hablante'], 'text': linea['texto'], 'emotion': linea['emocion']} for linea in dialogo['lineas']], 'choices': [{'choice_key': eleccion['clave'], 'text': eleccion['texto'], 'decision_option': eleccion['opcion'], 'required_tool_code': eleccion['herramientaRequerida'], 'effect_json': eleccion['efecto'], 'display_order': eleccion['orden']} for eleccion in dialogo['elecciones']]}, sala=clave_sala))
    personajes = []
    for numero, escena_base in enumerate(documento['escenas']):
        if escena_base.get('id') not in claves_escenas:
            avisos.append(f'escenas[{numero}]: escena sin correspondencia en x-siep.')
    personajes_base = _por_id(documento['personajes'])
    for numero, personaje in enumerate(documento['personajes']):
        _campos(personaje, 'id nombre rol', f'personajes[{numero}]', avisos)
        if personaje.get('id') not in {item.get('id') for item in siep['personajes']}:
            avisos.append(f'personajes[{numero}]: personaje sin correspondencia en x-siep.')
    for numero, personaje in enumerate(siep['personajes']):
        _campos(personaje, 'id clave nombre rol retrato enFicha orden', f'x-siep.personajes[{numero}]', avisos)
        fuente = personajes_base.get(personaje.get('id'), personaje)
        personajes.append(_elemento(personaje['clave'], {'character_key': personaje['clave'], 'display_name': fuente.get('nombre', ''), 'role_label': fuente.get('rol', ''), 'portrait_key': personaje['retrato'], 'show_in_brief': personaje['enFicha'], 'display_order': personaje['orden']}))
    herramientas = []
    herramientas_base = _por_id(documento['herramientas'])
    for numero, herramienta in enumerate(documento['herramientas']):
        _campos(herramienta, 'id nombre descripcion categoria', f'herramientas[{numero}]', avisos)
        if herramienta.get('id') not in {item.get('id') for item in siep['herramientas']}:
            avisos.append(f'herramientas[{numero}]: herramienta sin correspondencia en x-siep.')
    for numero, herramienta in enumerate(siep['herramientas']):
        _campos(herramienta, 'id codigo etiqueta descripcion categoria icono activa', f'x-siep.herramientas[{numero}]', avisos)
        fuente = herramientas_base.get(herramienta.get('id'), herramienta)
        herramientas.append(_elemento(herramienta['codigo'], {'tool_code': herramienta['codigo'], 'label': fuente.get('nombre', fuente.get('etiqueta', '')), 'description': fuente.get('descripcion', ''), 'category': fuente.get('categoria', ''), 'icon': herramienta['icono'], 'active': herramienta['activa']}))
    rubricas = tuple(_elemento(rubrica['id'], {'base': rubrica, 'extension': _por_id(siep['rubricas']).get(rubrica['id'], {})}) for rubrica in documento['rubricas'])
    for numero, rubrica in enumerate(siep['rubricas']):
        if rubrica.get('id') not in _por_id(documento['rubricas']):
            avisos.append(f'x-siep.rubricas[{numero}]: rúbrica base inexistente.')
    return PlanDeCarga(_congelar({'code': caso['id'], 'title': caso['titulo'], 'description': caso.get('descripcion', '')}), _congelar({'semantic_version': caso['version'], 'narrative_context': siep['contexto'], 'learning_objectives': caso.get('objetivosAprendizaje', []), 'world_schema_version': siep['mundoVersion'], 'rules': siep['reglas']}), tuple(nodos), tuple(opciones), tuple(comentarios), tuple(salas), tuple(objetos), tuple(zonas), tuple(pistas), tuple(dialogos), tuple(personajes), tuple(herramientas), rubricas, tuple(avisos))
