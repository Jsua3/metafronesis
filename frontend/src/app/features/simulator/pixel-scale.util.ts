/**
 * Escala entera (spec §8.3): el lienzo trabaja en píxeles físicos y la cámara usa
 * un zoom entero, así cada píxel de un sprite mide un número entero de píxeles
 * físicos. Lógica pura; el pegamento con Phaser vive en pixel-canvas.ts.
 */

/** Fracción mínima de la sala que debe verse con el zoom elegido. */
export const MIN_ROOM_FRACTION = 0.75;

export interface PhysicalSize {
  width: number;
  height: number;
  dpr: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tamaño CSS × devicePixelRatio, redondeado y nunca menor que 1 px. */
export function physicalSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): PhysicalSize {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const px = (css: number) => Math.max(1, Math.round((Number.isFinite(css) ? Math.max(0, css) : 0) * dpr));
  return { width: px(cssWidth), height: px(cssHeight), dpr };
}

/** k = mayor entero ≥ 1 con anchoFísico/k ≥ 0,75·anchoSala y altoFísico/k ≥ 0,75·altoSala. */
export function integerZoom(physicalWidth: number, physicalHeight: number, roomWidth: number, roomHeight: number): number {
  if (!(roomWidth > 0) || !(roomHeight > 0)) return 1;
  const k = Math.min(
    Math.floor(physicalWidth / (MIN_ROOM_FRACTION * roomWidth)),
    Math.floor(physicalHeight / (MIN_ROOM_FRACTION * roomHeight)),
  );
  return Math.max(1, k);
}

/**
 * Límites de cámara: los de la sala; en el eje en que la vista es mayor, se ensanchan
 * y se centran (Phaser alinea a la izquierda una sala más chica que la vista).
 */
export function cameraBounds(roomWidth: number, roomHeight: number, viewWidth: number, viewHeight: number): Bounds {
  const width = Math.max(roomWidth, viewWidth);
  const height = Math.max(roomHeight, viewHeight);
  return { x: Math.floor((roomWidth - width) / 2), y: Math.floor((roomHeight - height) / 2), width, height };
}
