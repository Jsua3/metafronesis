import { SceneRect } from './scene-layer.types';

/**
 * Contrato único de movimiento del jugador (fase C).
 *
 * La posición (x, y) del contenedor del jugador significa SIEMPRE "punto de
 * pies / contacto con el piso", no el centro visual del cuerpo. La sombra se
 * centra en los pies, el sprite sube PLAYER_SPRITE_OFFSET_Y y la colisión usa
 * un hitbox de pies (playerHitbox) — el pelo/cabeza nunca chocan.
 */

export type PlayerDirection = 'down' | 'up' | 'left' | 'right';

/** Velocidad de caminata (px/s) — calibrada en prueba live. */
export const PLAYER_SPEED = 150;

/** Delta máximo por sub-paso de movimiento (ms): acota el salto entre chequeos de colisión. */
export const PLAYER_MAX_DELTA_MS = 34;

/** Delta máximo que un frame puede avanzar (ms): evita teletransportes al volver de tab inactiva. */
export const PLAYER_MAX_FRAME_DELTA_MS = 250;

/** (x, y) del contenedor = pies; sin corrección extra. */
export const PLAYER_FEET_OFFSET = { x: 0, y: 0 } as const;

/**
 * Hitbox de PIES, centrado horizontalmente en x y apoyado en y (offsetY sube
 * su centro): muebles y paredes bloquean pies; el torso/pelo pueden solapar
 * visualmente sin chocar.
 */
export const PLAYER_HITBOX = { width: 22, height: 16, offsetY: -8 } as const;

/**
 * Centro del sprite del avatar respecto al punto de pies. La hoja modular
 * (64×96, escala 0.85) lleva los pies del arte a y≈90 del frame: la distancia
 * pies→centro del frame (48) es 42 px ≈ 36 px ya escalados.
 */
export const PLAYER_SPRITE_OFFSET_Y = -36;

export interface PlayerMotionInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface PlayerMotionStep {
  /** Desplazamiento en px de este frame (diagonal ya normalizada). */
  dx: number;
  dy: number;
  moving: boolean;
  /** Dirección estable (en diagonal conserva la última si sigue activa). */
  direction: PlayerDirection;
}

/**
 * Dirección estable para animación: en diagonal conserva la última dirección
 * si su eje sigue activo (sin parpadeo); si no, manda el eje dominante.
 */
export function resolveDirection(dx: number, dy: number, last: PlayerDirection): PlayerDirection {
  if (dx === 0 && dy === 0) return last;
  const active: PlayerDirection[] = [];
  if (dx > 0) active.push('right');
  if (dx < 0) active.push('left');
  if (dy > 0) active.push('down');
  if (dy < 0) active.push('up');
  if (active.includes(last)) return last;
  return Math.abs(dx) >= Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');
}

/** Paso de movimiento puro: input → desplazamiento + dirección del frame. */
export function computePlayerStep(
  input: PlayerMotionInput,
  lastDirection: PlayerDirection,
  deltaMs: number,
  speed: number = PLAYER_SPEED,
): PlayerMotionStep {
  const ix = Number(input.right) - Number(input.left);
  const iy = Number(input.down) - Number(input.up);
  if (ix === 0 && iy === 0) {
    return { dx: 0, dy: 0, moving: false, direction: lastDirection };
  }
  const clamped = Math.min(Math.max(deltaMs, 0), PLAYER_MAX_DELTA_MS);
  const distance = speed * (clamped / 1000);
  const len = Math.hypot(ix, iy);
  return {
    dx: (ix / len) * distance,
    dy: (iy / len) * distance,
    moving: true,
    direction: resolveDirection(ix, iy, lastDirection),
  };
}

/**
 * Parte el delta de un frame en sub-pasos ≤ PLAYER_MAX_DELTA_MS (el llamador
 * aplica computePlayerStep + colisión a cada uno). Así la velocidad real es
 * PLAYER_SPEED a cualquier fps: con un solo paso recortado a 34 ms, un equipo
 * a 15 fps caminaba a la mitad de velocidad.
 */
export function splitFrameDelta(deltaMs: number): number[] {
  let remaining = Math.min(Math.max(deltaMs, 0), PLAYER_MAX_FRAME_DELTA_MS);
  const steps: number[] = [];
  while (remaining > 0) {
    const step = Math.min(remaining, PLAYER_MAX_DELTA_MS);
    steps.push(step);
    remaining -= step;
  }
  return steps;
}

/** Sub-pasos de un nudge táctil: 4 × clamp(34 ms) ≈ 20 px a PLAYER_SPEED. */
export const NUDGE_SUBSTEPS = 4;

/** Input sintético de una sola dirección (los botones táctiles no combinan ejes). */
export function nudgeInput(direction: PlayerDirection): PlayerMotionInput {
  return {
    left: direction === 'left',
    right: direction === 'right',
    up: direction === 'up',
    down: direction === 'down',
  };
}

/**
 * Paso de nudge táctil: un sub-paso del MISMO contrato que WASD
 * (computePlayerStep con el delta máximo por frame). El llamador lo aplica
 * NUDGE_SUBSTEPS veces con colisión por sub-paso — sin túneles ni saltos fijos.
 */
export function computeNudgeStep(
  direction: PlayerDirection,
  lastDirection: PlayerDirection,
): PlayerMotionStep {
  return computePlayerStep(nudgeInput(direction), lastDirection, PLAYER_MAX_DELTA_MS);
}

/** Hitbox de pies para un punto de pies (x, y). */
export function playerHitbox(x: number, y: number): SceneRect {
  const cx = x + PLAYER_FEET_OFFSET.x;
  const cy = y + PLAYER_FEET_OFFSET.y + PLAYER_HITBOX.offsetY;
  return {
    x: cx - PLAYER_HITBOX.width / 2,
    y: cy - PLAYER_HITBOX.height / 2,
    width: PLAYER_HITBOX.width,
    height: PLAYER_HITBOX.height,
  };
}

/** Intersección AABB pura (sin Phaser — usable en specs jsdom). */
export function rectsIntersect(a: SceneRect, b: SceneRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}
