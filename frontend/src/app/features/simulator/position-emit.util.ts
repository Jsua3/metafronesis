/**
 * Cada aviso de posición entra a la zona de Angular y dispara la detección de
 * cambios de toda la app. Su único consumidor guarda con debounce de 550 ms y
 * compara distancias de 72 px: 8 avisos por segundo sobran (≈ 19 px a 150 px/s).
 */
export const POSITION_EMIT_INTERVAL_MS = 125;

export interface EmittedPosition {
  x: number;
  y: number;
  /** Reloj de la escena (ms) en que se emitió. */
  at: number;
}

/** Decide si una posición nueva, en píxeles enteros, merece avisar a Angular. */
export function shouldEmitPosition(
  last: EmittedPosition | null,
  x: number,
  y: number,
  now: number,
): boolean {
  if (!last) return true;
  if (last.x === x && last.y === y) return false;
  return now - last.at >= POSITION_EMIT_INTERVAL_MS;
}
