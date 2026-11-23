import type { PlayerDirection } from './player-motion.util';

/** Cuánto sostiene su mirada quien mira hacia algo: sin esto, quien camina retoma su rumbo en el siguiente cuadro. */
export const GAZE_HOLD_MS = 2500;
/** Lo que dura la dirección intermedia de un giro de media vuelta (la cabeza gira antes que el cuerpo; nada de giros de un cuadro). */
export const GAZE_TURN_STEP_MS = 120;

const OPPOSITE: Readonly<Record<PlayerDirection, PlayerDirection>> = { left: 'right', right: 'left', up: 'down', down: 'up' };

/** La dirección de la que se mira hacia `dx, dy` (eje dominante; el horizontal gana los empates). */
export function directionTowards(dx: number, dy: number): PlayerDirection {
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}

/**
 * La dirección por la que pasa un giro de media vuelta (izquierda a derecha, arriba a abajo), o `null` si el giro es de un
 * cuarto o ninguno: el kit tiene cuatro filas y no se interpolan píxeles, así que el medio giro se resuelve con una fila más.
 * Para ir de izquierda a derecha pasa de frente; de arriba a abajo, por el lado hacia el que está el objetivo (`dx`).
 */
export function turnStepBetween(from: PlayerDirection, to: PlayerDirection, dx: number): PlayerDirection | null {
  if (OPPOSITE[from] !== to) return null;
  if (from === 'left' || from === 'right') return 'down';
  return dx < 0 ? 'left' : 'right';
}
