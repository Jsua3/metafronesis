/**
 * Dónde va el rótulo con el nombre de una persona o un objeto del mundo (bloque P2, captura del juego real). Pura: sin Phaser.
 *
 * El rótulo va bajo los pies, como siempre (`object-anchor.util`). En una sala con gente, ahí cae a veces la cabeza de quien
 * está justo debajo, o el rótulo de otro: entonces sube sobre la cabeza propia, separado de ella. Si pisa arriba y abajo, se
 * queda donde pisa menos. El rótulo se dibuja con origen (0.5, 0): `y` es su borde de arriba, centrado en `x`.
 */

/** Separación entre el contacto con el suelo y el rótulo de debajo (la de `object-anchor.util`). */
export const SEPARACION_BAJO_LOS_PIES_PX = 12;
/** Aire entre la coronilla y el rótulo cuando sube. */
export const SEPARACION_SOBRE_LA_CABEZA_PX = 6;
/** Alto de una persona del kit de los pies a la coronilla, en píxeles del mundo (medido en el juego real: 62 px con el pelo). */
export const ALTO_DE_PERSONA_PX = 64;
/** Medio ancho del cuerpo de una persona (los hombros), en píxeles del mundo. */
const MEDIO_ANCHO_DE_PERSONA_PX = 14;

/** Rectángulo en coordenadas del mundo: [x0, x1) × [y0, y1). */
export interface Caja { x0: number; y0: number; x1: number; y1: number }

/** El cuerpo de una persona que pisa en (x, pies). */
export function cajaDelCuerpo(x: number, pies: number): Caja {
  return { x0: x - MEDIO_ANCHO_DE_PERSONA_PX, y0: pies - ALTO_DE_PERSONA_PX, x1: x + MEDIO_ANCHO_DE_PERSONA_PX, y1: pies };
}

/** La caja de un rótulo de `ancho` × `alto` con su borde de arriba en `y`, centrado en `x`. */
export function cajaDelRotulo(x: number, y: number, ancho: number, alto: number): Caja {
  return { x0: x - ancho / 2, y0: y, x1: x + ancho / 2, y1: y + alto };
}

function pisado(caja: Caja, ocupadas: readonly Caja[]): number {
  let area = 0;
  for (const o of ocupadas) {
    const w = Math.min(caja.x1, o.x1) - Math.max(caja.x0, o.x0);
    const h = Math.min(caja.y1, o.y1) - Math.max(caja.y0, o.y0);
    if (w > 0 && h > 0) area += w * h;
  }
  return area;
}

/**
 * El borde de arriba del rótulo de quien pisa en (x, pies), con `altoDelCuerpo` hasta la coronilla (0 si no es una persona).
 * `ocupadas`: los cuerpos de las demás personas y los rótulos ya puestos (no el propio).
 */
export function yDelRotulo(
  x: number, pies: number, ancho: number, alto: number, altoDelCuerpo: number, ocupadas: readonly Caja[],
): number {
  const abajo = pies + SEPARACION_BAJO_LOS_PIES_PX;
  const pisaAbajo = pisado(cajaDelRotulo(x, abajo, ancho, alto), ocupadas);
  if (pisaAbajo === 0) return abajo;
  const arriba = pies - altoDelCuerpo - SEPARACION_SOBRE_LA_CABEZA_PX - alto;
  return pisado(cajaDelRotulo(x, arriba, ancho, alto), ocupadas) < pisaAbajo ? arriba : abajo;
}
