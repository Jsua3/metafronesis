/**
 * Cómo se guarda cada cosa del borrador en el servidor. Cada función recibe el borrador **después** del cambio y lo
 * pone al día en el servidor: mira lo que el servidor ya tiene (la sesión) y manda lo que falta (crear), lo que cambió
 * (actualizar) o lo que sobra (borrar). Así una función sirve igual para una edición, para dos ediciones fusionadas y
 * para volver a intentar.
 *
 * Las funciones solo hablan con el servidor a través de la sesión (que lleva la revisión): no tocan el borrador.
 */
import { HttpErrorResponse } from '@angular/common/http';

import type {
  BriefUpdateRequest, ChecklistUpdateRequest, WorldDefinition, WorldDialogueChoice, WorldDialogueTree, WorldObject, WorldRoomSaveRequest,
} from '../../../core/models/simulation.model';
import type { CasoBorrador, Escena, Respuesta } from '../modelo/caso';
import { arbolDeGuion, salaPorClaveDeNodoDe } from '../modelo/desde-api';
import {
  claveLibre, cuerpoDecision, cuerpoLista, cuerpoGuion, cuerpoNodo, finalesAApi, hitosAApi, solicitudDeSala,
} from '../modelo/hacia-api';
import type { SesionServidor } from './sesion-servidor';

const ANCHO_POR_DEFECTO = 960;
const ALTO_POR_DEFECTO = 528;
const TEMA_POR_DEFECTO = 'clinical-soft';

/** `base-1`, `base-2`… la primera que no está usada (y la anota). */
function numerada(base: string, usadas: Set<string>): string {
  let n = 1;
  while (usadas.has(`${base}-${n}`)) n++;
  const clave = `${base}-${n}`;
  usadas.add(clave);
  return clave;
}

const escenaDe = (caso: CasoBorrador, id: string): Escena | undefined => caso.escenas.find((e) => e.id === id);

// ─── Salas ───────────────────────────────────────────────────────────────────

/**
 * El cuerpo para guardar la sala sobre el mapa `previo`. Si la sala nombra a un personaje que el caso aún no tiene, se
 * da de alta antes (la persona del mapa se enlaza a su personaje).
 */
async function armarSolicitudDeSala(
  s: SesionServidor, caso: CasoBorrador, salaId: string, previo: WorldDefinition,
  pendientes?: Set<string>,
): Promise<Omit<WorldRoomSaveRequest, 'revision'>> {
  const sala = caso.salas.find((x) => x.id === salaId);
  if (!sala) throw new Error(`La sala «${salaId}» no está en el caso.`);
  const salaPorNodo = salaPorClaveDeNodoDe(s.vista.maps, [...s.mundos.values()]);
  const nodosPorSala = new Map<string, string>();
  for (const [nodo, sala] of salaPorNodo) {
    if (!nodosPorSala.has(sala)) nodosPorSala.set(sala, nodo);
  }
  for (let intento = 0; intento < 2; intento++) {
    const { solicitud, faltanPersonajes, puertasSinGuardar } = solicitudDeSala(
      sala,
      { revision: s.revision, catalogo: caso.catalogo, personajes: caso.personajes, personajesDelCaso: s.vista.characters, nodosPorSala, salaPorNodo },
      previo,
    );
    if (faltanPersonajes.length === 0) {
      for (const id of puertasSinGuardar) pendientes?.add(id);
      return solicitud;
    }
    for (const ref of faltanPersonajes) {
      const info = caso.personajes.find((p) => p.id === ref);
      await s.crearPersonaje({ characterKey: ref, displayName: info?.nombre ?? ref, roleLabel: info?.rol ?? '', portraitKey: '' });
    }
  }
  throw new Error('No se pudo dar de alta a un personaje de la sala.');
}

/** La sala quedó guardada en unos mapas y en otros no, y no hubo forma de alinearlos. */
export class SalaDesalineada extends Error {
  constructor(readonly salaId: string) {
    super('Algunas escenas de esta sala pueden mostrarla distinta.');
  }
}

/** Se quitaron los caminos que llevaban a una escena, pero la escena no se pudo borrar. */
export class BorradoAMedias extends Error {
  constructor(readonly respuestas: string[]) {
    super('La escena no se pudo borrar después de quitar los caminos que llevaban a ella.');
  }
}

/** Se aceptaron algunas partes de una escena y otra falló: cuántas se alcanzaron a aceptar, de cuántas, y por qué paró. */
export class AceptacionAMedias extends Error {
  constructor(readonly hechas: number, readonly total: number, readonly causa: unknown) {
    super('No se alcanzó a aceptar toda la escena.');
  }
}

/** Lo sugerido por la IA en una escena y todavía sin aceptar: la escena misma, sus líneas, sus respuestas y las personas de su sala. */
export interface PlanDeAceptacion {
  escenaId: string;
  escena: boolean;
  lineas: number;
  respuestas: string[];
  salaId: string | null;
  /** La clave de cada persona marcada; `undefined` si todavía no está en el servidor. */
  personas: Array<string | undefined>;
}

export function planDeAceptacion(caso: CasoBorrador | null, escenaId: string): PlanDeAceptacion | null {
  const escena = caso?.escenas.find((e) => e.id === escenaId);
  if (!caso || !escena) return null;
  const sala = caso.salas.find((s) => s.id === escena.salaId);
  return {
    escenaId,
    escena: escena.marcaIa === true,
    lineas: escena.lineas.filter((l) => l.marcaIa).length,
    respuestas: escena.respuestas.filter((r) => r.marcaIa).map((r) => r.id),
    salaId: sala?.id ?? null,
    personas: (sala?.personajes ?? []).filter((p) => p.marcaIa).map((p) => p.clave),
  };
}

export const partesPorAceptar = (plan: PlanDeAceptacion): number =>
  (plan.escena ? 1 : 0) + plan.lineas + plan.respuestas.length + plan.personas.length;

/**
 * Acepta en el servidor todo lo del plan, una ruta tras otra y con la revisión que devuelve cada una: la escena, el guion (sus
 * líneas viajan juntas), cada respuesta y cada persona. Aceptar lo ya aceptado no cambia nada, así que repetir completa. Si una
 * ruta falla, lo aceptado queda y se lanza `AceptacionAMedias` con la cuenta.
 */
export async function aceptarEscena(s: SesionServidor, caso: CasoBorrador, plan: PlanDeAceptacion): Promise<void> {
  const pasos: Array<{ partes: number; hacer: () => Promise<unknown> }> = [];
  if (plan.escena) {
    pasos.push({ partes: 1, hacer: async () => { const nodo = s.nodoDe(plan.escenaId); if (nodo !== undefined) await s.aceptarNodo(nodo); } });
  }
  if (plan.lineas > 0) pasos.push({ partes: plan.lineas, hacer: () => sincronizarGuion(s, caso, plan.escenaId) });
  for (const id of plan.respuestas) {
    pasos.push({ partes: 1, hacer: async () => { const decision = s.decisionDe(id); if (decision !== undefined) await s.aceptarDecision(decision); } });
  }
  for (const clave of plan.personas) {
    pasos.push({ partes: 1, hacer: async () => { if (clave && plan.salaId) await aceptarPieza(s, caso, plan.salaId, clave); } });
  }
  let hechas = 0;
  for (const paso of pasos) {
    try {
      await paso.hacer();
    } catch (error) {
      throw new AceptacionAMedias(hechas, partesPorAceptar(plan), error);
    }
    hechas += paso.partes;
  }
}

/** Otra sesión cambió el caso: no se reintenta ni se da por perdido nada, lo trata el store. */
const esConflicto = (error: unknown): boolean => error instanceof HttpErrorResponse && error.status === 409;

/**
 * Guarda la sala en TODOS los mapas que la usan (cada escena tiene el suyo), uno tras otro. Si falla el primero, nada
 * cambió. Si falla uno de los siguientes, el primero ya quedó guardado: se reintenta una vez los que faltan, para
 * alinearlos con él; si tampoco se puede, se avisa con `SalaDesalineada` (el store muestra lo que quedó).
 */
export async function guardarSala(s: SesionServidor, caso: CasoBorrador, salaId: string): Promise<string[]> {
  const pendientes = new Set<string>();
  const nodos = caso.escenas
    .filter((e) => e.salaId === salaId)
    .map((e) => s.nodoDe(e.id))
    .filter((id): id is number => id !== undefined && s.mapaDeNodo(id) !== undefined);
  const guardar = async (nodoId: number) => {
    const solicitud = await armarSolicitudDeSala(s, caso, salaId, await s.mundoDe(nodoId), pendientes);
    await s.guardarMundo(nodoId, solicitud);
  };
  for (let i = 0; i < nodos.length; i++) {
    try {
      await guardar(nodos[i]);
    } catch (error) {
      if (i === 0 || esConflicto(error)) throw error;
      try {
        for (const pendiente of nodos.slice(i)) await guardar(pendiente);
      } catch (otra) {
        if (esConflicto(otra)) throw otra;
        throw new SalaDesalineada(salaId);
      }
      await recuperarGuiones(s, caso, nodos);
      return [...pendientes];
    }
  }
  await recuperarGuiones(s, caso, nodos);
  return [...pendientes];
}

/**
 * El guion de una escena cuelga de una persona de su sala: si la sala se guardó sin esa persona, el servidor se llevó el
 * guion con ella. El borrador lo conserva, así que se vuelve a escribir (con otra persona de la sala, si queda alguna).
 */
async function recuperarGuiones(s: SesionServidor, caso: CasoBorrador, nodos: number[]): Promise<void> {
  for (const nodoId of nodos) {
    const escenaId = s.escenaDeNodo(nodoId, caso.escenas);
    const escena = escenaId === undefined ? undefined : escenaDe(caso, escenaId);
    if (escena && escena.lineas.length > 0 && !arbolDeGuion(s.mundos.get(nodoId))) await sincronizarGuion(s, caso, escena.id);
  }
}

/**
 * Da por revisada una pieza de la sala (la puso o la movió el asistente). Cada escena de la sala tiene su propio mapa con su
 * propia fila de la pieza: se baja la marca en todas (bajarla donde ya estaba baja no cambia nada).
 */
export async function aceptarPieza(s: SesionServidor, caso: CasoBorrador, salaId: string, clave: string): Promise<void> {
  const nodos = caso.escenas
    .filter((e) => e.salaId === salaId)
    .map((e) => s.nodoDe(e.id))
    .filter((id): id is number => id !== undefined && s.mapaDeNodo(id) !== undefined);
  for (const nodoId of nodos) {
    const fila = (await s.mundoDe(nodoId)).objects.find((o) => o.key === clave);
    if (fila && fila.id) await s.aceptarObjeto(fila.id);
  }
}

// ─── Escenas ─────────────────────────────────────────────────────────────────

/**
 * Crea la escena en el servidor: el nodo, su mapa y la sala copiada en él (objetos, huellas, puertas y ambiente del
 * mapa de otra escena de la misma sala). Si algo falla a medias, deshace lo que alcanzó a crear.
 */
export async function crearEscena(s: SesionServidor, caso: CasoBorrador, escenaId: string): Promise<void> {
  const escena = escenaDe(caso, escenaId);
  if (!escena || s.nodoDe(escenaId) !== undefined) return;
  const sala = caso.salas.find((x) => x.id === escena.salaId);

  const clavesDeNodo = new Set(s.vista.nodes.map((n) => n.key));
  const nodeKey = numerada('escena', clavesDeNodo);
  const vista = await s.crearNodo(cuerpoNodo(escena, { nodeKey, esInicio: caso.inicioId === escena.id }));
  const nodo = vista.nodes.find((n) => n.key === nodeKey);
  if (!nodo) throw new Error('No se pudo crear la escena.');
  s.anotarNodo(escenaId, nodo.id);

  try {
    // El mapa de la escena: igual al de otra escena de su sala (o uno vacío si es la primera).
    const hermanoId = caso.escenas
      .filter((e) => e.salaId === escena.salaId && e.id !== escenaId)
      .map((e) => s.nodoDe(e.id))
      .find((id) => id !== undefined && s.mapaDeNodo(id) !== undefined);
    const hermano = hermanoId === undefined ? undefined : await s.mundoDe(hermanoId);
    const mapKey = claveLibre(`sala-${sala?.id ?? 'nueva'}`, new Set(s.vista.maps.map((m) => m.key)));
    const titulo = sala?.nombre ?? escena.titulo;
    const conMapa = await s.crearMapa({
      nodeId: nodo.id, mapKey, title: titulo, width: hermano?.map.width ?? ANCHO_POR_DEFECTO, height: hermano?.map.height ?? ALTO_POR_DEFECTO,
      theme: hermano?.map.theme ?? TEMA_POR_DEFECTO, spawnX: sala?.entrada.x ?? 0, spawnY: sala?.entrada.y ?? 0,
    });
    const mapa = conMapa.maps.find((m) => m.key === mapKey);
    if (!mapa || !sala) return;

    // El mapa nuevo dice siempre a qué sala pertenece (y a qué lugar): un mapa hermano de un caso viejo no lo dice, y
    // sin esto la sala se partiría en dos al recargar.
    const ambiente = {
      ...(hermano ? structuredClone(hermano.map.ambient) : { backgroundImage: sala.fondo, encuadre: sala.encuadre }),
      salaId: sala.id,
      ...(caso.lugarId ? { lugarId: caso.lugarId } : {}),
    };
    const previo: WorldDefinition = {
      ...(hermano ? structuredClone(hermano) : await s.mundoDe(nodo.id)),
      nodeId: nodo.id,
      map: { ...(hermano?.map ?? { width: ANCHO_POR_DEFECTO, height: ALTO_POR_DEFECTO, theme: TEMA_POR_DEFECTO, spawnX: sala.entrada.x, spawnY: sala.entrada.y }), id: mapa.id, key: mapKey, title: titulo, ambient: ambiente },
      objects: (hermano?.objects ?? []).map((o) => ({ ...structuredClone(o), id: 0 })),
      collisionZones: (hermano?.collisionZones ?? []).map((z) => ({ ...z, id: 0 })),
      dialogues: [],
    };
    const solicitud = await armarSolicitudDeSala(s, caso, sala.id, previo);
    await s.guardarMundo(nodo.id, solicitud);
    // Una escena que nace con pistas (la copia de otra, una propuesta de la IA) las guarda también: borrador y servidor coinciden.
    await guardarPistas(s, caso, escenaId);
  } catch (error) {
    try {
      await s.borrarNodo(nodo.id); // se lleva su mapa: no queda una escena a medias
    } catch {
      // si tampoco se puede deshacer, el error que importa es el primero
    }
    throw error;
  }
}

/** Pone al día título, posición, final, aviso, intensidad, objetivo y comentarios de la escena (y si es la de inicio). */
export async function actualizarEscena(s: SesionServidor, caso: CasoBorrador, escenaId: string): Promise<void> {
  const escena = escenaDe(caso, escenaId);
  const nodoId = s.nodoDe(escenaId);
  if (!escena || nodoId === undefined) return;
  const previo = s.vista.nodes.find((n) => n.id === nodoId);
  const cuerpo = cuerpoNodo(escena, { esInicio: caso.inicioId === escena.id, previo });
  if (previo && !cuerpo.aiSuggested
    && previo.title === cuerpo.title && previo.narrative === cuerpo.narrative && previo.terminal === cuerpo.terminal && previo.startNode === cuerpo.startNode
    && previo.positionX === cuerpo.positionX && previo.positionY === cuerpo.positionY && previo.intensity === cuerpo.intensity
    && (previo.warningMessage ?? null) === (cuerpo.warningMessage ?? null)
    && JSON.stringify(previo.supportResources ?? []) === JSON.stringify(cuerpo.supportResources ?? [])
    && !('goal' in cuerpo) && !('comments' in cuerpo)) { // el objetivo y los comentarios viajan solo si cambiaron
    return; // nada que decirle al servidor
  }
  await s.actualizarNodo(nodoId, cuerpo);
}

/**
 * Deja en el mapa de la escena exactamente las pistas del borrador, en su orden: las que ya hay cambian de texto si hace falta,
 * las que faltan se crean (al final) y las que sobran se borran. Una pista en blanco se queda en el borrador hasta que tenga
 * texto (el servidor no la aceptaria). Una escena sin mapa en el servidor no tiene donde guardarlas: no se manda nada.
 */
export async function guardarPistas(s: SesionServidor, caso: CasoBorrador, escenaId: string): Promise<void> {
  const escena = escenaDe(caso, escenaId);
  const nodoId = s.nodoDe(escenaId);
  const mapa = nodoId === undefined ? undefined : s.mapaDeNodo(nodoId);
  if (!escena || !mapa) return;
  const deseadas = (escena.pistas ?? []).map((p) => p.texto).filter((t) => t.trim() !== '');
  const guardadas = s.pistasDeMapa(mapa.id);
  for (let i = 0; i < deseadas.length; i++) {
    const guardada = guardadas[i];
    if (!guardada) await s.crearPista(mapa.id, { text: deseadas[i] });
    else if (guardada.text !== deseadas[i]) await s.actualizarPista(guardada.id, { text: deseadas[i], hintOrder: guardada.order });
  }
  for (const sobra of guardadas.slice(deseadas.length)) await s.borrarPista(sobra.id);
}

/** Borra la escena del servidor, con las respuestas de otras escenas que llegaban a ella (el servidor no deja huérfanas). */
export async function borrarEscena(s: SesionServidor, caso: CasoBorrador, escenaId: string): Promise<void> {
  const nodoId = s.nodoDe(escenaId);
  if (nodoId === undefined) return;
  const quitadas: string[] = [];
  for (const llegan of s.vista.decisions.filter((d) => d.targetNodeId === nodoId && d.sourceNodeId !== nodoId)) {
    const respuesta = s.respuestaDeDecision(llegan.id, caso.escenas.flatMap((e) => e.respuestas));
    await s.borrarDecision(llegan.id);
    if (respuesta) quitadas.push(respuesta);
  }
  try {
    await s.borrarNodo(nodoId);
  } catch (error) {
    // Ya no hay nada que llegue a la escena pero la escena sigue: se dice la verdad en vez de «lo dejamos como estaba».
    if (quitadas.length > 0 && !esConflicto(error)) throw new BorradoAMedias(quitadas);
    throw error;
  }
  s.mundos.delete(nodoId);
  if (caso.inicioId) await actualizarEscena(s, caso, caso.inicioId); // si era la de inicio, otra pasa a serlo
}

// ─── Guion ───────────────────────────────────────────────────────────────────

/** Las líneas de la escena como el diálogo de su mapa: lo crea la primera vez y después lo reemplaza. */
export async function sincronizarGuion(s: SesionServidor, caso: CasoBorrador, escenaId: string): Promise<void> {
  const escena = escenaDe(caso, escenaId);
  const nodoId = s.nodoDe(escenaId);
  if (!escena || nodoId === undefined) return;
  const nodo = s.vista.nodes.find((n) => n.id === nodoId);
  const mapa = s.mapaDeNodo(nodoId);
  if (!nodo || !mapa) return;
  const previo = arbolDeGuion(await s.mundoDe(nodoId));
  const cuerpo = cuerpoGuion(escena, caso.personajes, { nodeKey: nodo.key, previo });
  if (previo) {
    await s.actualizarDialogo(previo.id, cuerpo);
  } else if (escena.lineas.length > 0) {
    await s.crearDialogo(mapa.id, cuerpo);
    await s.releerMundo(nodoId); // para saber el id del diálogo que se creó
  }
  await ofrecerOpciones(s, caso, escenaId);
}

/** Las respuestas de la escena que ya son una opción en el servidor, como las elecciones del diálogo del guion. */
function eleccionesDeEscena(s: SesionServidor, escena: Escena): WorldDialogueChoice[] {
  const elecciones: WorldDialogueChoice[] = [];
  for (const respuesta of escena.respuestas) {
    const decisionId = s.decisionDe(respuesta.id);
    const decision = decisionId === undefined ? undefined : s.vista.decisions.find((d) => d.id === decisionId);
    if (!decision) continue;
    elecciones.push({
      key: decision.optionKey, text: respuesta.texto, decisionOptionId: decision.id, requiredToolCode: null, effect: {},
      displayOrder: elecciones.length + 1,
    });
  }
  return elecciones;
}

const mismasElecciones = (a: WorldDialogueChoice[], b: WorldDialogueChoice[]): boolean =>
  a.length === b.length && a.every((c, i) => c.key === b[i].key && c.text === b[i].text && c.decisionOptionId === b[i].decisionOptionId);

/**
 * La persona de la sala de la que cuelga el guion: la que ya lo tiene si sigue en la sala; si no, la que dice la primera
 * línea; si no, la primera persona de la sala. Sin ninguna persona, el guion queda suelto.
 */
function duenioDelGuion(s: SesionServidor, mundo: WorldDefinition, guion: WorldDialogueTree, escena: Escena): WorldObject | undefined {
  const personas = mundo.objects.filter((o) => o.type === 'PERSON');
  const actual = personas.find((o) => o.id === guion.mapObjectId);
  if (actual) return actual;
  const personaje = escena.lineas[0]?.personajeId;
  const delPersonaje = personaje === undefined
    ? undefined
    : personas.find((o) => s.vista.characters.find((c) => c.id === o.characterId)?.key === personaje);
  return delPersonaje ?? personas[0];
}

/**
 * Hace que el estudiante pueda elegir las respuestas de la escena: el guion es el diálogo de una persona de la sala y sus
 * elecciones son las respuestas (cada una es una opción del servidor). Sin esto, ninguna opción tiene por dónde elegirse
 * (la compuerta lo marca como error) y el estudiante vería la sala sin poder responder. Solo habla con el servidor si algo
 * cambió: el dueño del guion o las elecciones.
 */
export async function ofrecerOpciones(s: SesionServidor, caso: CasoBorrador, escenaId: string): Promise<void> {
  const escena = escenaDe(caso, escenaId);
  const nodoId = s.nodoDe(escenaId);
  const nodo = nodoId === undefined ? undefined : s.vista.nodes.find((n) => n.id === nodoId);
  if (!escena || nodoId === undefined || !nodo) return;
  const mundo = await s.mundoDe(nodoId);
  const guion = arbolDeGuion(mundo);
  if (!guion) return; // sin líneas todavía no hay diálogo que ofrezca nada
  const elecciones = eleccionesDeEscena(s, escena);
  const duenio = duenioDelGuion(s, mundo, guion, escena);
  if ((duenio?.id ?? null) === (guion.mapObjectId ?? null) && mismasElecciones(guion.choices ?? [], elecciones)) return;
  const cuerpo = cuerpoGuion(escena, caso.personajes, { nodeKey: nodo.key, previo: guion });
  const arbol: WorldDialogueTree = {
    id: guion.id, key: cuerpo.treeKey, speakerName: cuerpo.speakerName, portraitKey: cuerpo.portraitKey ?? null,
    emotion: cuerpo.emotion ?? 'neutral', mapObjectId: duenio?.id ?? null, ...(duenio ? { mapObjectKey: duenio.key } : {}),
    lines: (cuerpo.lines ?? []).map((l) => ({
      order: l.displayOrder, speakerName: l.speakerName ?? cuerpo.speakerName, text: l.text, emotion: l.emotion ?? 'neutral',
      aiSuggested: l.aiSuggested,
    })),
    choices: elecciones,
  };
  await s.guardarDialogos(nodoId, mundo.dialogues.map((t) => (t.id === guion.id ? arbol : t)));
}

// ─── Respuestas ──────────────────────────────────────────────────────────────

/**
 * Por qué una respuesta aún no se puede guardar, en lenguaje del docente; `null` si se puede. El servidor exige la
 * clase y a dónde lleva, y una contraindicada exige su razón: hasta entonces la respuesta queda en el borrador.
 */
export const FALTA_CLASE = 'Elige cómo es esta respuesta para guardarla.';

export function motivoSinGuardar(respuesta: Respuesta): string | null {
  if (!respuesta.clase) return FALTA_CLASE;
  if (respuesta.clase === 'CONTRAINDICATED' && !respuesta.razon.trim()) return 'Escribe por qué es contraindicada para guardarla.';
  if (respuesta.destinoId === null) return 'Elige a qué escena lleva para guardarla.';
  return null;
}

/** Pone al día la respuesta en el servidor: la crea cuando ya se puede, la actualiza, o la borra si desapareció o ya no lleva a ninguna escena. */
export async function sincronizarRespuesta(s: SesionServidor, caso: CasoBorrador, respuestaId: string): Promise<void> {
  // La escena de la que sale la opción, antes y después: una respuesta borrada ya no está en el borrador, pero su opción sí en el servidor.
  const decisionAntes = s.decisionDe(respuestaId);
  const nodoAntes = decisionAntes === undefined ? undefined : s.vista.decisions.find((d) => d.id === decisionAntes)?.sourceNodeId;
  await escribirRespuesta(s, caso, respuestaId);
  const escenas = new Set<string>();
  const enBorrador = caso.escenas.find((e) => e.respuestas.some((r) => r.id === respuestaId));
  if (enBorrador) escenas.add(enBorrador.id);
  const antes = nodoAntes === undefined ? undefined : s.escenaDeNodo(nodoAntes, caso.escenas);
  if (antes) escenas.add(antes);
  // Cada opción del servidor tiene que estar entre las elecciones del guion de su escena.
  for (const id of escenas) await ofrecerOpciones(s, caso, id);
}

async function escribirRespuesta(s: SesionServidor, caso: CasoBorrador, respuestaId: string): Promise<void> {
  const decisionId = s.decisionDe(respuestaId);
  let origen: Escena | undefined;
  let respuesta: Respuesta | undefined;
  for (const e of caso.escenas) {
    const r = e.respuestas.find((x) => x.id === respuestaId);
    if (r) {
      origen = e;
      respuesta = r;
    }
  }
  if (!origen || !respuesta) {
    if (decisionId !== undefined) await s.borrarDecision(decisionId);
    return;
  }
  const nodoOrigen = s.nodoDe(origen.id);
  if (nodoOrigen === undefined) return;
  // Sin destino no hay opción en el servidor: si la tenía, se borra (el borrador sigue guardando lo escrito).
  if (respuesta.destinoId === null) {
    if (decisionId !== undefined) await s.borrarDecision(decisionId);
    return;
  }
  if (motivoSinGuardar(respuesta) !== null) return; // espera a que el docente la complete
  const nodoDestino = s.nodoDe(respuesta.destinoId);
  if (nodoDestino === undefined) return; // la escena de destino aún no está en el servidor
  const previo = decisionId === undefined ? undefined : s.vista.decisions.find((d) => d.id === decisionId);
  const optionKey = numerada('opcion', new Set(s.vista.decisions.map((d) => d.optionKey)));
  const cuerpo = cuerpoDecision({ ...respuesta, destinoId: String(nodoDestino) }, nodoOrigen, { optionKey, previo });
  if (!cuerpo) return;
  if (previo && decisionId !== undefined) {
    await s.actualizarDecision(decisionId, cuerpo);
    return;
  }
  const vista = await s.crearDecision(cuerpo);
  const creada = vista.decisions.find((d) => d.optionKey === cuerpo.optionKey);
  if (creada) s.anotarDecision(respuestaId, creada.id);
}

// ─── Reglas del caso ─────────────────────────────────────────────────────────

const igual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// Si lo que se mandaría ya es lo que tiene el servidor (por ejemplo, el modo de finales cambia sin finales propios),
// no hay nada que decirle: tampoco sube la revisión.
export async function guardarHitos(s: SesionServidor, caso: CasoBorrador): Promise<void> {
  const hitos = hitosAApi(caso.hitos);
  if (!igual(s.vista.rules.milestones, hitos)) await s.guardarHitos(hitos);
}

export async function guardarRiesgo(s: SesionServidor, caso: CasoBorrador): Promise<void> {
  if (s.vista.rules.riskLevel !== caso.nivelRiesgo) await s.guardarRiesgo(caso.nivelRiesgo);
}

export async function guardarFinales(s: SesionServidor, caso: CasoBorrador): Promise<void> {
  const finales = finalesAApi(caso);
  if (!igual(s.vista.rules.endings, finales)) await s.guardarFinales(finales);
}

/**
 * Hitos y finales juntos, en el orden que el servidor admite: no deja quitar un hito que la condición de un final guardado
 * nombra (primero los finales), ni guardar un final que nombra un hito aún no declarado (primero los hitos). Solo los
 * finales de plantilla dependen de los hitos decisivos; los propios se guardan por su lado.
 */
export async function guardarHitosYFinales(s: SesionServidor, caso: CasoBorrador, quitaHitos: boolean): Promise<void> {
  const dependen = caso.modoFinales === 'automatico';
  if (quitaHitos && dependen) await guardarFinales(s, caso);
  await guardarHitos(s, caso);
  if (!quitaHitos && dependen) await guardarFinales(s, caso);
}

/**
 * La ficha del caso: contexto, objetivos, temas sensibles (RK-7) y nombre (RK-8). Solo viaja lo que cambió respecto de lo que
 * tiene el servidor; si nada cambió no le dice nada (tampoco sube la revisión). Un caso sin `temasSensibles` (servidor sin
 * RK-7) no los envía.
 */
export async function guardarFicha(s: SesionServidor, caso: CasoBorrador): Promise<void> {
  const contexto = caso.contexto ?? '';
  const objetivos = caso.objetivos ?? [];
  const cuerpo: BriefUpdateRequest = {};
  if (s.vista.context !== contexto || !igual(s.vista.learningObjectives ?? [], objetivos)) {
    cuerpo.context = contexto;
    cuerpo.learningObjectives = objetivos;
  }
  if (caso.temasSensibles && !igual(s.vista.contentWarnings ?? [], caso.temasSensibles)) cuerpo.contentWarnings = caso.temasSensibles;
  if (caso.titulo.trim() && caso.titulo !== s.vista.title) cuerpo.title = caso.titulo;
  if (Object.keys(cuerpo).length) await s.guardarFicha(cuerpo);
}

/** Pone al día la lista de verificación; si el servidor ya la tiene así, no le dice nada (tampoco sube la revisión). */
export async function guardarLista(s: SesionServidor, caso: CasoBorrador): Promise<void> {
  if (!caso.lista) return;
  const cuerpo = cuerpoLista(caso.lista) as unknown as Record<string, boolean>;
  const igualALoGuardado = s.vista.checklist.items.length > 0 && s.vista.checklist.items.every((i) => cuerpo[i.code] === i.fulfilled);
  if (!igualALoGuardado) await s.guardarLista(cuerpo as unknown as ChecklistUpdateRequest);
}
