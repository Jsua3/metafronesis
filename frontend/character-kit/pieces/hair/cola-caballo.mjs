/**
 * Peinado: cola de caballo con flequillo. El pelo va tirante hacia atrás
 * (deja ver las orejas), con un flequillo recto de puntas sueltas y una cola
 * que se ve de espalda (cae por la nuca) y de perfil (sale hacia atrás y cae).
 *
 * La cola que baja de la nuca se ancla a `T` para seguir al torso. Simétrico:
 * la derecha sale del espejo de la izquierda.
 *
 * Leyenda: R pelo (la luz decide) · r mechón y goma (tono profundo) · h brillo fijo.
 */

import { gridFrom } from '../../raster.mjs';
import { headHalfWidth } from '../../busts/bust-a.mjs';
import { DIAGONAL } from './cola-caballo.diagonal.mjs';
import { hairVolume } from './portrait-volume.mjs';

const LEGEND = {
  R: { mat: 'hair' },
  r: { mat: 'hair', tone: 3 },
  h: { mat: 'hair', tone: 0 },
};

// ── Retrato 32×32 ─────────────────────────────────────────────────────────────

const CX = 15.5;
const PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'cover', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    if (y < 3 || y > 14) return '.';
    const head = headHalfWidth(Math.max(4, y));
    const half = y === 3 ? 2.5 : head + (y <= 9 ? 1 : 0);
    if (Math.abs(x - CX) > half) return '.';
    // Flequillo recto hasta y = 10, con puntas sueltas en y = 11.
    if (y <= 10) return y === 10 && x % 3 === 0 ? 'r' : 'R';
    if (y === 11) return x % 3 === 1 && Math.abs(x - CX) <= 6 ? 'R' : (Math.abs(x - CX) > 6.5 ? 'R' : '.');
    // Pelo tirante a los lados, con la oreja a la vista.
    return Math.abs(x - CX) > 7.5 && y <= 12 ? 'R' : '.';
  }),
}];

export default {
  id: 'cola-caballo',
  kind: 'hair',
  part: 'hair',
  z: 6,
  portrait: hairVolume('cola-caballo', PORTRAIT),
  views: {
    ...DIAGONAL,
    down: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRRR....
        ...RRRhhRRRRRRRR...
        ..RRhhRRRRRRRRRRR..
        .RRhRRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRRRR.
        .RRRrRRRRrRRRRrRRR.
        .RR.R..R.R..R..RRR.
        ..R.............R..
        ..R.............R..
        ..R.............R..
      `,
    }],
    up: [
      {
        anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
        grid: `
          ....RRRRRRRRRRR....
          ...RRRhhRRRRRRRR...
          ..RRhhRRRRRRRRRRR..
          .RRhRRRRRRRRRRRRRR.
          .RRRRRRRRRRRRRRRRR.
          .RRRRRRRrrrRRRRRRR.
          .RRRRRRRRhRRRRRRRR.
          ..RRRRRRRRRRRRRRR..
          ..RRRRRRRhRRRRRRR..
          ..RRRRRRRRRRRRRRR..
          ..RRRRRRRhRRRRRRR..
          ...RRRRRRRRRRRRR...
          ....RRRRRRRRRRR....
          .......RRhRR.......
          .......RRRRR.......
          .......RRRRR.......
        `,
      },
      {
        anchor: 'T', at: [15, 21], mode: 'cover', legend: LEGEND,
        grid: `
          .......RRRRR.......
          ........RRR........
          ........RRR........
          .........R.........
        `,
      },
    ],
    left: [
      {
        // La cola cae pegada a la nuca: así la cabeza no pasa de 21 px de perfil.
        anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
        grid: `
          ......RRRRRRRR......
          ....RRRhhRRRRRRR....
          ...RRhhRRRRRRRRRR...
          ..RRhRRRRRRRRRRRRR..
          .RRRRRRRRRRRRRRRRRr.
          .RRrRRRRRRRRRRRRRrrR
          ..R.R...RRRRRRRRRRRR
          ........RR..RRRRRRRR
          ........RR..RRRRRRRR
          .........R..RRRRRRRR
          ............RRRRRRRR
          ............RRR..RRR
          ..................RR
          ..................RR
          .................RR.
          .................RR.
        `,
      },
      {
        anchor: 'T', at: [15, 21], mode: 'cover', legend: LEGEND,
        grid: `
          ................RR..
          ................R...
        `,
      },
    ],
  },
};
