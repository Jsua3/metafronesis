import type { ViewId } from '../character/kit/kit-engine';
import { MS_POR_PASO_DE_MIRADA, Mirada, actualizarMirada, miradaInicial, orientacionDeDato } from './direccion-ocho';
import { PLAYER_HITBOX, PLAYER_MAX_FRAME_DELTA_MS, playerHitbox, rectsIntersect, splitFrameDelta } from './player-motion.util';
import { stepToward } from './scene-motion.util';
import { WALK_STUCK_MS, WalkPoint } from './world-walk.util';

/**
 * Personajes que caminan (P6, tarea 4). `metadata.movimiento` de una persona del caso es «quieto» (por defecto),
 * «deambula» (por la zona caminable, con pausas de 1 a 3 s) o «va-y-viene» (entre su posición y un punto, alternando).
 *
 * Es la conducta del PERSONAJE, aparte de `world-walk.util` (la caminata del JUGADOR con el ratón, que produce
 * «teclas»): aquí no hay teclas, hay un estado que avanza con el tiempo. Pura y sin Phaser: el mundo (si unos pies en
 * (x, y) chocan, los límites de la sala y un generador aleatorio) llega inyectado, así las pruebas fijan una semilla.
 * La colisión es la MISMA del jugador: la escena inyecta `wouldCollide` (muebles, paredes y la regla del servidor) y
 * el cuerpo del jugador cuenta como un obstáculo móvil (`bodyBlocks`, con el hitbox de pies de `player-motion.util`).
 * Las coordenadas son las del marcador de la persona (las de su `MapObjectState`); la escena suma el desplazamiento a
 * los pies al preguntar por la colisión.
 */

export type PersonMovement =
  | { readonly tipo: 'quieto' }
  | { readonly tipo: 'deambula' }
  | { readonly tipo: 'va-y-viene'; readonly hasta: WalkPoint }
  | { readonly tipo: 'ruta'; readonly puntos: readonly WalkPoint[]; readonly modo: 'circuito' | 'ida-y-vuelta'; readonly pausaMs?: number };

const QUIETO: PersonMovement = { tipo: 'quieto' };

/** Velocidad al caminar (px/s): sobria, de consulta, más lenta que el jugador (150). */
export const PERSON_WALK_SPEED_PX_S = 40;
/** Pausa entre un destino y el siguiente. */
export const PERSON_PAUSE_MIN_MS = 1000;
export const PERSON_PAUSE_MAX_MS = 3000;
/** Cuánto se aleja como máximo de donde la puso el docente al deambular, y lo mínimo que vale la pena caminar. */
/*
 * El servidor solo conoce la posición guardada de la persona: amplía su área de cercanía por este mismo radio
 * (`PERSON_WANDER_RADIUS_PX` en `backend_django/apps/simulation/services/world_service.py`). Si cambia aquí, cambia allá:
 * `test_person_movement_range.py` lo comprueba leyendo este archivo.
 */
export const PERSON_WANDER_RADIUS_PX = 160;
export const PERSON_WANDER_MIN_LEG_PX = 24;
/** Destinos que prueba antes de rendirse hasta la siguiente pausa (una sala llena de muebles no la atrapa). */
export const PERSON_TARGET_TRIES = 14;
/** Distancia a la que se da un destino por alcanzado. */
export const PERSON_ARRIVE_PX = 2;
/** Avanzar menos de esta fracción de lo pedido (rozando un muro) cuenta como atasco. */
const PERSON_MIN_PROGRESS_RATIO = 0.4;
/** Cada cuántos px se comprueba que el camino recto hasta un destino esté libre. */
const PATH_SAMPLE_PX = 8;
/**
 * Trayecto: reintentos del mismo destino ante un estorbo antes de volver al punto anterior. Sus tramos rectos los
 * comprueba OCL-19 contra muebles y paredes, así que lo que la detiene es algo que se mueve (el estudiante): espera y
 * reintenta; si sigue ahí, vuelve por el mismo tramo. Nunca se desvía por un camino que nadie comprobó.
 */
export const PERSON_ROUTE_RETRIES = 2;

/** Límites de la zona caminable (coordenadas del marcador). */
export interface WalkBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface PersonWalkEnv {
  /** Los pies en (x, y) chocarían (mueble, pared, jugador…) viniendo de `from`. */
  blocked(x: number, y: number, from: WalkPoint): boolean;
  readonly bounds: WalkBounds;
  /** Aleatorio en [0, 1): inyectado para fijar la semilla en las pruebas. */
  rand(): number;
}

export interface PersonWalkState {
  readonly movement: PersonMovement;
  /** Donde la puso el docente: el centro de su deambular y la «ida» de un va-y-viene. */
  readonly origin: WalkPoint;
  readonly x: number;
  readonly y: number;
  readonly target: WalkPoint | null;
  /** Tiempo que le queda de pausa. */
  readonly pauseMs: number;
  /** Tiempo acumulado sin avanzar hacia el destino. */
  readonly stuckMs: number;
  /** va-y-viene: el siguiente tramo va al punto lejano (true) o de vuelta a la ida (false). */
  readonly toFar: boolean;
  /** Trayecto: parada a la que va (0 = la partida, 1… = los puntos), sentido de una ida y vuelta y reintentos hechos. */
  readonly routeIndex: number;
  readonly routeDirection: 1 | -1;
  readonly routeRetries: number;
  /** La vista que se dibuja (8 direcciones): `mirada.actual`. */
  readonly direction: ViewId;
  /** Hacia dónde mira, con el margen que evita el parpadeo y el giro por las vistas de en medio (`direccion-ocho.ts`). */
  readonly mirada: Mirada;
  readonly walking: boolean;
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Lee `metadata.movimiento`. Ausente, desconocido o mal formado es «quieto»; nunca lanza. */
export function parsePersonMovement(raw: unknown): PersonMovement {
  if (raw === 'deambula') return { tipo: 'deambula' };
  if (raw === 'quieto' || raw === null || typeof raw !== 'object' || Array.isArray(raw)) return QUIETO;
  const record = raw as Record<string, unknown>;
  if (record['tipo'] === 'deambula') return { tipo: 'deambula' };
  if (record['tipo'] === 'ruta') {
    const puntos = record['puntos'];
    const modo = record['modo'];
    const pausa = record['pausaMs'];
    if (!Array.isArray(puntos) || puntos.length < 2 || puntos.length > 8 ||
        (modo !== 'circuito' && modo !== 'ida-y-vuelta') ||
        (pausa !== undefined && (!isCoordinate(pausa) || pausa < 0 || pausa > 10000))) return QUIETO;
    const copia: WalkPoint[] = [];
    for (const punto of puntos) {
      if (!punto || typeof punto !== 'object' || Array.isArray(punto) || !isCoordinate(punto.x) || !isCoordinate(punto.y) || Math.abs(punto.x) > 1000000 || Math.abs(punto.y) > 1000000) return QUIETO;
      copia.push({ x: punto.x, y: punto.y });
    }
    return pausa === undefined ? { tipo: 'ruta', puntos: copia, modo } : { tipo: 'ruta', puntos: copia, modo, pausaMs: pausa };
  }
  if (record['tipo'] === 'va-y-viene') {
    const hasta = record['hasta'];
    if (hasta && typeof hasta === 'object') {
      const { x, y } = hasta as Record<string, unknown>;
      if (isCoordinate(x) && isCoordinate(y)) return { tipo: 'va-y-viene', hasta: { x, y } };
    }
  }
  return QUIETO;
}

/** Mirada inicial: la del dato si es una de las 8 vistas del kit; si no, de frente. */
export function personFacing(raw: unknown): ViewId {
  return orientacionDeDato(raw);
}

/** Zona caminable del encuadre de la sala, en px de sala (la de `autoria/modelo/geometria.ts`). */
export interface WalkZone {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

/**
 * Límites por donde puede caminar una persona, en coordenadas de su marcador: toda la sala con margen o, si la sala dice su
 * encuadre (`zone`), solo la zona caminable que el fondo pintado deja al suelo (el resto es pared). Es la misma regla que hace
 * valer el servidor con las paredes de la copia: el hitbox de pies (22 × 16, igual que el del jugador) entero dentro de la zona.
 * `feetOffsetY` es lo que los pies de la persona quedan bajo su marcador (0 si el marcador ya es el punto de apoyo, 16 en los
 * casos de antes); la zona es de PIES, así que se corre lo mismo. La colisión fina (muebles) la pone el mundo inyectado.
 */
export function personWalkBounds(
  mapWidth: number, mapHeight: number, margin = 24, zone: WalkZone | null = null, feetOffsetY = 0,
): WalkBounds {
  const room = { minX: margin, minY: margin, maxX: mapWidth - margin, maxY: mapHeight - margin };
  if (!zone) return room;
  const halfWidth = PLAYER_HITBOX.width / 2;
  return {
    minX: Math.max(room.minX, zone.x + halfWidth),
    minY: Math.max(room.minY, zone.y + PLAYER_HITBOX.height - feetOffsetY),
    maxX: Math.min(room.maxX, zone.x + zone.ancho - halfWidth),
    maxY: Math.min(room.maxY, zone.y + zone.alto - feetOffsetY),
  };
}

/** Estado inicial: parada en su sitio, con una pausa de salida (para que varias personas no echen a andar a la vez). */
export function startPersonWalk(
  movement: PersonMovement,
  origin: WalkPoint,
  direction: ViewId = 'down',
  initialPauseMs = 0,
): PersonWalkState {
  return {
    movement, origin: { x: origin.x, y: origin.y }, x: origin.x, y: origin.y,
    target: null, pauseMs: initialPauseMs, stuckMs: 0, toFar: true, routeIndex: 1, routeDirection: 1, routeRetries: 0, direction, mirada: miradaInicial(direction), walking: false,
  };
}

/**
 * ¿Pisaría el cuerpo de la persona en `next` al jugador (su hitbox de pies)? El jugador puede echársele encima —no
 * hay choque entre ellos para él—, así que solo cuenta si el paso la ACERCA: alejarse de quien la tiene encima siempre
 * se puede, y nunca queda atrapada dentro del jugador.
 */
export function bodyBlocks(next: WalkPoint, current: WalkPoint, other: WalkPoint | null): boolean {
  if (!other) return false;
  if (!rectsIntersect(playerHitbox(next.x, next.y), playerHitbox(other.x, other.y))) return false;
  return Math.hypot(next.x - other.x, next.y - other.y) < Math.hypot(current.x - other.x, current.y - other.y);
}

/**
 * Lo que una persona recuerda de su caminata cuando la escena reconstruye la sala sin cambiar de sala (cada `world.set` del
 * juego: abrir una interacción, usar una herramienta…). Devuelve el estado guardado si sigue valiendo —mismo movimiento y mismo
 * origen—, o `null` si no había nada o el docente lo cambió (entonces empieza de nuevo con el dato nuevo).
 */
export function resumePersonWalk(
  saved: PersonWalkState | undefined, movement: PersonMovement, origin: WalkPoint,
): PersonWalkState | null {
  if (!saved || saved.origin.x !== origin.x || saved.origin.y !== origin.y) return null;
  const before = saved.movement;
  if (before.tipo !== movement.tipo) return null;
  if (before.tipo === 'va-y-viene' && movement.tipo === 'va-y-viene' && (before.hasta.x !== movement.hasta.x || before.hasta.y !== movement.hasta.y)) return null;
  if (before.tipo === 'ruta' && movement.tipo === 'ruta' &&
      (before.modo !== movement.modo || before.pausaMs !== movement.pausaMs || before.puntos.length !== movement.puntos.length ||
       before.puntos.some((p, i) => p.x !== movement.puntos[i].x || p.y !== movement.puntos[i].y))) return null;
  return saved;
}

/** Pausa de 1 a 3 s (también la de salida: varias personas no echan a andar a la vez). */
export function randomPersonPause(rand: () => number): number {
  return PERSON_PAUSE_MIN_MS + rand() * (PERSON_PAUSE_MAX_MS - PERSON_PAUSE_MIN_MS);
}

function outside(bounds: WalkBounds, x: number, y: number): boolean {
  return x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY;
}

/** Bloqueado por la sala (fuera de los límites) o por el mundo. Los límites mandan aunque el mundo no los conozca. */
function isBlocked(env: PersonWalkEnv, x: number, y: number, from: WalkPoint): boolean {
  return outside(env.bounds, x, y) || env.blocked(x, y, from);
}

/** El camino recto de `from` a `to` está libre (muestreado cada pocos px; el punto de partida no cuenta). */
function pathClear(env: PersonWalkEnv, from: WalkPoint, to: WalkPoint): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / PATH_SAMPLE_PX));
  let previous = from;
  for (let i = 1; i <= steps; i++) {
    const point = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    if (isBlocked(env, point.x, point.y, previous)) return false;
    previous = point;
  }
  return true;
}

/** Siguiente destino, o null si no hay uno libre (entonces espera otra pausa y vuelve a intentarlo). */
function pickTarget(state: PersonWalkState, env: PersonWalkEnv): WalkPoint | null {
  const movement = state.movement;
  if (movement.tipo === 'va-y-viene') return state.toFar ? movement.hasta : state.origin;
  if (movement.tipo === 'ruta') return state.routeIndex === 0 ? state.origin : movement.puntos[state.routeIndex - 1];
  if (movement.tipo !== 'deambula') return null;
  const here = { x: state.x, y: state.y };
  for (let i = 0; i < PERSON_TARGET_TRIES; i++) {
    const angle = env.rand() * Math.PI * 2;
    const reach = PERSON_WANDER_MIN_LEG_PX + env.rand() * (PERSON_WANDER_RADIUS_PX - PERSON_WANDER_MIN_LEG_PX);
    const candidate = {
      x: Math.min(Math.max(state.origin.x + Math.cos(angle) * reach, env.bounds.minX), env.bounds.maxX),
      y: Math.min(Math.max(state.origin.y + Math.sin(angle) * reach, env.bounds.minY), env.bounds.maxY),
    };
    if (Math.hypot(candidate.x - here.x, candidate.y - here.y) < PERSON_WANDER_MIN_LEG_PX) continue;
    if (!isBlocked(env, candidate.x, candidate.y, here) && pathClear(env, here, candidate)) return candidate;
  }
  return null;
}

/** La partida ocupa el índice cero; los puntos declarados empiezan en uno. */
function nextRoute(state: PersonWalkState): PersonWalkState {
  if (state.movement.tipo !== 'ruta') return state;
  const last = state.movement.puntos.length;
  if (state.movement.modo === 'circuito') {
    return { ...state, routeIndex: (state.routeIndex + 1) % (last + 1), routeRetries: 0 };
  }
  const direction = state.routeIndex === last ? -1 : state.routeIndex === 0 ? 1 : state.routeDirection;
  return { ...state, routeIndex: state.routeIndex + direction, routeDirection: direction, routeRetries: 0 };
}

/** Vuelve a la parada anterior por el mismo tramo (un circuito retoma después hacia la que no alcanzó). */
function previousRoute(state: PersonWalkState): PersonWalkState {
  if (state.movement.tipo !== 'ruta') return state;
  if (state.movement.modo === 'circuito') {
    const stops = state.movement.puntos.length + 1;
    return { ...state, routeIndex: (state.routeIndex - 1 + stops) % stops, routeRetries: 0 };
  }
  const direction: 1 | -1 = state.routeDirection === 1 ? -1 : 1;
  return { ...state, routeIndex: state.routeIndex + direction, routeDirection: direction, routeRetries: 0 };
}

function routePause(state: PersonWalkState, rand: () => number): number {
  return state.movement.tipo === 'ruta' ? state.movement.pausaMs ?? randomPersonPause(rand) : randomPersonPause(rand);
}

/** Un sub-paso (≤ 34 ms): pausa, elegir destino, o un paso con colisión y deslizamiento. */
function stepOnce(state: PersonWalkState, deltaMs: number, env: PersonWalkEnv): PersonWalkState {
  if (state.pauseMs > 0) {
    return { ...state, pauseMs: Math.max(0, state.pauseMs - deltaMs), walking: false };
  }
  let current = state;
  if (!current.target) {
    const target = pickTarget(current, env);
    if (!target) return { ...current, pauseMs: randomPersonPause(env.rand), walking: false };
    current = { ...current, target, stuckMs: 0 };
  }
  const target = current.target as WalkPoint;
  const here = { x: current.x, y: current.y };
  const next = stepToward(here, target, (PERSON_WALK_SPEED_PX_S * deltaMs) / 1000);

  // Igual que el jugador: el paso completo, y si choca, deslizando por un solo eje. En un trayecto no se desliza: se
  // queda sobre su tramo recto, el que comprobó OCL-19.
  const route = current.movement.tipo === 'ruta';
  let moved: WalkPoint | null = null;
  if (!isBlocked(env, next.x, next.y, here)) moved = next;
  else if (!route && next.x !== here.x && !isBlocked(env, next.x, here.y, here)) moved = { x: next.x, y: here.y };
  else if (!route && next.y !== here.y && !isBlocked(env, here.x, next.y, here)) moved = { x: here.x, y: next.y };

  // Sin avance real no hay camino: contra un muro el deslizamiento se va apagando (un destino pegado al muro nunca se
  // alcanza), así que también cuenta como atasco avanzar mucho menos de lo pedido.
  const wanted = Math.hypot(next.x - here.x, next.y - here.y);
  const made = moved ? Math.hypot(moved.x - here.x, moved.y - here.y) : 0;
  const stuckMs = made >= wanted * PERSON_MIN_PROGRESS_RATIO ? 0 : current.stuckMs + deltaMs;
  if (stuckMs >= WALK_STUCK_MS) {
    // Atascada (mueble, jugador): suelta el destino, espera y elige otro; un va-y-viene da la vuelta.
    const stopped = { ...current, target: null, stuckMs: 0, pauseMs: randomPersonPause(env.rand), walking: false,
      toFar: current.movement.tipo === 'va-y-viene' ? !current.toFar : current.toFar };
    if (!route) return stopped;
    return current.routeRetries < PERSON_ROUTE_RETRIES ? { ...stopped, routeRetries: current.routeRetries + 1 } : previousRoute(stopped);
  }
  if (!moved) return { ...current, stuckMs, walking: false };

  // La mirada la decide `tickPersonWalk` con el avance real de cada sub-paso (8 direcciones, sin parpadeo).
  const direction = current.direction;
  // Un trayecto llega exacto (`stepToward` termina en el destino): así cada tramo empieza donde lo comprobó OCL-19.
  if (Math.hypot(target.x - moved.x, target.y - moved.y) <= (route ? 0 : PERSON_ARRIVE_PX)) {
    // Llegó: se coloca exactamente en el destino (si está libre), espera y (va-y-viene) emprende el tramo de vuelta.
    const exact = !route && !isBlocked(env, target.x, target.y, moved) ? target : moved;
    const arrived = { ...current, x: exact.x, y: exact.y, target: null, stuckMs: 0, direction, walking: false,
      pauseMs: routePause(current, env.rand),
      toFar: current.movement.tipo === 'va-y-viene' ? !current.toFar : current.toFar };
    return route ? nextRoute(arrived) : arrived;
  }
  return { ...current, x: moved.x, y: moved.y, stuckMs, direction, walking: true };
}

/**
 * Hace pasar `deltaMs` (un cuadro). Parte el tiempo en sub-pasos con colisión —misma velocidad real a cualquier fps— y
 * acota el cuadro como el jugador, para que volver de otra pestaña no la teletransporte.
 */
export function tickPersonWalk(state: PersonWalkState, deltaMs: number, env: PersonWalkEnv): PersonWalkState {
  if (state.movement.tipo === 'quieto') return state;
  let current = state;
  for (const part of splitFrameDelta(Math.min(deltaMs, PLAYER_MAX_FRAME_DELTA_MS))) {
    const before = current;
    current = stepOnce(current, part, env);
    // Mira hacia donde avanzó de verdad (también deslizando por una pared); en pausa, un giro empezado termina.
    const mirada = actualizarMirada(before.mirada ?? miradaInicial(before.direction), current.x - before.x, current.y - before.y, part, { msPorPaso: MS_POR_PASO_DE_MIRADA });
    current = { ...current, mirada, direction: mirada.actual };
  }
  return current;
}
