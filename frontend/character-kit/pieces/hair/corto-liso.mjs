/**
 * Peinado: corto liso con raya a la izquierda (de la pantalla, de frente).
 * Volumen arriba, flequillo corto que barre a la derecha sin tapar las cejas,
 * patillas delante de la oreja y nuca limpia. De perfil deja ver la oreja.
 * Abulta 1 px a los lados y 2 px atrás: con eso la cabeza mide 18-21 px
 * (biblia §1), porque el cráneo pelado del maniquí mide 17 con contorno.
 *
 * Simétrico a efectos del kit: a 48×72 la raya no cambia el perfil, así que la
 * vista derecha sale del espejo de la izquierda (con la luz recalculada).
 *
 * Leyenda: R pelo (la luz decide) · r mechón (tono profundo) · h brillo fijo.
 */

import { gridFrom, stamp } from '../../raster.mjs';
import { headHalfWidth } from '../../busts/bust-a.mjs';
import { DIAGONAL } from './corto-liso.diagonal.mjs';
import { hairVolume } from './portrait-volume.mjs';

const LEGEND = {
  R: { mat: 'hair' },
  r: { mat: 'hair', tone: 3 },
  h: { mat: 'hair', tone: 0 },
};

// ── Retrato 32×32 ─────────────────────────────────────────────────────────────

const CX = 15.5;
/** Nacimiento del pelo por columna: alto a la izquierda, el flequillo baja a la derecha. */
const hairline = x => (x <= 12 ? 8 : Math.min(10, 8 + Math.round((x - 12) / 4)));
const portraitBase = gridFrom(32, 32, (x, y) => {
  if (y < 3 || y > 14) return '.';
  // 1 px de volumen alrededor de la coronilla.
  const half = y === 3 ? 2.5 : headHalfWidth(y) + (y <= 9 ? 1 : 0);
  if (Math.abs(x - CX) > half) return '.';
  if (y <= hairline(x)) return 'R';
  // Patillas delante de la oreja.
  if (x === 8 || x === 23) return 'R';
  return '.';
});
const PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'cover', legend: LEGEND,
  // Raya a la izquierda (tono profundo) y brillo a su izquierda, donde da la luz.
  grid: stamp(portraitBase, [[12, 4, 'r'], [12, 5, 'r'], [10, 5, 'h'], [9, 6, 'h'], [10, 6, 'h']]),
}];

export default {
  id: 'corto-liso',
  kind: 'hair',
  part: 'hair',
  z: 6,
  portrait: hairVolume('corto-liso', PORTRAIT),
  views: {
    ...DIAGONAL,
    down: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRRR....
        ...RRRRhhRRRRRRR...
        ..RRRhhRRRRRRRRRR..
        .RRRhRRRRRRRRrRRRR.
        .RRRRRRRRRRRrRRRRR.
        .RRRR.....RRRRRRRR.
        .RRR..........RRRR.
        ..R............RR..
        ..R.............R..
        ..R.............R..
      `,
    }],
    up: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRRR....
        ...RRRhhRRRRRRRR...
        ..RRhhRRRRRRRRRRR..
        .RRhRRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRRRR.
        ..RRRRRRRRRRRRRRR..
        ..RRRRRRRRRRRRRRR..
        ..RRRRRRRRRRRRRRR..
        ..RRRRRRRRRRRRRRR..
        ...RRRRRRRRRRRRR...
        ....RRRRRRRRRRR....
      `,
    }],
    left: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ......RRRRRRRR.....
        ....RRRhhRRRRRRR...
        ...RRhhRRRRRRRRRR..
        ..RRhRRRRRRRRRRRRR.
        ..RRRRRRRRRRRRRRRRR
        ..RRR..RRRRRRRRRRRR
        .......RRRRRRRRRRRR
        ........RR..RRRRRRR
        ........RR..RRRRRRR
        .........R..RRRRRR.
        .............RRRR..
        .............RRR...
      `,
    }],
  },
};
