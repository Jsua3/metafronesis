/**
 * Parte de abajo: pantalón de tela. Ranura `bottom`. Cinturón oscuro con
 * hebilla en la primera fila de la cadera (lo tapan las prendas que van por
 * fuera) y bajo marcado en la última fila de la pierna. Sin las costuras del
 * jean.
 *
 * Leyenda: J cinturón (profundo) · h hebilla (luz).
 */

import { DIAGONAL } from './pantalon.diagonal.mjs';

const LEGEND = {
  J: { mat: 'bottom', tone: 3 },
  h: { mat: 'bottom', tone: 0 },
};

export default {
  id: 'pantalon',
  kind: 'bottom',
  slots: ['bottom'],
  coverage: { P: 'bottom', l: 'bottom', m: 'bottom', L: 'bottom', M: 'bottom' },
  edges: [{ labels: ['m', 'M'], edge: 'bottom', tone: 3 }],
  views: {
    ...DIAGONAL,
    down: [{ anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'JJJJJJJhJJJJJJJ' }],
    up: [{ anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'JJJJJJJJJJJJJJJ' }],
    left: [{ anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND, grid: '..hJJJJJJJJJJ' }],
  },
};
