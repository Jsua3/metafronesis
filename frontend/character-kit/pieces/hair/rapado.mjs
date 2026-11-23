/**
 * Peinado: rapado. Pelo al ras que deja ver la forma del cráneo, con el
 * nacimiento recto en la frente y en las sienes. Sin flequillo ni volumen
 * arriba: lo distingue del corto liso de frente y de espalda.
 *
 * Abulta 1 px a los lados (y 2 px tras la oreja en perfil) para que la cabeza
 * mida 18-21 px como pide la biblia §1: el cráneo del maniquí mide 17 con
 * contorno. Simétrico: la derecha sale del espejo de la izquierda.
 *
 * Leyenda: R pelo (la luz decide) · h brillo fijo.
 */

import { gridFrom, stamp } from '../../raster.mjs';
import { headHalfWidth } from '../../busts/bust-a.mjs';
import { DIAGONAL } from './rapado.diagonal.mjs';
import { hairVolume } from './portrait-volume.mjs';

const LEGEND = {
  R: { mat: 'hair' },
  h: { mat: 'hair', tone: 0 },
};

// ── Retrato 32×32: una capa fina sobre el cráneo ──────────────────────────────

const CX = 15.5;
const portraitBase = gridFrom(32, 32, (x, y) => {
  if (y < 4 || y > 13) return '.';
  const half = headHalfWidth(y);
  if (half === null || Math.abs(x - CX) > half) return '.';
  if (y <= 8) return 'R';
  // Sienes rectas hasta la altura de las cejas.
  return x <= 8 || x >= 23 ? 'R' : '.';
});
const PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'cover', legend: LEGEND,
  grid: stamp(portraitBase, [[11, 5, 'h'], [10, 6, 'h'], [12, 5, 'h']]),
}];

export default {
  id: 'rapado',
  kind: 'hair',
  part: 'hair',
  z: 6,
  portrait: hairVolume('rapado', PORTRAIT),
  views: {
    ...DIAGONAL,
    down: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        .....RRRRRRRRR.....
        ...RRRRRRRRRRRRR...
        ..RRhhRRRRRRRRRRR..
        .RRhRRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRRRR.
        .RR.............RR.
        .RR.............RR.
        ..R.............R..
        ..R.............R..
      `,
    }],
    up: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        .....RRRRRRRRR.....
        ...RRRRRRRRRRRRR...
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
      `,
    }],
    left: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ......RRRRRRRR.....
        ....RRRRRRRRRRRR...
        ...RRhhRRRRRRRRRR..
        ..RRhRRRRRRRRRRRRR.
        ...RRRRRRRRRRRRRRR.
        .....RRRRRRRRRRRRR.
        .......RRRRRRRRRRR.
        ........RR..RRRRRRR
        ........RR..RRRRRRR
        .........R..RRRRRR.
        .............RRRR..
        .............RRR...
      `,
    }],
  },
};
