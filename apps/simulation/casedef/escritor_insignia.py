"""Persistencia transaccional del plan del caso insignia."""

import json
import uuid
from decimal import Decimal
from collections.abc import Mapping

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction

from apps.publicacion import ciclo
from apps.publicacion.arbol import arbol_de
from apps.publicacion.huella import huella_de
from apps.simulation.models import (
    CaseCharacter, CaseVersion, CaseVersionStatus, ClinicalTool, CollisionZone, DecisionOption,
    DialogueChoice, DialogueLine, DialogueTree, MapObject, Rubric, RubricCriterion,
    SceneHint, SceneMap, SimulationCase, SimulationNode, SimulationRubricAssignment,
)
from apps.simulation.models.world import validar_codigo_herramienta
from shared.exceptions import ApiError
from shared.policies import can


def descongelar(valor):
    if isinstance(valor, Mapping):
        return {clave: descongelar(dato) for clave, dato in valor.items()}
    if isinstance(valor, tuple):
        return [descongelar(dato) for dato in valor]
    return valor


class ErrorDeCarga(ValueError):
    """El plan no puede cargarse sin perder información o sobrescribir datos."""


def _json(valor):
    return json.dumps(descongelar(valor), ensure_ascii=False, sort_keys=True)


def _crear(modelo, **datos):
    instancia = modelo(**datos)
    instancia.full_clean()
    instancia.save()
    return instancia


def _datos(elemento, campos_json=()):
    datos = descongelar(elemento.datos)
    for campo in campos_json:
        datos[campo] = _json(datos[campo])
    return datos


def _guardar(plan, caso, autor, semantica):
    datos_version = descongelar(plan.version)
    datos_version['semantic_version'] = semantica
    for campo in ('learning_objectives', 'rules'):
        datos_version[campo] = _json(datos_version[campo])
    version = _crear(CaseVersion, simulation_case=caso, created_by=autor, **datos_version)
    comentarios = {}
    for elemento in plan.comentarios:
        comentarios.setdefault(elemento.nodo, []).append(descongelar(elemento.datos))
    nodos = {}
    for elemento in plan.nodos:
        datos = _datos(elemento, ('support_resources_json', 'required_tools_json'))
        datos['comments_json'] = _json(comentarios.get(elemento.clave, []))
        nodos[elemento.clave] = _crear(SimulationNode, case_version=version, **datos)
    opciones = {}
    for elemento in plan.opciones:
        datos = _datos(elemento, ('effects', 'requires_json', 'reaction_json'))
        opciones[elemento.clave] = _crear(DecisionOption, case_version=version,
            source_node=nodos[elemento.origen], target_node=nodos[elemento.destino], **datos)
    personajes = {elemento.clave: _crear(CaseCharacter, case_version=version, **_datos(elemento))
                  for elemento in plan.personajes}
    for elemento in plan.herramientas:
        _crear(ClinicalTool, case_version=version, **_datos(elemento))
    salas = {elemento.clave: _crear(SceneMap, case_version=version, node=nodos[elemento.nodo],
                                    **_datos(elemento, ('ambient_json',))) for elemento in plan.salas}
    objetos = {}
    for elemento in plan.objetos:
        datos = _datos(elemento, ('unlock_condition_json', 'movement_pattern_json', 'metadata_json'))
        datos['decision_option'] = opciones[datos['decision_option']] if datos['decision_option'] else None
        datos['character'] = personajes[datos['character']] if datos['character'] else None
        objetos[(elemento.sala, elemento.clave)] = _crear(MapObject, scene_map=salas[elemento.sala], **datos)
    for elemento in plan.zonas:
        _crear(CollisionZone, scene_map=salas[elemento.sala], **_datos(elemento))
    for elemento in plan.pistas:
        _crear(SceneHint, scene_map=salas[elemento.sala], **_datos(elemento))
    for elemento in plan.dialogos:
        datos = _datos(elemento)
        lineas = datos.pop('lines')
        elecciones = datos.pop('choices')
        clave_objeto = datos.pop('map_object')
        arbol = _crear(DialogueTree, scene_map=salas[elemento.sala],
                       map_object=objetos[(elemento.sala, clave_objeto)] if clave_objeto else None, **datos)
        for linea in lineas:
            _crear(DialogueLine, dialogue_tree=arbol, **linea)
        for eleccion in elecciones:
            clave_opcion = eleccion.pop('decision_option')
            eleccion['effect_json'] = _json(eleccion['effect_json'])
            _crear(DialogueChoice, dialogue_tree=arbol,
                   decision_option=opciones[clave_opcion] if clave_opcion else None, **eleccion)
    for elemento in plan.rubricas:
        datos = descongelar(elemento.datos)
        base, extension = datos['base'], datos['extension']
        rubrica = _crear(Rubric, case_version=version, created_by=autor, name=base['nombre'],
                         description=base.get('descripcion'), active=base['activa'], version=base['version'])
        extensiones = {criterio['id']: criterio for criterio in extension.get('criterios', [])}
        for criterio in base['criterios']:
            extra = extensiones[criterio['id']]
            _crear(RubricCriterion, rubric=rubrica, competency=criterio['competencia'],
                   title=criterio['titulo'], description=criterio.get('descripcion'),
                   display_order=criterio['orden'], max_score=extra['puntajeMaximo'],
                   weight=Decimal(extra['peso']), active=extra['activo'])
        _crear(SimulationRubricAssignment, case_version=version, rubric=rubrica, assigned_by=autor)
    return version


class _ComparacionTerminada(Exception):
    def __init__(self, huella):
        self.huella = huella


def _version_numerica(semantica):
    partes = semantica.split('.') if isinstance(semantica, str) else ()
    if len(partes) == 3 and all(parte.isascii() and parte.isdecimal() for parte in partes):
        return tuple(map(int, partes))
    return None


@transaction.atomic
def cargar(plan, autor, publicador=None):
    """Carga el plan o devuelve la versión idéntica; expone los motivos de publicación."""
    if plan.no_soportado:
        raise ErrorDeCarga('Contenido no soportado: ' + '; '.join(plan.no_soportado))
    datos_caso = descongelar(plan.caso)
    semantica = plan.version['semantic_version']
    caso = SimulationCase.objects.select_for_update().filter(code=datos_caso['code']).first()
    existente = caso.versions.filter(semantic_version=semantica).first() if caso else None
    if existente:
        if any(getattr(caso, campo) != valor for campo, valor in datos_caso.items()):
            raise ErrorDeCarga('El caso existente tiene una huella diferente.')
        try:
            with transaction.atomic():
                provisional = _guardar(plan, caso, autor, 'tmp-' + uuid.uuid4().hex[:20])
                raise _ComparacionTerminada(huella_de(provisional))
        except _ComparacionTerminada as resultado:
            if resultado.huella != huella_de(existente):
                raise ErrorDeCarga('La versión existente tiene una huella diferente.')
        version = existente
    else:
        numerica = _version_numerica(semantica)
        if numerica is None:
            raise ErrorDeCarga(f'La versión {semantica!r} debe tener el formato mayor.menor.parche.')
        for herramienta in plan.herramientas:
            try:
                validar_codigo_herramienta(herramienta.clave)
            except ValidationError as error:
                raise ErrorDeCarga(f'Herramienta {herramienta.clave!r}: {error.message}') from error
        if caso is None:
            caso = _crear(SimulationCase, created_by=autor, **datos_caso)
        else:
            mayor = max(
                ((numero, valor) for valor in caso.versions.values_list('semantic_version', flat=True)
                 if (numero := _version_numerica(valor)) is not None),
                key=lambda version: version[0],
                default=None,
            )
            if mayor and numerica < mayor[0]:
                raise ErrorDeCarga(f'La versión {semantica} es menor que la mayor versión existente ({mayor[1]}).')
            if mayor is None or numerica > mayor[0]:
                distintos = {campo: valor for campo, valor in datos_caso.items() if getattr(caso, campo) != valor}
                if distintos:
                    for campo, valor in distintos.items():
                        setattr(caso, campo, valor)
                    caso.full_clean()
                    caso.save(update_fields=list(distintos))
        version = _guardar(plan, caso, autor, semantica)
    if version.status == CaseVersionStatus.PUBLISHED:
        version.motivos_publicacion = []
        return version
    motivos = arbol_de(version).problemas()
    if not publicador:
        motivos.append('No se encontró el administrador; el caso queda en borrador.')
    elif not can(publicador, 'case', 'publish', owner_id=caso.created_by_id):
        motivos.append('El publicador no tiene permiso para publicar.')
    if not motivos:
        try:
            if settings.REVIEW_WORKFLOW_STRICT and version.status == CaseVersionStatus.DRAFT:
                version = ciclo.enviar_a_revision(autor, version.pk)
            version = ciclo.publicar(publicador, version.pk)
        except (ApiError, PermissionError) as error:
            motivos = [str(error)]
    version.motivos_publicacion = motivos
    return version
