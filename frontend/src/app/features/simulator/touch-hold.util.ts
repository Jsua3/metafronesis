import { PlayerDirection, PlayerMotionInput } from './player-motion.util';

/**
 * Tiempo que hay que mantener una flecha táctil para pasar del paso único
 * (nudge al tocar) a caminar de forma continua. Un toque normal dura menos.
 */
export const TOUCH_HOLD_DELAY_MS = 200;

/** Suma la flecha táctil mantenida a la entrada de teclado, sin mutarla. */
export function heldInput(
  input: PlayerMotionInput,
  held: PlayerDirection | null,
  heldForMs: number,
): PlayerMotionInput {
  if (!held || heldForMs < TOUCH_HOLD_DELAY_MS) return input;
  return { ...input, [held]: true };
}
