/**
 * Del borrador que edita el docente a lo que pide la API de autoría. Funciones puras: arman el cuerpo de cada petición
 * a partir de lo que cambió y de lo que el servidor ya tenía, y no piden nada.
 *
 * Regla común: lo que el editor no muestra no se pierde. Cada función recibe, si lo hay, lo que el servidor devolvió
 * antes (`previo`) y parte de ahí; los campos que el servidor deja «como estaban» cuando faltan se omiten.
 */
import type { Expresion } from '../../../core/models/biblioteca.model';
import type { CaseCreateRequest } from '../../../core/api/authoring.api';
import type {
  ChecklistUpdateRequest, CharacterEditorState, DecisionEdgeState, DecisionEffects, DecisionOptionUpsertRequest, DialogueUpsertRequest,
  EndingRule, Milestone, NodeEditorState, NodeUpsertRequest, WorldCollisionZone, WorldDefinition,
  WorldDialogueTree, WorldObject, WorldRoomSaveRequest,
} from '../../../core/models/simulation.model';
import type { CasoBorrador, EfectosRespuesta, Escena, Hito, Linea, ListaVerificacion, Respuesta, SalaCaso } from './caso';
import { llegada } from './geometria';
import { comentarioDesdeApi, expresionDe, reaccionDesdeApi } from './desde-api';
import { finalesDePlantilla, plantillaEditada } from './finales';
import { mismoMovimiento, movimientoAMetadata, movimientoDeMetadata } from './movimiento';
import type { Escenario, Personaje } from './escenario';

const MAX_CLAVE_REGLA = 60;

/** Una clave de hito o de final: solo letras, números y «_», de hasta 60 caracteres. */
export function claveDeRegla(id: string): string {
  const limpia = id.replace(/[^A-Za-z0-9_]/g, '_').slice(0, MAX_CLAVE_REGLA);
  return limpia || 'regla';
}

/** Una clave que no está en `usadas`: la base o la base con `-2`, `-3`… (se anota en `usadas`). */
export function claveLibre(base: string, usadas: Set<string>, separador = '-'): string {
  let clave = base;
  for (let n = 2; usadas.has(clave); n++) clave = `${base}${separador}${n}`;
  usadas.add(clave);
  return clave;
}

// ─── Reglas del caso ─────────────────────────────────────────────────────────

export function hitosAApi(hitos: Hito[]): Milestone[] {
  return hitos.map((h) => ({ key: claveDeRegla(h.clave), label: h.nombre, description: h.descripcion, decisive: h.decisivo }));
}

/**
 * Los finales que se guardan en el caso, en el orden en que se evalúan. En modo propio, los del docente. En modo
 * automático no se manda ninguno (valen los cuatro del modelo) salvo que el docente haya reescrito el nombre o el texto
 * de alguno: entonces se mandan los cuatro de plantilla, con sus textos y la condición de los hitos decisivos de ahora.
 */
export function finalesAApi(caso: Pick<CasoBorrador, 'modoFinales' | 'finales' | 'hitos' | 'textosPlantilla'>): EndingRule[] {
  const finales = caso.modoFinales === 'propio' ? caso.finales : plantillaEditada(caso) ? finalesDePlantilla(caso) : [];
  const usadas = new Set<string>();
  return finales.map((f) => {
    const final: EndingRule = {
      key: claveLibre(claveDeRegla(f.id), usadas, '_'), title: f.nombre, message: f.texto, tone: f.tono,
    };
    if (f.condicion) final.when = f.condicion as EndingRule['when'];
    final.aiSuggested = f.marcaIa; // explícita: omitirla conserva la marca guardada, y aceptar un final tiene que bajarla
    return final;
  });
}

// ─── Lista de verificación ───────────────────────────────────────────────────

/** La lista completa como la pide el servidor: una casilla por ítem (lo que la lista no trae va sin marcar). */
export function cuerpoLista(lista: ListaVerificacion): ChecklistUpdateRequest {
  const marcado = (codigo: string) => lista.items.some((i) => i.codigo === codigo && i.cumplido);
  return {
    contentOriginal: marcado('contentOriginal'), ethicsReviewed: marcado('ethicsReviewed'), safetyProtocols: marcado('safetyProtocols'),
    noStigmatizing: marcado('noStigmatizing'), triggerWarnings: marcado('triggerWarnings'), accessibilityOk: marcado('accessibilityOk'),
    scopeEducational: marcado('scopeEducational'),
  };
}

// ─── Escenas ─────────────────────────────────────────────────────────────────

export interface OpcionesNodo {
  /** La clave de la escena; obligatoria al crear (al editar es la que ya tenía). */
  nodeKey?: string;
  esInicio: boolean;
  previo?: NodeEditorState;
}

/** Igualdad de datos JSON, sin importar el orden de las claves ni las claves `undefined`. */
function mismoJson(a: unknown, b: unknown): boolean {
  const ordenado = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(ordenado);
    if (typeof v === 'object' && v !== null) {
      const entradas = Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => (x < y ? -1 : 1));
      return Object.fromEntries(entradas.map(([k, x]) => [k, ordenado(x)]));
    }
    return v;
  };
  return JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));
}

/** La escena como nodo. Lo que el editor no muestra (narración, herramientas, apoyos) sale de `previo`. */
export function cuerpoNodo(escena: Escena, opciones: OpcionesNodo): NodeUpsertRequest {
  const { previo } = opciones;
  const cuerpo: NodeUpsertRequest = {
    nodeKey: previo?.key ?? opciones.nodeKey ?? claveLibre(`escena-${escena.id}`, new Set()),
    title: escena.titulo,
    narrative: escena.narracion,
    requiredTools: previo ? [...previo.requiredTools] : [],
    supportResources: escena.recursosApoyo ? [...escena.recursosApoyo] : previo ? [...previo.supportResources] : [],
    sensitiveContent: previo?.sensitiveContent ?? false,
    safeExitRequired: previo?.safeExitRequired ?? false,
    warningMessage: escena.advertencia,
    terminal: escena.esFinal,
    startNode: opciones.esInicio,
    positionX: Math.round(escena.posicion.x),
    positionY: Math.round(escena.posicion.y),
    intensity: escena.intensidad,
  };
  // Una escena que propuso o cambió la IA se marca (si el servidor aún no la tiene marcada); solo «Aceptar» (accept-ai) la baja.
  if (escena.marcaIa && !previo?.aiSuggested) cuerpo.aiSuggested = true;
  // Se compara contra el previo ya normalizado (lo que el borrador leyó), no contra el dato crudo del servidor.
  // Ausente = no tocar: el objetivo y los comentarios solo viajan si la docente los cambió (o si la escena es nueva).
  if (escena.objetivo !== undefined && (!previo || escena.objetivo !== (previo.goal ?? ''))) cuerpo.goal = escena.objetivo;
  if (escena.comentarios !== undefined && (!previo || !mismoJson(escena.comentarios, (previo.comments ?? []).map(comentarioDesdeApi)))) {
    cuerpo.comments = structuredClone(escena.comentarios);
  }
  return cuerpo;
}

// ─── Respuestas ──────────────────────────────────────────────────────────────

function efectosAApi(efectos: EfectosRespuesta): DecisionEffects {
  const cuerpo: DecisionEffects = {};
  if (efectos.persona) cuerpo.persona = { ...efectos.persona };
  if (efectos.hitos) cuerpo.milestones = [...efectos.hitos];
  if (efectos.competencias) {
    cuerpo.competencies = Array.isArray(efectos.competencias) ? [...efectos.competencias] : { ...efectos.competencias };
  }
  return cuerpo;
}

export interface OpcionesDecision {
  /** La clave de la opción; obligatoria al crear. */
  optionKey?: string;
  previo?: DecisionEdgeState;
}

/**
 * La respuesta como opción de la escena `sourceNodeId`. Devuelve `null` si no se puede guardar todavía: la respuesta
 * no lleva a ninguna escena, o lleva a una que aún no está en el servidor (el servidor exige el destino).
 */
export function cuerpoDecision(
  respuesta: Respuesta, sourceNodeId: number, opciones: OpcionesDecision,
): DecisionOptionUpsertRequest | null {
  const destino = respuesta.destinoId === null ? NaN : Number(respuesta.destinoId);
  if (!Number.isInteger(destino)) return null;
  const { previo } = opciones;
  const contraindicada = respuesta.clase === 'CONTRAINDICATED';
  const cuerpo: DecisionOptionUpsertRequest = {
    sourceNodeId,
    targetNodeId: destino,
    optionKey: previo?.optionKey ?? opciones.optionKey ?? claveLibre(`opcion-${respuesta.id}`, new Set()),
    text: respuesta.texto,
    prohibitedConduct: contraindicada,
    prohibitionReason: contraindicada ? respuesta.razon : null,
    immediateFeedback: previo?.immediateFeedback ?? '',
    feedbackText: respuesta.retroalimentacion,
    effects: efectosAApi(respuesta.efectos),
  };
  if (respuesta.clase) cuerpo.responseClass = respuesta.clase;
  if (respuesta.marcaIa && !previo?.aiSuggested) cuerpo.aiSuggested = true;
  // Ausente = no tocar: el requisito y la reacción solo viajan si la docente los cambió (o si la opción es nueva).
  if (respuesta.requiere !== undefined && (!previo || !mismoJson(respuesta.requiere, previo.requires ?? {}))) {
    cuerpo.requires = structuredClone(respuesta.requiere);
  }
  if (respuesta.reaccion !== undefined && (!previo || !mismoJson(respuesta.reaccion, reaccionDesdeApi(previo.reaction)))) {
    cuerpo.reaction = { ...respuesta.reaccion };
  }
  return cuerpo;
}

// ─── Guion ───────────────────────────────────────────────────────────────────

/**
 * La emoción que se escribe de una línea: la que traía del servidor mientras la expresión siga siendo la que esa emoción
 * ya mostraba (una heredada como «concerned» no se reescribe como «preocupada»); si el docente cambió la expresión, el
 * retrato elegido.
 */
function emocionAEscribir(l: Linea): string {
  return l.emocionDeOrigen !== undefined && expresionDe(l.emocionDeOrigen) === l.expresion ? l.emocionDeOrigen : l.expresion;
}

export interface OpcionesGuion {
  /** La clave de la escena: el diálogo se llama «guion-<clave>». */
  nodeKey: string;
  previo?: WorldDialogueTree;
}

/** Las líneas de la escena como el diálogo de su sala (uno por escena); las líneas que lleguen reemplazan a las que había. */
export function cuerpoGuion(
  escena: Escena, personajes: Array<Pick<Personaje, 'id' | 'nombre'>>, opciones: OpcionesGuion,
): DialogueUpsertRequest {
  const nombreDe = (id: string): string => personajes.find((p) => p.id === id)?.nombre ?? id;
  const { previo } = opciones;
  return {
    treeKey: previo?.key ?? `guion-${opciones.nodeKey}`,
    speakerName: previo?.speakerName || (escena.lineas[0] ? nombreDe(escena.lineas[0].personajeId) : '') || 'Guion',
    portraitKey: previo?.portraitKey ?? null,
    emotion: previo?.emotion ?? 'neutral',
    lines: escena.lineas.map((l, i) => ({
      displayOrder: i + 1, speakerName: nombreDe(l.personajeId), text: l.texto, emotion: emocionAEscribir(l), aiSuggested: l.marcaIa,
    })),
  };
}

// ─── Salas ───────────────────────────────────────────────────────────────────

export interface ContextoSala {
  /** La revisión vigente del caso. */
  revision: number;
  /** El catálogo del lugar del caso (vacío en un caso sin lugar). */
  catalogo: Escenario['catalogo'];
  /** Los personajes del lugar (para dar de alta uno en una sala). */
  personajes: Personaje[];
  /** Los personajes que el caso ya tiene (`editor.characters`). */
  personajesDelCaso: CharacterEditorState[];
  nodosPorSala?: ReadonlyMap<string, string>;
  salaPorNodo?: ReadonlyMap<string, string>;
}

export interface SolicitudDeSala {
  solicitud: WorldRoomSaveRequest;
  /** Personajes puestos en la sala que el caso aún no tiene: hay que darlos de alta antes de guardar la sala. */
  faltanPersonajes: string[];
  puertasSinGuardar: string[];
}

const COLOR_OBJETO = '#4FA3A5';
const ICONO_POR_TIPO: Record<string, string> = { PERSON: 'person', EXIT: 'door_front', NOTE: 'article', RESOURCE: 'description' };
const ICONO_POR_DEFECTO = 'inventory_2';
const TAMANO_OBJETO = 32;
const TAMANO_PERSONA = 48;
const FPS_POR_DEFECTO = 6;
/**
 * `metadata.apoyo`: la posición del objeto es el punto donde apoya en el suelo (centro inferior), como lo dibuja el editor y,
 * para lo que dice esto, el juego. Lo mismo que escribe la copia del servidor. Solo lo que se agrega desde el catálogo lo
 * lleva: lo que ya estaba conserva lo que el servidor guardó (un caso de antes no cambia de lugar en el juego).
 */
const APOYO_EN_LOS_PIES = 'pies';

/**
 * La marca «sugerido por la IA» de un objeto que ya estaba: la del borrador manda (así «Aceptar» la baja aunque la copia que
 * se guardó del mapa aún diga que sí). Sin marca en ninguno de los dos lados no se toca.
 */
function conMarca(objeto: WorldObject, marca: boolean | undefined): WorldObject {
  if (marca === true) return { ...objeto, aiSuggested: true };
  return objeto.aiSuggested === true ? { ...objeto, aiSuggested: false } : objeto;
}

/** La marca de un objeto que el servidor aún no tiene. */
const marcaNueva = (marca: boolean | undefined): Partial<WorldObject> => (marca === true ? { aiSuggested: true } : {});

/**
 * La clave de un objeto que el servidor aún no tiene: la que el borrador ya le dio (así todos los mapas de una sala
 * lo llaman igual), si está libre en este mapa; si no, una nueva a partir de la pieza.
 */
export function claveDeNuevo(propuesta: string | undefined, ref: string, usadas: Set<string>): string {
  if (propuesta && !usadas.has(propuesta)) {
    usadas.add(propuesta);
    return propuesta;
  }
  return claveLibre(ref, usadas);
}

function objetoNuevo(
  clave: string, etiqueta: string, tipo: WorldObject['type'], x: number, y: number, ancho: number, alto: number,
  extra: Partial<WorldObject>,
): WorldObject {
  return {
    id: 0, key: clave, label: etiqueta, type: tipo, x, y, width: ancho, height: alto, zIndex: 0, facing: 'down',
    colorHex: COLOR_OBJETO, icon: ICONO_POR_TIPO[tipo] ?? ICONO_POR_DEFECTO, shortCode: 'ACT', collision: false,
    visible: true, interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null,
    unlockCondition: {}, movementPattern: {}, metadata: {}, ...extra,
  };
}

/** La huella de un mueble en el suelo: el punto de apoyo es su centro inferior. */
export function huella(
  clave: string, etiqueta: string, x: number, y: number, ancho: number, alto: number, id = 0,
): WorldCollisionZone {
  return { id, key: `choque-${clave}`, label: etiqueta, x: x - Math.floor(ancho / 2), y: y - alto, width: ancho, height: alto };
}

/**
 * Lo que se guarda de una persona que ya estaba en el mapa: la expresión y, si el docente los cambió, cómo se mueve y si es la
 * persona a atender. Lo que no cambió se deja tal cual lo guardó el servidor (incluso un movimiento que el editor no entiende).
 */
function metadataDePersona(base: Record<string, unknown>, p: SalaCaso['personajes'][number]): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...base, expresion: p.expresion satisfies Expresion };
  if (p.movimiento !== undefined && !mismoMovimiento(p.movimiento, movimientoDeMetadata(base['movimiento']))) {
    metadata['movimiento'] = movimientoAMetadata(p.movimiento);
  }
  if (p.personaClave !== undefined && p.personaClave !== (base['personaClave'] === true)) {
    if (p.personaClave) metadata['personaClave'] = true;
    else delete metadata['personaClave'];
  }
  return metadata;
}

/**
 * La sala como mundo de uno de sus mapas. El servidor guarda cada escena con su propio mapa, así que para una sala
 * compartida por varias escenas el store llama a esta función una vez por mapa, con el mundo previo de ese mapa.
 *
 * Los objetos que ya estaban se reconocen por su clave y parten de lo que el servidor tenía (movimiento, persona clave,
 * arte, etc.), cambiando solo lo que el editor edita; los que faltan en la sala se quitan; los nuevos se arman copiando
 * los valores del catálogo. Los diálogos y las herramientas no se mandan (el servidor deja sin tocar una lista ausente).
 */
export function solicitudDeSala(sala: SalaCaso, contexto: ContextoSala, previo: WorldDefinition): SolicitudDeSala {
  const muebles = new Map(contexto.catalogo.muebles.map((m) => [m.id, m]));
  const objetosCatalogo = new Map(contexto.catalogo.objetos.map((o) => [o.id, o]));
  const personajesLugar = new Map(contexto.personajes.map((p) => [p.id, p]));
  const personajeDelCaso = new Map(contexto.personajesDelCaso.map((p) => [p.key, p]));
  const previos = new Map(previo.objects.map((o) => [o.key, o]));
  const faltanPersonajes: string[] = [];
  const puertasSinGuardar: string[] = [];

  // Lo que la sala dice que existe, por clave de objeto.
  type Edicion = (base: WorldObject) => WorldObject;
  const existentes = new Map<string, Edicion>();
  const nuevos: WorldObject[] = [];
  const zonasNuevas: WorldCollisionZone[] = [];
  const usadas = new Set(previos.keys());

  for (const m of sala.muebles) {
    if (m.clave && previos.has(m.clave)) {
      existentes.set(m.clave, (base) => {
        const metadata = { ...base.metadata };
        if (m.espejo) metadata['espejo'] = true; else delete metadata['espejo'];
        return conMarca({ ...base, x: m.x, y: m.y, metadata }, m.marcaIa);
      });
      continue;
    }
    const pieza = muebles.get(m.ref);
    if (!pieza) continue; // sin catálogo no se pueden agregar piezas
    const clave = claveDeNuevo(m.clave, m.ref, usadas);
    const metadata: Record<string, unknown> = { arte: pieza.arte, colision: pieza.colision, apoyo: APOYO_EN_LOS_PIES };
    if (m.espejo) metadata['espejo'] = true;
    nuevos.push(objetoNuevo(clave, pieza.nombre, 'PROP', m.x, m.y, pieza.ancho, pieza.alto, { metadata, ...marcaNueva(m.marcaIa) }));
    if (pieza.colision) zonasNuevas.push(huella(clave, pieza.nombre, m.x, m.y, pieza.ancho, pieza.alto));
  }

  for (const o of sala.objetos) {
    if (o.clave && previos.has(o.clave)) {
      // La herramienta que entrega al revisarlo (la elige la docente); si no cambió, se deja la del servidor tal cual.
      const antes = previos.get(o.clave)!.toolCode || null;
      const herramienta = (o.toolCode ?? null) === antes ? {} : { toolCode: o.toolCode ?? null };
      existentes.set(o.clave, (base) => conMarca({ ...base, x: o.x, y: o.y, ...herramienta }, o.marcaIa));
      continue;
    }
    const pieza = objetosCatalogo.get(o.ref);
    if (!pieza) continue;
    const metadata: Record<string, unknown> = { arte: pieza.arte, apoyo: APOYO_EN_LOS_PIES };
    if (pieza.animacionCerca) {
      metadata['animacionCerca'] = {
        hoja: pieza.animacionCerca.hoja, cuadros: pieza.animacionCerca.cuadros, fps: pieza.animacionCerca.fps ?? FPS_POR_DEFECTO,
      };
    }
    nuevos.push(objetoNuevo(claveDeNuevo(o.clave, o.ref, usadas), pieza.nombre, pieza.tipo, o.x, o.y, TAMANO_OBJETO, TAMANO_OBJETO, {
      interactionPrompt: pieza.textoInteraccion, interactionText: pieza.alRevisar ?? '', metadata, ...marcaNueva(o.marcaIa),
      toolCode: o.toolCode ?? null,
    }));
  }

  for (const p of sala.personajes) {
    const facing = p.mirando === 'izquierda' ? 'left' : 'right';
    if (p.clave && previos.has(p.clave)) {
      existentes.set(p.clave, (base) => conMarca({
        ...base, x: p.x, y: p.y, facing, metadata: metadataDePersona(base.metadata, p),
      }, p.marcaIa));
      continue;
    }
    const info = personajesLugar.get(p.ref);
    const delCaso = personajeDelCaso.get(p.ref);
    if (!delCaso && !faltanPersonajes.includes(p.ref)) faltanPersonajes.push(p.ref);
    nuevos.push(objetoNuevo(
      claveDeNuevo(p.clave, p.ref, usadas), info?.nombre ?? delCaso?.displayName ?? p.ref, 'PERSON', p.x, p.y, TAMANO_PERSONA, TAMANO_PERSONA, {
        interactionPrompt: 'Hablar', facing, ...marcaNueva(p.marcaIa),
        ...(delCaso ? { characterId: delCaso.id } : {}),
        metadata: {
          recipeId: info?.recipeId ?? '', movimiento: movimientoAMetadata(p.movimiento ?? 'quieto'), expresion: p.expresion,
          apoyo: APOYO_EN_LOS_PIES,
          ...(p.personaClave ? { personaClave: true } : {}),
        },
      },
    ));
  }

  for (const puerta of sala.puertas) {
    const encontrado = previos.get(puerta.id);
    const base = encontrado?.type === 'EXIT' ? encontrado : undefined;
    const anterior = base?.metadata['targetNodeKey'];
    let destino = typeof anterior === 'string' ? anterior : undefined;
    if (puerta.hacia !== null && (!base || (contexto.salaPorNodo && contexto.salaPorNodo.get(destino ?? '') !== puerta.hacia))) {
      const nuevoDestino = contexto.nodosPorSala?.get(puerta.hacia);
      if (nuevoDestino) destino = nuevoDestino;
      else puertasSinGuardar.push(puerta.id);
    } else if (!base && puerta.hacia === null) {
      puertasSinGuardar.push(puerta.id);
    }
    if (!base && !destino) continue;
    const metadata: Record<string, unknown> = { ...(base?.metadata ?? {}) };
    if (destino !== undefined) metadata['targetNodeKey'] = destino;
    for (const campo of ['muro', 'pos', 'modelo', 'par', 'sentidoUnico'] as const) {
      if (puerta[campo] === undefined) delete metadata[campo];
      else metadata[campo] = puerta[campo];
    }
    if (base?.type === 'EXIT') {
      existentes.set(puerta.id, (original) => ({ ...original, label: puerta.etiqueta, metadata }));
    } else {
      const punto = puerta.muro !== undefined && puerta.pos !== undefined
        ? llegada(puerta.muro, puerta.pos, sala.encuadre, sala.estructura?.ancho ?? previo.map.width)
        : { x: puerta.x, y: puerta.y };
      nuevos.push(objetoNuevo(claveDeNuevo(puerta.id, puerta.id, usadas), puerta.etiqueta, 'EXIT', punto.x, punto.y, 24, 40, { metadata }));
    }
  }
  const objects: WorldObject[] = [];
  for (const base of previo.objects) {
    const edicion = existentes.get(base.key);
    if (edicion) objects.push(edicion(base));
  }
  objects.push(...nuevos);

  // Las huellas de choque siguen a sus muebles; las demás zonas no se tocan.
  const colocados = new Map(objects.map((o) => [o.key, o]));
  const collisionZones: WorldCollisionZone[] = [];
  for (const zona of previo.collisionZones) {
    const duenoClave = zona.key.startsWith('choque-') ? zona.key.slice('choque-'.length) : null;
    if (duenoClave === null) {
      collisionZones.push(zona);
      continue;
    }
    const dueno = colocados.get(duenoClave);
    const antes = previos.get(duenoClave);
    if (!dueno) continue; // el mueble ya no está: su huella tampoco
    const seMovio = !antes || antes.x !== dueno.x || antes.y !== dueno.y;
    collisionZones.push(seMovio && antes ? { ...zona, x: zona.x + dueno.x - antes.x, y: zona.y + dueno.y - antes.y } : zona);
  }
  collisionZones.push(...zonasNuevas);

  return {
    solicitud: {
      revision: contexto.revision,
      map: { ...previo.map, spawnX: sala.entrada.x, spawnY: sala.entrada.y, ...(sala.estructura != null || previo.map.structure !== undefined ? { structure: sala.estructura ?? previo.map.structure ?? null } : {}) },
      objects,
      collisionZones,
    },
    faltanPersonajes,
    puertasSinGuardar,
  };
}

// ─── Casos nuevos ────────────────────────────────────────────────────────────

/**
 * Crear un caso: con un lugar, nace con una copia de las salas elegidas; sin lugar, nace vacío.
 *
 * Las salas se piden por piezas (`porPiezas`), igual que las arma la generación con IA: el mundo por piezas es el formato
 * del caso y las piezas nuevas son para quien arma salas. El servidor usa la plantilla por piezas del lugar si la hay
 * (`escenario-piezas.json`) y, si no, la de imagen fija de siempre.
 */
export function cuerpoCrearCaso(titulo: string, lugarId: string | null, salas: string[], descripcion = ''): CaseCreateRequest {
  // La descripción es el contexto que lee el estudiante y la compuerta de publicación exige una: el editor no tiene dónde
  // escribirla, así que nace con la de la idea o el lugar elegidos.
  const conDescripcion = descripcion.trim() ? { description: descripcion.trim() } : {};
  return lugarId === null
    ? { title: titulo, ...conDescripcion }
    : { title: titulo, ...conDescripcion, lugarId, salas: [...salas], porPiezas: true };
}
