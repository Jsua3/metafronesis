/** Cada cuánto avanza el fundido de música (ms). */
export const FADE_TICK_MS = 33;
/** Fracción de la distancia al objetivo que se recorre en cada tick. */
export const FADE_SPEED = 0.02;
/** Por debajo de esta diferencia el volumen se fija en el objetivo y el fundido termina. */
export const FADE_EPSILON = 0.001;

/** Siguiente volumen de un fundido exponencial hacia `target`. */
export function fadeStep(current: number, target: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= FADE_EPSILON) return target;
  return current + diff * FADE_SPEED;
}
