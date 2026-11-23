/**
 * Peinado: largo suelto. Pelo largo con la raya a un lado: cae sobre el pecho
 * por delante y hasta media espalda por detrás. Sin color se distingue de la
 * media melena por el largo (la silueta baja hasta la cintura en la espalda).
 *
 * La parte de la cabeza se ancla a `H`; la que cae sobre hombros y espalda,
 * a `T`, así sigue al torso en la caminata. Simétrico: la derecha sale del
 * espejo de la izquierda.
 *
 * Leyenda: R pelo (la luz decide) · r mechón (tono profundo) · h brillo fijo.
 */

import { gridFrom } from '../../raster.mjs';
import { headHalfWidth } from '../../busts/bust-a.mjs';
import { DIAGONAL } from './largo-suelto.diagonal.mjs';
import { hairVolume } from './portrait-volume.mjs';

const LEGEND = {
  R: { mat: 'hair' },
  r: { mat: 'hair', tone: 3 },
  h: { mat: 'hair', tone: 0 },
};

// ── Retrato 32×32 ─────────────────────────────────────────────────────────────

const CX = 15.5;
/** Medio ancho exterior del pelo: redondo arriba y recto hasta los hombros. */
function outer(y) {
  if (y < 2 || y > 29) return null;
  if (y <= 13) return 10 * Math.sqrt(Math.max(0, 1 - ((13 - y) / 11.5) ** 2));
  return 10;
}
const PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'cover', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    const half = outer(y);
    if (half === null || Math.abs(x - CX) > half) return '.';
    // La cara y el cuello quedan a la vista entre las dos cortinas.
    const face = headHalfWidth(y);
    if (y >= 9 && Math.abs(x - CX) <= Math.min(face ?? 3.5, 7)) return '.';
    if (y > 24 && Math.abs(x - CX) <= 6) return '.';
    // Raya a la izquierda y brillo a su izquierda.
    if (x === 12 && y <= 7) return 'r';
    if ((x === 10 && y >= 5 && y <= 6) || (x === 11 && y === 4)) return 'h';
    return 'R';
  }),
}];

export default {
  id: 'largo-suelto',
  kind: 'hair',
  part: 'hair',
  z: 6,
  portrait: hairVolume('largo-suelto', PORTRAIT),
  views: {
    ...DIAGONAL,
    down: [
      {
        anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
        grid: `
          ....RRRRRRRRRRR....
          ...RRRhhRRRRRRRR...
          ..RRhhRrRRRRRRRRR..
          .RRhRRrRrRRRRRRRRR.
          .RRRRRr.RRRRRRRRRR.
          .RRRRR......RRRRRR.
          .RRRR.........RRRR.
          RRRR...........RRRR
          RRRR...........RRRR
          RRRR...........RRRR
          RRRR...........RRRR
          RRRR...........RRRR
          RRRR...........RRRR
          RRRR...........RRRR
          RRRR...........RRRR
          .RRR...........RRR.
        `,
      },
      {
        anchor: 'T', at: [15, 21], mode: 'cover', legend: LEGEND,
        grid: `
          RRRR...........RRRR
          RRRRR.........RRRRR
          .RRRRR.......RRRRR.
          .RRRRR.......RRRRR.
          .RRrRR.......RRrRR.
          .RRRRR.......RRRRR.
          ..RRRR.......RRRR..
          ..RRrR.......RrRR..
          ..RRRR.......RRRR..
          ...RR.........RR...
        `,
      },
    ],
    up: [
      {
        anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
        grid: `
          ....RRRRRRRRRRR....
          ...RRRhhRRRRRRRR...
          ..RRhhRRRRRRRRRRR..
          .RRhRRRRRRRRRRRRRR.
          .RRRRRRRRRRRRRRRRR.
          .RRRRRRRRRRRRRRRRR.
          .RRRRRRRRRRRRRRRRR.
          RRRRRRRRRRRRRRRRRRR
          RRRRRRRRRRRRRRRRRRR
          RRRRRRRRRRRRRRRRRRR
          RRRhhhRRRRRRRRRRRRR
          RRRRRRhhRRRRRRRRRRR
          RRRRRRRRRRRRRRRRRRR
          RRRRRrRRRRRRRrRRRRR
          RRRRRrRRRRRRRrRRRRR
          RRRRRrRRRRRRRrRRRRR
        `,
      },
      {
        anchor: 'T', at: [15, 21], mode: 'cover', legend: LEGEND,
        grid: `
          RRRRRrRRRRRRRrRRRRR
          RRRRRrRRRRRRRrRRRRR
          .RRRRrRRRRRRRrRRRR.
          .RRRRrRRRrRRRrRRRR.
          .RRRRrRRRrRRRrRRRR.
          .RRRRrRRRrRRRrRRRR.
          ..RRRrRRRRRRRrRRR..
          ..RRRRrRRRRRrRRRR..
          ..RRRRrRRRRRrRRRR..
          ...RRRRRRRRRRRRR...
          ....RRRRRRRRRRR....
        `,
      },
    ],
    left: [
      {
        anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
        grid: `
          ......RRRRRRRR.....
          ....RRRhhRRRRRRR...
          ...RRhhRRRRRRRRRR..
          ..RRhRRRRRRRRRRRRR.
          .RRRRRRRRRRRRRRRRRR
          .RRR...RRRRRRRRRRRR
          ..R.....RRRRRRRRRRR
          .......RRRRRRRRRRRR
          .......RRRRRRRRRRRR
          ........RRRRRRRRRRR
          .........RRRRRRrRRR
          .........RRRRRRrRRR
          ..........RRRRRRRRR
          ...........RRRRRRRR
          ...........RRRRRRRR
          ...........RRRRRRRR
        `,
      },
      {
        anchor: 'T', at: [15, 21], mode: 'cover', legend: LEGEND,
        grid: `
          ...........RRRRRRRR
          ...........RRRRRRRR
          ............RRRRRRR
          ............RRRRRRR
          ............RRRrRRR
          ............RRRRRRR
          ............RRRRRR.
          ............RRRrRR.
          .............RRRRR.
          .............RRRR..
          ..............RR...
        `,
      },
    ],
  },
};
