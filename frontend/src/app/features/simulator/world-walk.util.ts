import { PlayerMotionInput } from './player-motion.util';

/**
 * Caminar hasta un punto con el ratón (plan visual F6-7, VD-5). Pura: de la posición, el destino y el tiempo sale el
 * mismo «input de teclas» que daría el teclado; la escena lo aplica con el MISMO movimiento por sub-pasos con
 * colisión y deslizamiento (`computePlayerStep` + `movePlayer`), así un muro se rodea igual que a pie con WASD y la
 * posición que el servidor rechazaría tampoco se camina. No sabe nada de Phaser ni de datos clínicos.
 */

export interface WalkPoint {
  x: number;
  y: number;
}

export interface WalkTarget extends WalkPoint {
  /** Radio de llegada: la caminata se detiene al entrar (el de interacción de una persona; unos píxeles en el suelo). */
  radius: number;
}

/** Tolerancia por eje antes de pedir un paso: sin temblor a un píxel del destino. */
export const WALK_AXIS_DEADZONE_PX = 3;
/** Sin avance real durante este tiempo la caminata se abandona (muro, mueble, rechazo del servidor). */
export const WALK_STUCK_MS = 450;
/** Menos que esto entre dos cuadros no cuenta como avance. */
export const WALK_PROGRESS_EPSILON_PX = 0.25;
/** Radio de llegada de un clic en el suelo: el punto clicado, con unos píxeles de tolerancia. */
export const WALK_GROUND_RADIUS_PX = 6;
/** Cuánto antes del límite de interacción se detiene la caminata hacia una persona u objeto señalado. */
export const WALK_REACH_MARGIN_PX = 14;

/** Radio de llegada hacia algo señalado: dentro de su alcance de interacción, con margen (nunca menos de 8 px). */
export function reachRadius(interactRadius: number): number {
  return Math.max(8, interactRadius - WALK_REACH_MARGIN_PX);
}

export interface WalkState {
  readonly target: WalkTarget | null;
  /** Dónde estaba el jugador en el cuadro anterior: mide el avance (null en el primer cuadro). */
  readonly last: WalkPoint | null;
  /** Tiempo acumulado sin avanzar. */
  readonly stuckMs: number;
}

export const NO_WALK: WalkState = { target: null, last: null, stuckMs: 0 };

export function startWalk(target: WalkTarget): WalkState {
  return { target, last: null, stuckMs: 0 };
}

export interface WalkTick {
  readonly state: WalkState;
  /** Las «teclas» que la caminata pulsa en este cuadro (las cuatro en falso si ya no camina). */
  readonly input: PlayerMotionInput;
  readonly arrived: boolean;
  readonly gaveUp: boolean;
}

const IDLE: PlayerMotionInput = { left: false, right: false, up: false, down: false };

/** Un cuadro de caminata: qué pedir y en qué queda la caminata. `deltaMs` mide el tiempo atascado. */
export function tickWalk(state: WalkState, position: WalkPoint, deltaMs: number): WalkTick {
  const target = state.target;
  if (!target) return { state: NO_WALK, input: IDLE, arrived: false, gaveUp: false };

  const dx = target.x - position.x;
  const dy = target.y - position.y;
  if (Math.hypot(dx, dy) <= target.radius) return { state: NO_WALK, input: IDLE, arrived: true, gaveUp: false };

  let stuckMs = state.stuckMs;
  if (state.last) {
    const moved = Math.hypot(position.x - state.last.x, position.y - state.last.y);
    stuckMs = moved > WALK_PROGRESS_EPSILON_PX ? 0 : stuckMs + Math.max(0, deltaMs);
  }
  if (stuckMs >= WALK_STUCK_MS) return { state: NO_WALK, input: IDLE, arrived: false, gaveUp: true };

  return {
    state: { target, last: { x: position.x, y: position.y }, stuckMs },
    input: {
      left: dx < -WALK_AXIS_DEADZONE_PX,
      right: dx > WALK_AXIS_DEADZONE_PX,
      up: dy < -WALK_AXIS_DEADZONE_PX,
      down: dy > WALK_AXIS_DEADZONE_PX,
    },
    arrived: false,
    gaveUp: false,
  };
}

/** Cualquier tecla de movimiento pulsada cancela la caminata: el teclado manda sobre el destino del ratón. */
export function cancelWalkOnKeys(state: WalkState, held: PlayerMotionInput): WalkState {
  return held.left || held.right || held.up || held.down ? NO_WALK : state;
}
