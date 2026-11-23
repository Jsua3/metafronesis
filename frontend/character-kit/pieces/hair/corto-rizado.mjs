/**
 * Peinado: corto rizado. Rizo corto con la silueta irregular (bultos arriba y
 * a los lados) y textura de rizos: cada rizo es un brillo arriba a la
 * izquierda y una sombra abajo a la derecha. El borde del flequillo es
 * dentado. Sin color se distingue del corto liso por la silueta.
 *
 * Simétrico: la derecha sale del espejo de la izquierda.
 *
 * Leyenda: R pelo (la luz decide) · h brillo de rizo · r sombra de rizo.
 */

import { gridFrom } from '../../raster.mjs';
import { headHalfWidth } from '../../busts/bust-a.mjs';
import { DIAGONAL } from './corto-rizado.diagonal.mjs';
import { hairVolume } from './portrait-volume.mjs';

const LEGEND = {
  R: { mat: 'hair' },
  r: { mat: 'hair', tone: 3 },
  h: { mat: 'hair', tone: 0 },
};

// ── Retrato 32×32 ─────────────────────────────────────────────────────────────

const CX = 15.5;
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
/** Rizos dispersos: brillo en la mitad iluminada, sombra en la otra. */
function curl(x, y) {
  const k = (x + 3 * y) % 7;
  if (k === 0 && x + y < 26) return 'h';
  if (k === 4 && x + y > 24) return 'r';
  return 'R';
}
const PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'cover', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    if (y > 14 || !inEllipse(x, y, CX, 10.5, 10.2, 8.4)) return '.';
    // Contorno festoneado: muescas en el borde cada 3 píxeles.
    if (!inEllipse(x, y, CX, 10.5, 9.2, 7.4) && (x + y) % 3 === 0) return '.';
    const face = headHalfWidth(y);
    if (y >= 9 && face !== null && Math.abs(x - CX) <= Math.min(face, 6.5)) return '.';
    return curl(x, y);
  }),
}];

export default {
  id: 'corto-rizado',
  kind: 'hair',
  part: 'hair',
  z: 6,
  portrait: hairVolume('corto-rizado', PORTRAIT),
  views: {
    ...DIAGONAL,
    down: [{
      anchor: 'H', at: [15, 4], mode: 'cover', legend: LEGEND,
      grid: `
        .....RR.RR.RR......
        ...RRRRRRRRRRRRR...
        ..RRhRRRRRhRRRRRR..
        .RRhRRRRRhRRRRRRRR.
        RRRRRRRRRRRRRRRrRRR
        RRhRRRRRRRRRRRRRRRR
        RRRRR.R.....R.RRRrR
        .RRR...........RRR.
        .RR.............RR.
        ..R.............R..
      `,
    }],
    up: [{
      anchor: 'H', at: [15, 4], mode: 'cover', legend: LEGEND,
      grid: `
        .....RR.RR.RR......
        ...RRRRRRRRRRRRR...
        ..RRhRRRRRhRRRRRR..
        .RRhRRRRRhRRRRRRRR.
        RRRRRRRRRRRRRRRrRRR
        RRhRRRRRRRRRRRRRRRR
        RRRRRRRRhRRRRRRRrRR
        .RRRRRRRRRRRRRRRRR.
        .RRRhRRRRRRRRRRrRR.
        ..RRRRRRRRRRRRRRR..
        ..RRRRRRRRRRRRrRR..
        ...RRRRRRRRRRRRR...
        ....RRRRRRRRRRR....
      `,
    }],
    left: [{
      anchor: 'H', at: [15, 4], mode: 'cover', legend: LEGEND,
      grid: `
        .......RR.RR.R.....
        ....RRRRRRRRRRRR...
        ...RRhRRRRhRRRRRR..
        ..RRhRRRRhRRRRRRRR.
        .RRRRRRRRRRRRRRRRRR
        .RRhRRRRRRRRRRRRRrR
        .RRRR..RRRRRRRRRRRR
        ..R.....RRRRRRRRRRR
        .......RRRRRRRRRRRR
        ........RR..RRRRrRR
        ........RR..RRRRRRR
        .........R..RRRRRR.
        ............RRRRR..
        .............RRR...
      `,
    }],
  },
};
