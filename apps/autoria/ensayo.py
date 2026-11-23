"""Ensayo del borrador (SIEP-243): la docente autora (o administración) recorre su versión en el mundo del juego.

Un ensayo es un ``SimulationAttempt`` con ``is_rehearsal=True``: usa el mismo mundo, decisiones y puertas del juego, pero
no exige asignación, consentimiento ni publicación y no aparece en reportes, revisión, historial ni resultados porque el
gestor por defecto (``SimulationAttempt.objects``) lo excluye. Solo se ensayan versiones en borrador.

Las tres órdenes de autoría:

* ``abrir``: crea el ensayo (en la escena pedida o en la de inicio) o reanuda el abierto; devuelve el estado del juego más
  el bloque ``rehearsal``;
* ``ajustar``: mueve la escena y marca lo explorado, la persona y los hitos; valida TODO antes de escribir;
* ``leer``: el bloque, para «Recargar borrador».

El bloque es lo que lee el panel de la autora: por qué una respuesta no aparece, qué comentarios se dicen, qué lleva explorado
y qué puede marcar. Solo viaja por estas rutas; las del juego no lo llevan. «Sala actual» es la del mapa de la escena actual:
es la que leen los requisitos de las opciones.
"""
import hashlib
import secrets

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound

from apps.simulation.casedef import conditions
from apps.simulation.casedef.vocabulary import INITIAL_PERSONA, Activation, Bond
from apps.simulation.models import (
    AttemptEvent, AttemptWorldState, ClinicalTool, DecisionOption, DialogueTree, MapObject, SceneMap, SimulationAttempt,
    SimulationNode,
)
from apps.simulation.services import attempt_api, case_rules, disponibilidad_mundo, estado_intento, world
from apps.simulation.services import attempt_lifecycle as lifecycle
from apps.simulation.services.attempt_lock import lock_attempt_row
from shared import policies
from shared.exceptions import ApiError

from . import guardas

KINDS = ("talked", "inspected", "has", "used")
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
MOTIVO_REEMPLAZO = "Reemplazado por un ensayo nuevo"
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
MOTIVO_AJUSTE = "Escena elegida por la autora"


def _abiertos(usuario, version):
    return SimulationAttempt.all_objects.filter(
        student_id=usuario.pk, case_version_id=version.pk, is_rehearsal=True, status__in=lifecycle.OPEN_STATUSES
    ).select_related("current_node")


# ─── Errores ───────────────────────────────────────────────────────────────────────────────────────────────────────
def _desaparecido():
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
    return ApiError("REHEARSAL_GONE", "Este ensayo ya no existe. Abre uno nuevo.", 404)


def _cerrado():
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
    return ApiError("REHEARSAL_CLOSED", "Este ensayo ya se cerró. Abre uno nuevo.", 409)


def _invalido(campo, mensaje):
    return ApiError("VALIDATION_ERROR", mensaje, 400, field=campo)


# ─── Abrir ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def _escena_inicial(version, desde):
    if desde is None:
        escena = version.nodes.filter(start_node=True).order_by("pk").first()
        if escena is None:
            raise ApiError("NO_START_NODE", "El caso no tiene escena de inicio.", 409)
        return escena
    escena = version.nodes.filter(pk=desde).first()
    if escena is None:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
        raise _invalido("desde", "La escena de la que se quiere empezar no es de este caso.")
    return escena


def _crear(usuario, version, escena):
    intento = SimulationAttempt.all_objects.create(
        is_rehearsal=True, student=usuario, case_version=version, current_node=escena,
        attempt_token_hash=hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
        last_activity_at=timezone.now(),
    )
    AttemptEvent.objects.create(attempt=intento, node=escena, event_type="ATTEMPT_STARTED")
    return intento


def _respuesta(intento):
    """El estado del juego del ensayo más el bloque del panel."""
    return {**estado_intento.construir(intento), "rehearsal": bloque(intento)}


def abrir(usuario, case_version_id, desde=None):
    """Abre el ensayo de ``usuario`` en ``desde`` (o en la escena de inicio). Devuelve ``(respuesta, creado)``.

    Sin ``desde`` reanuda el ensayo abierto si lo hay; con ``desde`` cierra el anterior y abre uno nuevo en esa escena.
    """
    with transaction.atomic():
        version = guardas.version_editable(usuario, case_version_id)
        escena = _escena_inicial(version, desde) if desde is not None else None
        # ``of=("self",)``: con ``select_related`` PostgreSQL bloquearía también la fila de la escena.
        abiertos = list(_abiertos(usuario, version).select_for_update(of=("self",)))
        if abiertos and desde is None:
            return _respuesta(abiertos[0]), False
        for viejo in abiertos:
            attempt_api.reemplazar_abierto(viejo, usuario, MOTIVO_REEMPLAZO)
        if escena is None:
            escena = _escena_inicial(version, None)
        try:
            # Su propio punto de guardado: un choque con el índice único no rompe la transacción de afuera.
            with transaction.atomic():
                return _respuesta(_crear(usuario, version, escena)), True
        except IntegrityError:
            # Otra pestaña lo abrió entre la lectura y la creación (``uq_rehearsal_open_per_author_case``): gana esa.
            ganador = _abiertos(usuario, version).first()
            if ganador is None:
                raise
            return _respuesta(ganador), False


def _buscar(usuario, version, attempt_id, *, bloquear=False):
    """El ensayo ABIERTO que ``usuario`` puede usar: 404 ``REHEARSAL_GONE`` si no existe, no es de esa versión o no es
    suyo; 409 si ya se cerró."""
    if bloquear:
        lock_attempt_row(attempt_id)
    intento = (
        SimulationAttempt.all_objects.select_related("case_version__simulation_case", "current_node")
        .filter(pk=attempt_id, is_rehearsal=True, case_version_id=version.pk).first()
    )
    if intento is None or not policies.can(usuario, "attempt", "rehearse", owner_id=intento.student_id):
        raise _desaparecido()
    if not lifecycle.state_of(intento).is_open:
        raise _cerrado()
    return intento


def leer(usuario, case_version_id, attempt_id):
    with transaction.atomic():
        version = guardas.version_editable(usuario, case_version_id)
        return {"rehearsal": bloque(_buscar(usuario, version, attempt_id))}


# ─── Lo explorable ─────────────────────────────────────────────────────────────────────────────────────────────────
def _personajes_de_ambiente(mapa):
    ambiente = disponibilidad_mundo.leer_json(mapa.ambient_json, {})
    personajes = ambiente.get("ambientNpcs") if isinstance(ambiente, dict) else None
    return [p for p in personajes if isinstance(p, dict) and isinstance(p.get("key"), str) and p["key"]] if isinstance(personajes, list) else []


def _claves_de_ambiente(mapa):
    return [p["key"] for p in _personajes_de_ambiente(mapa)]


def _explorable(version_id, mapa):
    """``[(tipo, clave)]`` de lo que se puede marcar en la escena: la única fuente de lo que el bloque lista y el PATCH
    admite.

    ``talked``: las PERSON visibles y los personajes de ambiente del mapa; ``inspected``: sus objetos visibles; ``has`` y
    ``used``: las herramientas del caso."""
    pares = []
    if mapa is not None:
        objetos = list(MapObject.objects.filter(scene_map_id=mapa.pk, visible=True).order_by("id"))
        pares += [("talked", o.object_key) for o in objetos if o.object_type == "PERSON"]
        pares += [("talked", clave) for clave in _claves_de_ambiente(mapa)]
        pares += [("inspected", o.object_key) for o in objetos]
    herramientas = list(ClinicalTool.objects.filter(case_version_id=version_id).order_by("id").values_list("tool_code", flat=True))
    pares += [("has", codigo) for codigo in herramientas]
    pares += [("used", codigo) for codigo in herramientas]
    return list(dict.fromkeys(pares))


def _etiquetas(version_id, mapa, pares):
    """``{(tipo, clave): etiqueta}``: un objeto o persona toma la del objeto del mapa, un personaje de ambiente su
    nombre y una herramienta su etiqueta; sin hallarla, la clave."""
    objetos, ambiente, herramientas = {}, {}, {}
    if mapa is not None:
        objetos = dict(MapObject.objects.filter(scene_map_id=mapa.pk).values_list("object_key", "label"))
        for personaje in _personajes_de_ambiente(mapa):
            nombre = next((personaje[c] for c in ("name", "label", "displayName") if isinstance(personaje.get(c), str) and personaje[c]), None)
            ambiente[personaje["key"]] = nombre or personaje["key"]
    if any(tipo in ("has", "used") for tipo, _ in pares):
        herramientas = dict(ClinicalTool.objects.filter(case_version_id=version_id).values_list("tool_code", "label"))
    etiquetas = {}
    for tipo, clave in pares:
        if tipo == "inspected":
            etiqueta = objetos.get(clave)
        elif tipo == "talked":
            etiqueta = objetos.get(clave) or ambiente.get(clave)
        else:
            etiqueta = herramientas.get(clave)
        etiquetas[(tipo, clave)] = etiqueta or clave
    return etiquetas


def _faltante(tipo, clave, etiquetas):
    return {"kind": tipo, "key": clave, "label": etiquetas.get((tipo, clave), clave)}


# ─── El bloque ─────────────────────────────────────────────────────────────────────────────────────────────────────
def _avisos(nodo, opciones, *, con_mapa):
    """Lo que el estudiante vería roto en esta escena (los mismos avisos de la pantalla «Probar» del editor)."""
    avisos = []
    if not con_mapa:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
        avisos.append("Esta escena todavía no tiene sala: el estudiante la vería sin escenario.")
    if not opciones and not nodo.terminal_node:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
        avisos.append("Esta escena no tiene respuestas ni es un final: el estudiante se quedaría aquí.")
    for opcion in opciones:
        if opcion.target_node_id is None:  # Defensivo: ``target_node`` es NOT NULL; solo un objeto a medio armar llega aquí.
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            avisos.append(f"«{opcion.text}»: Esta respuesta aún no lleva a ninguna escena. En el caso real, el estudiante se quedaría aquí.")
    return avisos


def _faltan(condicion, contexto):
    return [tuple(hecho) for hecho in conditions.unmet_facts(condicion, contexto)]


_EVENTOS_DE_CAMINO = ("ATTEMPT_STARTED", "NODE_ENTERED", "DECISION_SELECTED", "DECISION_CHANGED", "PROHIBITED_DECISION_SELECTED")


def _camino(intento):
    """Las escenas por las que pasó el ensayo, en orden y sin repetir seguidas, terminando en la actual."""
    eventos = AttemptEvent.objects.filter(
        attempt_id=intento.pk, event_type__in=_EVENTOS_DE_CAMINO, node__isnull=False
    ).select_related("node").order_by("id")
    camino = []
    for evento in eventos:
        if not camino or camino[-1].pk != evento.node_id:
            camino.append(evento.node)
    if not camino or camino[-1].pk != intento.current_node_id:
        camino.append(intento.current_node)
    return [{"nodeId": nodo.pk, "title": nodo.title} for nodo in camino]


def bloque(intento):
    """El bloque ``rehearsal`` del panel de la autora para la escena actual del ensayo (ver el módulo)."""
    nodo = intento.current_node
    estado = AttemptWorldState.objects.filter(attempt_id=intento.pk).select_related("scene_map").first()
    mapa = SceneMap.objects.filter(node_id=nodo.pk).first()
    opciones = list(DecisionOption.objects.filter(source_node_id=nodo.pk).order_by("id"))
    contexto = disponibilidad_mundo.contexto(intento, estado)
    ofrecidas = {o.pk for o in disponibilidad_mundo.opciones(intento, estado)}

    filas_opciones, buscadas = [], []
    for opcion in opciones:
        fila = {"id": opcion.pk, "text": opcion.text, "offered": opcion.pk in ofrecidas, "missing": [], "retainedBy": None}
        faltan = []
        if not fila["offered"]:
            requisito = disponibilidad_mundo.leer_json(opcion.requires_json, None)
            if not conditions.is_valid(requisito, facts=True):
                fila["retainedBy"] = "broken"
            else:
                faltan = _faltan(requisito, contexto)
                fila["retainedBy"] = "facts" if faltan else "condition"
                buscadas += faltan
        filas_opciones.append((fila, faltan))

    filas_comentarios = []
    for evaluado in disponibilidad_mundo.evaluar_comentarios(intento, estado):
        comentario = evaluado["comentario"]
        faltan = _faltan(comentario["cuando"], contexto) if evaluado["motivo"] == "condition" else []
        buscadas += faltan
        filas_comentarios.append(({
            "index": evaluado["posicion"], "personaje": comentario["personaje"], "line": comentario["linea"],
            "due": evaluado["dto"] is not None, "retainedBy": evaluado["motivo"], "missing": [],
        }, faltan))

    explorable = _explorable(intento.case_version_id, mapa)
    etiquetas = _etiquetas(intento.case_version_id, mapa, list(dict.fromkeys(buscadas + explorable)))
    for fila, faltan in (*filas_opciones, *filas_comentarios):
        fila["missing"] = [_faltante(tipo, clave, etiquetas) for tipo, clave in faltan]
    return {
        "sceneId": nodo.pk,
        "options": [fila for fila, _ in filas_opciones],
        "comments": [fila for fila, _ in filas_comentarios],
        "warnings": _avisos(nodo, opciones, con_mapa=mapa is not None),
        "persona": estado_intento.persona_de(intento),
        "milestones": list(intento.state_json.get("milestones", [])),
        "path": _camino(intento),
        "explored": {tipo: sorted(set(contexto["explored"][tipo])) for tipo in KINDS},
        "explorable": [_faltante(tipo, clave, etiquetas) for tipo, clave in explorable],
        "scenes": [
            {"id": n.pk, "key": n.node_key, "title": n.title, "start": n.start_node, "terminal": n.terminal_node}
            for n in SimulationNode.objects.filter(case_version_id=intento.case_version_id).order_by("id")
        ],
    }


# ─── Ajustar ───────────────────────────────────────────────────────────────────────────────────────────────────────
def _lista_de_claves(valor, campo, que):
    if not isinstance(valor, list) or not all(isinstance(item, str) for item in valor):
        raise _invalido(campo, f"{que} debe ser una lista de claves.")
    return list(dict.fromkeys(valor))


def _plan(intento, version, pedido):
    """Valida TODO el pedido y devuelve lo que hay que escribir; no escribe nada."""
    plan = {}
    nodo = intento.current_node
    if pedido.get("irA") is not None:
        nodo = version.nodes.filter(pk=pedido["irA"]).first()
        if nodo is None:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            raise _invalido("irA", "La escena a la que se quiere ir no es de este caso.")
        if nodo.pk != intento.current_node_id:  # ir a la escena actual no es un movimiento: ni evento ni paso nuevo
            plan["nodo"] = nodo
    mapa = SceneMap.objects.filter(node_id=nodo.pk).first()
    plan["mapa"] = mapa

    explorado = pedido.get("explorado")
    if explorado is not None:
        if not isinstance(explorado, dict):
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            raise _invalido("explorado", "Lo explorado debe ser un objeto con talked, inspected, has y used.")
        sobrantes = sorted(set(explorado) - set(KINDS))
        if sobrantes:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            raise _invalido("explorado", f"Lo explorado no admite «{sobrantes[0]}»: solo talked, inspected, has y used.")
        permitido = set(_explorable(version.pk, mapa))
        querido = {}
        for tipo in KINDS:
            claves = _lista_de_claves(explorado.get(tipo, []), "explorado", f"«{tipo}»")
            for clave in claves:
                if (tipo, clave) not in permitido:
                    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
                    raise _invalido("explorado", f"«{clave}» no se puede marcar como {tipo} en esta escena.")
            querido[tipo] = claves
        if mapa is None and not AttemptWorldState.objects.filter(attempt_id=intento.pk).exists():
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            raise _invalido("explorado", "Esta escena todavía no tiene sala: no hay dónde guardarlo.")
        plan["explorado"] = querido

    persona = pedido.get("persona")
    if persona is not None:
        if not isinstance(persona, dict) or not persona or set(persona) - {"bond", "activation"}:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            raise _invalido("persona", "La persona admite solo bond y activation.")
        elegido = {}
        for campo, enum in (("bond", Bond), ("activation", Activation)):
            if campo in persona:
                try:
                    elegido[campo] = enum(persona[campo])
                except ValueError:
                    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
                    raise _invalido("persona", f"«{persona[campo]}» no es un valor de {campo}.") from None
        plan["persona"] = elegido

    hitos = pedido.get("hitos")
    if hitos is not None:
        claves = _lista_de_claves(hitos, "hitos", "Los hitos")
        declarados = {hito.key for hito in case_rules.rules_of(version).milestones}
        for clave in claves:
            if clave not in declarados:
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
                raise _invalido("hitos", f"El hito «{clave}» no lo declara el caso.")
        plan["hitos"] = claves
    return plan


def _claves_propias(mapa):
    """Las claves de este mapa en las listas globales: sus objetos, sus personajes de ambiente y sus diálogos."""
    claves = set(MapObject.objects.filter(scene_map_id=mapa.pk).values_list("object_key", flat=True))
    claves |= set(_claves_de_ambiente(mapa))
    claves |= set(DialogueTree.objects.filter(scene_map_id=mapa.pk).values_list("tree_key", flat=True))
    return claves


def _aplicar_explorado(estado, mapa, querido):
    """Lo marcado es exactamente lo que cuenta para la sala; lo de otras salas se conserva."""
    flags = dict(estado.flags)
    por_sala = flags.get("exploredBySala")
    por_sala = dict(por_sala) if isinstance(por_sala, dict) else {}
    if mapa is not None:
        por_sala[disponibilidad_mundo.sala_clave(mapa)] = {"talked": querido["talked"], "inspected": querido["inspected"]}
        propias = _claves_propias(mapa)
        arboles = dict(
            DialogueTree.objects.filter(scene_map_id=mapa.pk, map_object__isnull=False).values_list("map_object__object_key", "tree_key")
        )
        vistos = flags.get("viewedNpcKeys")
        vistos = [k for k in (vistos if isinstance(vistos, list) else []) if isinstance(k, str) and k not in propias]
        for clave in querido["talked"]:
            vistos += [clave] + ([arboles[clave]] if clave in arboles else [])
        flags["viewedNpcKeys"] = list(dict.fromkeys(vistos))
        inspeccionados = [k for k in estado.inspected_object_keys if k not in propias]
        estado.inspected_object_keys = list(dict.fromkeys(inspeccionados + querido["inspected"]))
    flags["exploredBySala"] = por_sala
    flags.pop("exploredBeforeSala", None)
    estado.flags = flags
    estado.inventory = querido["has"]
    estado.used_tool_keys = querido["used"]


def _grados(enum, elegido, inicial):
    """Cuántos pasos hay del valor inicial al elegido: así se guarda la persona en el estado narrativo del intento."""
    orden = list(enum)
    return orden.index(elegido) - orden.index(inicial)


def ajustar(usuario, case_version_id, attempt_id, datos):
    """Mueve la escena y marca lo explorado, la persona y los hitos del ensayo; todo o nada."""
    with transaction.atomic():
        version = guardas.version_editable(usuario, case_version_id)
        intento = _buscar(usuario, version, attempt_id, bloquear=True)
        plan = _plan(intento, version, datos)
        if "nodo" in plan:
            intento.current_node = plan["nodo"]
            intento.save(update_fields=["current_node"])
            AttemptEvent.objects.create(attempt=intento, node=plan["nodo"], event_type="NODE_ENTERED", detail=MOTIVO_AJUSTE)
        if "persona" in plan or "hitos" in plan:
            narrativo = dict(intento.state_json)
            if "persona" in plan:
                cambios = dict(narrativo.get("persona", {}))
                vinculo_inicial, activacion_inicial = INITIAL_PERSONA
                if "bond" in plan["persona"]:
                    cambios["bond"] = _grados(Bond, plan["persona"]["bond"], vinculo_inicial)
                if "activation" in plan["persona"]:
                    cambios["activation"] = _grados(Activation, plan["persona"]["activation"], activacion_inicial)
                narrativo["persona"] = cambios
            if "hitos" in plan:
                narrativo["milestones"] = plan["hitos"]
            intento.state_json = narrativo
            intento.save(update_fields=["state_json"])
        if "nodo" in plan or "explorado" in plan:
            try:
                estado = world._estado(intento)  # lleva el mundo al mapa de la escena actual
            except NotFound:
                estado = None  # la escena no tiene sala y el intento no tiene mundo guardado
            if estado is not None and "explorado" in plan:
                _aplicar_explorado(estado, plan["mapa"], plan["explorado"])
                estado.save()
        return {"rehearsal": bloque(_buscar(usuario, version, attempt_id))}


def descartar_de_version(case_version_id) -> int:
    """Borra los ensayos de una versión (la docente borró una escena o una respuesta); sus hijos caen con ellos."""
    intentos = SimulationAttempt.all_objects.filter(case_version_id=case_version_id, is_rehearsal=True)
    borrados, _ = intentos.delete()
    return borrados
