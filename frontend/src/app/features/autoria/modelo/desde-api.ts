/**
 * De lo que entrega la API de autoría al borrador que edita el docente. Funciones puras: no piden nada ni guardan nada.
 *
 * El servidor guarda cada escena como un nodo con su propio mapa; el editor habla de **salas** (el lugar físico que
 * varias escenas pueden compartir). La sala se identifica con `ambient.salaId` del mapa; un mapa que no la dice (un
 * caso viejo o hecho a mano) es una sala en sí mismo: su identidad es la clave del mapa y su nombre, el del mapa.
 * El lugar del caso (`lugarId`) se deduce de `ambient.lugarId`; si ningún mapa lo dice, el caso no tiene lugar y se
 * edita sin catálogo.
 */
import type { Expresion } from '../../../core/models/biblioteca.model';
import type {
  CaseEditorView, CharacterEditorState, CommentState, DecisionEdgeState, EndingRule, NodeEditorState, ReactionState,
  SceneMapDefinition, WorldDefinition, WorldDialogueTree, WorldObject,
} from '../../../core/models/simulation.model';
import { GESTOS } from '../../../core/models/simulation.model';
import type {
  CasoBorrador, Comentario, ColocacionCaso, ColocacionPersonajeCaso, EfectosRespuesta, Escena, Final, Hito, Linea, Pista,
  PuertaCaso, Reaccion, Respuesta, SalaCaso,
} from './caso';
import { competenciasDeRubricas } from './efectos';
import type { Encuadre, Escenario, Mirando } from './escenario';
import { EXPRESIONES } from './escenario';
import { textosDeLaPlantillaGuardada } from './finales';
import { movimientoDeMetadata } from './movimiento';
import { MUROS } from './geometria';

/** La clave con la que se guarda el guion de una escena: el diálogo de la sala que no es de ninguna persona. */
export const PREFIJO_GUION = 'guion-';

const ENCUADRES: readonly Encuadre[] = ['tres-paredes', 'dos-paredes-izquierda', 'dos-paredes-derecha', 'una-pared'];
const CATALOGO_VACIO: Escenario['catalogo'] = { muebles: [], objetos: [], herramientas: [] };

const texto = (valor: unknown): string | null => (typeof valor === 'string' && valor.trim() ? valor : null);

/** La sala a la que pertenece un mapa: la que dice `ambient.salaId` o, si no dice ninguna, el propio mapa. */
export function salaIdDeMapa(mapa: Pick<SceneMapDefinition, 'key' | 'ambient'>): string {
  return texto(mapa.ambient?.['salaId']) ?? mapa.key;
}

/** Relaciona cada nodo con la sala de su mapa, en el orden del editor. */
export function salaPorClaveDeNodoDe(mapas: CaseEditorView['maps'], mundos: WorldDefinition[]): Map<string, string> {
  const mundoPorNodo = new Map(mundos.map((m) => [m.nodeId, m]));
  return new Map(mapas.map((mapa) => [mapa.nodeKey, salaIdDeMapa(mundoPorNodo.get(mapa.nodeId)?.map ?? { key: mapa.key, ambient: {} })]));
}

function lugarIdDeMapa(mapa: Pick<SceneMapDefinition, 'ambient'>): string | null {
  return texto(mapa.ambient?.['lugarId']);
}

/**
 * Las emociones del vocabulario anterior (el de los casos viejos y el de las voces del juego) y el retrato del kit que les
 * corresponde: es la tabla `emotionToPortrait` de `frontend/character-kit/catalog.json` (una prueba las compara).
 */
export const EMOCION_A_EXPRESION: Readonly<Record<string, Expresion>> = {
  neutral: 'neutral', vulnerable: 'preocupada', concerned: 'preocupada', anxious: 'preocupada', worried: 'preocupada',
  danger: 'triste', negative: 'triste', sad: 'triste', relieved: 'neutral', calm: 'neutral', receptive: 'neutral',
  closed: 'neutral', positive: 'alegre', guarded: 'cautelosa', crisis: 'en-crisis',
};

/** El retrato de una emoción: el de los seis del kit, el de la tabla del kit para las heredadas y `neutral` para lo desconocido. */
export function expresionDe(valor: unknown): Expresion {
  if (EXPRESIONES.includes(valor as Expresion)) return valor as Expresion;
  return typeof valor === 'string' && Object.hasOwn(EMOCION_A_EXPRESION, valor) ? EMOCION_A_EXPRESION[valor] : 'neutral';
}

/** La pieza del catálogo a la que corresponde la clave de un objeto: el id, o el id con el sufijo `-2`, `-3`… */
function refDeCatalogo(clave: string, ids: string[]): string | null {
  const candidatas = ids.filter((id) => clave === id || (clave.startsWith(`${id}-`) && /^\d+$/.test(clave.slice(id.length + 1))));
  return candidatas.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Un gesto o una emoción del vocabulario cerrado, o `undefined` (lo que no es del vocabulario no se inventa). */
const gestoDe = (valor: unknown): Reaccion['gesto'] => GESTOS.find((g) => g === valor);
const emocionDe = (valor: unknown): Reaccion['emocion'] => EXPRESIONES.find((e) => e === valor);

/** La reacción de una respuesta: solo lo que dice el servidor y entra en el vocabulario; `{}` = sin reacción. */
export function reaccionDesdeApi(r: ReactionState | undefined): Reaccion {
  const reaccion: Reaccion = {};
  if (typeof r?.linea === 'string' && r.linea !== '') reaccion.linea = r.linea;
  const emocion = emocionDe(r?.emocion);
  if (emocion) reaccion.emocion = emocion;
  const gesto = gestoDe(r?.gesto);
  if (gesto) reaccion.gesto = gesto;
  if (typeof r?.personaje === 'string' && r.personaje !== '') reaccion.personaje = r.personaje;
  return reaccion;
}

export function comentarioDesdeApi(c: CommentState): Comentario {
  const comentario: Comentario = { personaje: c.personaje, linea: c.linea };
  if (c.cuando && Object.keys(c.cuando).length > 0) comentario.cuando = structuredClone(c.cuando);
  const emocion = emocionDe(c.emocion);
  if (emocion) comentario.emocion = emocion;
  const gesto = gestoDe(c.gesto);
  if (gesto) comentario.gesto = gesto;
  return comentario;
}

interface Contexto {
  editor: CaseEditorView;
  catalogo: Escenario['catalogo'];
  personajePorId: Map<number, CharacterEditorState>;
  salaPorClaveDeNodo: Map<string, string>;
}

function puertaDe(o: WorldObject, ctx: Contexto): PuertaCaso | null {
  const destino = texto(o.metadata?.['targetNodeKey']);
  if (o.type !== 'EXIT') return null;
  const puerta: PuertaCaso = { id: o.key, hacia: destino === null ? null : ctx.salaPorClaveDeNodo.get(destino) ?? null, x: o.x, y: o.y, etiqueta: o.label };
  const metadata = o.metadata;
  const muro = MUROS.find((m) => m === metadata['muro']);
  if (muro) puerta.muro = muro;
  if (typeof metadata['pos'] === 'number') puerta.pos = metadata['pos'];
  if (typeof metadata['modelo'] === 'string') puerta.modelo = metadata['modelo'];
  if (typeof metadata['par'] === 'string') puerta.par = metadata['par'];
  if (typeof metadata['sentidoUnico'] === 'boolean') puerta.sentidoUnico = metadata['sentidoUnico'];
  return puerta;
}

function salaDesdeMundo(mundo: WorldDefinition, ctx: Contexto, lugarId: string | null): SalaCaso {
  const { map } = mundo;
  const salaId = salaIdDeMapa(map);
  const nodo = ctx.editor.nodes.find((n) => n.id === mundo.nodeId);
  const encuadre = ENCUADRES.find((e) => e === map.ambient?.['encuadre']) ?? 'tres-paredes';
  const idsMuebles = ctx.catalogo.muebles.map((m) => m.id);
  const idsObjetos = ctx.catalogo.objetos.map((o) => o.id);

  const muebles: ColocacionCaso[] = [];
  const objetos: ColocacionCaso[] = [];
  const personajes: ColocacionPersonajeCaso[] = [];
  const puertas: PuertaCaso[] = [];
  for (const o of mundo.objects) {
    const puerta = puertaDe(o, ctx);
    if (puerta) {
      puertas.push(puerta);
    } else if (o.type === 'PERSON') {
      const personaje = o.characterId == null ? undefined : ctx.personajePorId.get(o.characterId);
      personajes.push({
        ref: personaje?.key ?? o.key, clave: o.key, x: o.x, y: o.y,
        mirando: (o.facing === 'left' ? 'izquierda' : 'derecha') satisfies Mirando, expresion: expresionDe(o.metadata?.['expresion']),
        movimiento: movimientoDeMetadata(o.metadata?.['movimiento']), personaClave: o.metadata?.['personaClave'] === true,
        ...(o.aiSuggested === true ? { marcaIa: true } : {}),
      });
    } else {
      const refMueble = refDeCatalogo(o.key, idsMuebles);
      const refObjeto = refDeCatalogo(o.key, idsObjetos);
      const esMueble = o.type === 'PROP' && (refMueble !== null || refObjeto === null);
      const colocacion: ColocacionCaso = { ref: (esMueble ? refMueble : refObjeto) ?? o.key, clave: o.key, x: o.x, y: o.y };
      if (o.decisionOptionId != null) colocacion.decisionOptionId = o.decisionOptionId;
      if (o.toolCode) colocacion.toolCode = o.toolCode;
      if (o.aiSuggested === true) colocacion.marcaIa = true;
      if (esMueble) {
        colocacion.espejo = o.metadata?.['espejo'] === true;
        muebles.push(colocacion);
      } else {
        objetos.push(colocacion);
      }
    }
  }
  return {
    id: salaId, nombre: map.title, descripcion: nodo?.narrative ?? '', encuadre,
    fondo: texto(map.ambient?.['backgroundImage']) ?? '', entrada: { x: map.spawnX, y: map.spawnY },
    muebles, objetos, personajes, puertas, estructura: map.structure == null ? null : structuredClone(map.structure),
    choques: Object.fromEntries(mundo.collisionZones.filter((z) => z.key.startsWith('choque-')).map((z) => [z.key.slice(7), { x: z.x, y: z.y, ancho: z.width, alto: z.height }])),
    origen: lugarId !== null && texto(map.ambient?.['salaId']) !== null ? { lugarId, salaId } : null,
  };
}

/**
 * El diálogo que es el guion de la escena: el de clave «guion-…» (lo reconoce por la clave, tenga o no dueño: para que el
 * estudiante lo reciba, el guion cuelga de una persona de la sala) o, en un caso anterior, el que no es de ninguna persona.
 */
export function arbolDeGuion(mundo: WorldDefinition | undefined): WorldDialogueTree | undefined {
  const todos = mundo?.dialogues ?? [];
  return todos.find((d) => d.key.startsWith(PREFIJO_GUION)) ?? todos.find((d) => d.mapObjectId == null);
}

function efectosDesdeApi(efectos: DecisionEdgeState['effects'] | undefined): EfectosRespuesta {
  const resultado: EfectosRespuesta = {};
  if (efectos?.persona) resultado.persona = { ...efectos.persona };
  if (efectos?.milestones) resultado.hitos = [...efectos.milestones];
  if (efectos?.competencies) {
    resultado.competencias = Array.isArray(efectos.competencies) ? [...efectos.competencies] : { ...efectos.competencies };
  }
  return resultado;
}

function respuestaDesdeApi(d: DecisionEdgeState): Respuesta {
  return {
    id: String(d.id), texto: d.text, clase: d.responseClass, razon: d.prohibitionReason ?? '',
    retroalimentacion: d.feedbackText || d.immediateFeedback || '', efectos: efectosDesdeApi(d.effects),
    destinoId: String(d.targetNodeId), marcaIa: d.aiSuggested === true,
    requiere: structuredClone(d.requires ?? {}), reaccion: reaccionDesdeApi(d.reaction),
  };
}

function lineasDesdeApi(mundo: WorldDefinition | undefined, personajes: CharacterEditorState[]): Linea[] {
  const arbol = arbolDeGuion(mundo);
  if (!arbol) return [];
  return [...arbol.lines].sort((a, b) => a.order - b.order).map((l) => ({
    id: `${arbol.id}:${l.order}`,
    personajeId: personajes.find((p) => p.displayName === l.speakerName)?.key ?? l.speakerName,
    texto: l.text, expresion: expresionDe(l.emotion), emocionDeOrigen: l.emotion, marcaIa: l.aiSuggested === true,
  }));
}

/** Las pistas de la sala de una escena (las ayudas de su mapa), por su orden. */
function pistasDesdeApi(n: NodeEditorState, editor: CaseEditorView): Pista[] {
  const mapaIds = new Set(editor.maps.filter((m) => m.nodeId === n.id).map((m) => m.id));
  const delMapa = (editor.hints ?? []).filter((h) => mapaIds.has(h.mapId));
  return delMapa.sort((a, b) => a.order - b.order).map((h) => ({ id: String(h.id), texto: h.text }));
}

function escenaDesdeApi(
  n: NodeEditorState, salaId: string | null, mundo: WorldDefinition | undefined, editor: CaseEditorView,
): Escena {
  return {
    id: String(n.id), titulo: n.title, narracion: n.narrative ?? '', salaId, esFinal: n.terminal,
    posicion: { x: n.positionX ?? 0, y: n.positionY ?? 0 },
    intensidad: n.intensity, advertencia: n.warningMessage ?? null, recursosApoyo: [...(n.supportResources ?? [])], marcaIa: n.aiSuggested === true,
    objetivo: n.goal ?? '', pistas: pistasDesdeApi(n, editor), comentarios: (n.comments ?? []).map(comentarioDesdeApi),
    lineas: lineasDesdeApi(mundo, editor.characters),
    respuestas: editor.decisions.filter((d) => d.sourceNodeId === n.id).map(respuestaDesdeApi),
  };
}

function finalDesdeApi(e: EndingRule): Final {
  return {
    id: e.key, nombre: e.title, texto: e.message, tono: e.tone, marcaIa: e.aiSuggested === true,
    condicion: (e.when ?? null) as Final['condicion'],
  };
}

/** La lista de verificación como la lee el docente. */
function listaDesdeApi(lista: CaseEditorView['checklist'] | undefined): NonNullable<CasoBorrador['lista']> {
  return {
    items: (lista?.items ?? []).map((i) => ({
      codigo: i.code, texto: i.label, obligatorio: i.required, cumplido: i.fulfilled, enBorrador: i.draft,
      respaldo: i.backingLabel ?? null, respaldado: i.backed ?? null, quien: i.backing ?? null,
    })),
    constanciaRegistrada: lista?.contentReview?.fulfilled === true,
  };
}

const ESTADOS = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;
/** El estado del caso en el servidor; un valor que no se conoce se trata como borrador (el servidor decide al guardar). */
function estadoDe(valor: string): NonNullable<CasoBorrador['estado']> {
  return (ESTADOS as readonly string[]).includes(valor) ? (valor as NonNullable<CasoBorrador['estado']>) : 'DRAFT';
}

function hitoDesdeApi(h: CaseEditorView['rules']['milestones'][number]): Hito {
  return { clave: h.key, nombre: h.label, descripcion: h.description, decisivo: h.decisive };
}

/**
 * El borrador completo de un caso: lo que dice `GET …/editor` más el mundo de cada mapa (`GET …/world?nodeId=`),
 * porque el editor del caso no trae los objetos de las salas, su fondo ni los diálogos.
 *
 * `lugar` es el lugar de la biblioteca del caso (para el catálogo de piezas); sin él, el catálogo queda vacío y las
 * salas siguen siendo editables.
 */
export function casoDesdeApi(editor: CaseEditorView, mundos: WorldDefinition[], lugar: Escenario | null = null): CasoBorrador {
  const mundoPorNodo = new Map(mundos.map((m) => [m.nodeId, m]));
  const mapas = editor.maps.map((m) => ({ mapa: m, mundo: mundoPorNodo.get(m.nodeId) }));
  const definicion = (m: (typeof mapas)[number]['mapa'], mundo: WorldDefinition | undefined): SceneMapDefinition =>
    mundo?.map ?? { id: m.id, key: m.key, title: m.title, width: m.width, height: m.height, theme: m.theme, spawnX: m.spawnX, spawnY: m.spawnY, ambient: {} };

  const lugarId = mapas.map(({ mapa, mundo }) => lugarIdDeMapa(definicion(mapa, mundo))).find((id) => id !== null) ?? null;
  const catalogo = lugar && lugar.id === lugarId ? lugar.catalogo : CATALOGO_VACIO;

  const salaPorClaveDeNodo = salaPorClaveDeNodoDe(editor.maps, mundos);
  const salaPorNodo = new Map(mapas.map(({ mapa }) => [mapa.nodeId, salaPorClaveDeNodo.get(mapa.nodeKey)!]));
  const ctx: Contexto = {
    editor, catalogo, salaPorClaveDeNodo, personajePorId: new Map(editor.characters.map((c) => [c.id, c])),
  };

  const salas: SalaCaso[] = [];
  for (const { mapa, mundo } of mapas) {
    const salaId = salaPorNodo.get(mapa.nodeId)!;
    if (salas.some((s) => s.id === salaId)) continue; // otra escena en la misma sala: se lee una vez
    salas.push(salaDesdeMundo(mundo ?? { ...mundoDeRespaldo(editor, mapa), map: definicion(mapa, mundo) }, ctx, lugarId));
  }

  // Todas las escenas aparecen, también las que no tienen mapa (sin sala): si no, las respuestas que llevan a ellas
  // quedarían colgando y los caminos darían avisos falsos.
  const escenas = editor.nodes.map((n) => escenaDesdeApi(n, salaPorNodo.get(n.id) ?? null, mundoPorNodo.get(n.id), editor));

  const inicio = editor.nodes.find((n) => n.startNode) ?? editor.nodes[0];
  const recetaDe = (c: CharacterEditorState): string => {
    const enMapa = mundos.flatMap((m) => m.objects).find((o) => o.characterId === c.id);
    return c.portraitKey || texto(enMapa?.metadata?.['recipeId']) || lugar?.personajes.find((p) => p.id === c.key)?.recipeId || '';
  };

  const hitos = editor.rules.milestones.map(hitoDesdeApi);
  const guardados = editor.rules.endings.map(finalDesdeApi);
  // Los cuatro finales de plantilla guardados (porque el docente reescribió alguno) siguen siendo el modo automático.
  const textosPlantilla = guardados.length > 0 ? textosDeLaPlantillaGuardada(guardados, hitos) : null;
  return {
    id: String(editor.caseVersionId), revision: editor.revision, titulo: editor.title, lugarId, salas, escenas,
    contexto: editor.context ?? '', objetivos: [...(editor.learningObjectives ?? [])],
    ...(editor.contentWarnings ? { temasSensibles: [...editor.contentWarnings] } : {}),
    inicioId: inicio ? String(inicio.id) : null,
    hitos, nivelRiesgo: editor.rules.riskLevel,
    modoFinales: guardados.length > 0 && !textosPlantilla ? 'propio' : 'automatico',
    finales: textosPlantilla ? [] : guardados,
    ...(textosPlantilla ? { textosPlantilla } : {}),
    competencias: competenciasDeRubricas(editor.rubrics ?? []),
    estado: estadoDe(editor.status),
    probadoHastaElFinal: editor.rehearsedToEnd === true,
    herramientas: (editor.tools ?? []).filter((t) => t.active).map((t) => ({ codigo: t.code, nombre: t.label })),
    lista: listaDesdeApi(editor.checklist),
    personajes: editor.characters.map((c) => ({ id: c.key, nombre: c.displayName, rol: c.roleLabel, recipeId: recetaDe(c) })),
    catalogo: structuredClone(catalogo),
  };
}

/** Un mundo sin objetos para un mapa del que no se pudo leer el mundo. */
function mundoDeRespaldo(editor: CaseEditorView, mapa: CaseEditorView['maps'][number]): WorldDefinition {
  return {
    schemaVersion: 2, caseVersionId: editor.caseVersionId, revision: editor.revision, nodeId: mapa.nodeId,
    map: { id: mapa.id, key: mapa.key, title: mapa.title, width: mapa.width, height: mapa.height, theme: mapa.theme, spawnX: mapa.spawnX, spawnY: mapa.spawnY, ambient: {} },
    objects: [], collisionZones: [], dialogues: [], clinicalTools: [],
    safeExit: { configured: false, exitObjectKey: null, supportResources: [] },
    validation: { errors: [], warnings: [], canPublish: false }, availableDecisions: [], rooms: [],
  };
}
