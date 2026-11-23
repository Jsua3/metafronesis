/**
 * Peinado: bob a la mandíbula con flequillo de lado (raya a la derecha de la
 * persona = izquierda de la pantalla en la vista de frente).
 *
 * Asimétrico: el perfil izquierdo muestra el lado hacia el que cae el
 * flequillo (volumen) y el derecho el lado de la raya (frente despejada).
 * Por eso las dos vistas laterales se dibujan aparte.
 *
 * Leyenda: R pelo (la luz decide el tono) · r mechón (tono profundo) ·
 * s sombra fija · h brillo fijo. Coordenadas absolutas del cuadro de reposo;
 * el generador las desplaza con la cabeza en cada cuadro.
 */

import { HAIR_BOB_PORTRAIT } from './bob-flequillo.portrait.mjs';
import { DIAGONAL } from './bob-flequillo.diagonal.mjs';
import { hairVolume } from './portrait-volume.mjs';

const LEGEND = {
  R: { mat: 'hair' },
  r: { mat: 'hair', tone: 3 },
  s: { mat: 'hair', tone: 2 },
  h: { mat: 'hair', tone: 0 },
};

export default {
  id: 'bob-flequillo',
  kind: 'hair',
  asymmetric: true,
  part: 'hair',
  z: 6,
  portrait: hairVolume('bob-flequillo', HAIR_BOB_PORTRAIT),
  views: {
    ...DIAGONAL,
    down: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRRR....
        ...RRRhhRRRRRRRR...
        ..RRhhrRRRRRRRRRR..
        .RRhRrRRRhhhRRRRRR.
        .RRRR..RRRRRRRRRRR.
        .RRR.....RRrRRRRRR.
        .RRR.......RRRrRRR.
        .RRR.........RRRRR.
        .RRR...........RRR.
        RRRR...........RRRR
        RRRR...........RRRR
        RRRR...........RRRR
        RRRR...........RRRR
        RRRR...........RRRR
        .RRRR.........RRRR.
        ..RRR.........RRR..
      `,
    }],
    up: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRRR....
        ...RRRhhhRRRRRRR...
        ..RRhhRRRRRRRRRRR..
        .RRhRRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRRRR.
        RRRRRRRRRRRRRRRRRRR
        RRRRRRRRRRRRRRRRRRR
        RRRrRRRRRRRRRRRRRRR
        RRRrRRRRRRRRRRRRRRR
        RRRRrRRRRRRRRRrrRRR
        .RRRRRRRRRRRRRRRRR.
        ..RRRRRRRRRRRRRRR..
      `,
    }],
    left: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ......RRRRRRRR.....
        ....RRRhhRRRRRRR...
        ...RRhhRRRRRRRRRR..
        ..RRhRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRRRRR
        .RRRR..RRRRRRRRRRRR
        ..RRR...RRRRRRRRRRR
        .......RrRRRRRRRRRR
        .......RrRRRRRRRRRR
        .......RRrRRRRRRRRR
        .......RRrRRRRRRRR.
        .......RRRrRRRRRrR.
        .......RRRrRRRRrR..
        .......RRRRrrrrR...
        .......RRRRRRR.....
        ........RRR........
      `,
    }],
    right: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        .....RRRRRRRR......
        ...RRRRRRRRhhrR....
        ..RRRRRRRRhhRrRR...
        .RRRRRRRRRRRRRrR...
        RRRRRRRRRRRRRRR....
        RRRRRRRRRRRRRR.....
        RRRRRRRRRRRRR......
        RRRRRRRRRrRR.......
        RRRRRRRRRrR........
        RRRRRRRRrRR........
        .RRRRRRRrRR........
        .RRrRRRRrRRR.......
        ..RRrRRRrRRR.......
        ...RRrrrRRRR.......
        .....RRRRRR........
        .......RRR.........
      `,
    }],
  },
};
