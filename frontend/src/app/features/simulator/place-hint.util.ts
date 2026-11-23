/**
 * «Dónde está» en palabras, calculado desde las coordenadas VIVAS del objeto o
 * del NPC (nunca escrito a mano: así no envejece si alguien mueve un mueble).
 * Mapa de 960x540. Estable: no depende de dónde esté el jugador.
 */
const HORIZONTAL_BANDS: ReadonlyArray<{ below: number; text: string }> = [
  { below: 200, text: 'en el extremo izquierdo' },
  { below: 400, text: 'a la izquierda' },
  { below: 600, text: 'en el centro' },
  { below: 760, text: 'a la derecha' },
  { below: Number.POSITIVE_INFINITY, text: 'en el extremo derecho' },
];

/** Línea que separa «al fondo» (arriba) de «al frente» (abajo). */
const FRONT_FROM_Y = 360;

export function placeHint(x: number, y: number, opts?: { door?: boolean }): string {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 'en la sala';
  const horizontal = HORIZONTAL_BANDS.find(band => x < band.below)!.text;
  if (opts?.door) return `puerta ${horizontal}`;
  return `${horizontal}, ${y < FRONT_FROM_Y ? 'al fondo' : 'al frente'}`;
}
