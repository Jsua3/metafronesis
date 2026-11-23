/**
 * Parte de abajo: pantalón de uniforme (pijama clínico, seguridad). Ranura
 * `bottom`. Cintura elástica en banda (tono de sombra) con el cordón al
 * centro y bajo recto en tono de sombra.
 *
 * Leyenda: K banda de cintura (sombra) · h cordón (luz).
 */

import { DIAGONAL } from './pantalon-uniforme.diagonal.mjs';

const LEGEND = {
  K: { mat: 'bottom', tone: 2 },
  h: { mat: 'bottom', tone: 0 },
};

export default {
  id: 'pantalon-uniforme',
  kind: 'bottom',
  slots: ['bottom'],
  coverage: { P: 'bottom', l: 'bottom', m: 'bottom', L: 'bottom', M: 'bottom' },
  edges: [{ labels: ['m', 'M'], edge: 'bottom', tone: 2 }],
  views: {
    ...DIAGONAL,
    down: [{
      anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND,
      grid: `
        KKKKKKhKhKKKKKK
        ......h.h......
      `,
    }],
    up: [{ anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'KKKKKKKKKKKKKKK' }],
    left: [{ anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND, grid: '..hKKKKKKKKKK' }],
  },
};
