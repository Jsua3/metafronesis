/**
 * Peinado: moño bajo. El pelo va recogido hacia atrás, con la raya al medio y
 * las orejas a la vista; el moño, en la nuca, se ve de espalda (un círculo
 * con su borde en tono profundo) y de perfil (sale detrás de la cabeza).
 * De frente no se ve: lo distingue del rapado la raya y el pelo que cubre las
 * sienes.
 *
 * Simétrico: la derecha sale del espejo de la izquierda. No es de volumen.
 *
 * Leyenda: R pelo (la luz decide) · r borde del moño y raya (profundo) · h brillo.
 */

import { DIAGONAL } from './mono.diagonal.mjs';

const LEGEND = {
  R: { mat: 'hair' },
  r: { mat: 'hair', tone: 3 },
  h: { mat: 'hair', tone: 0 },
};

// ── Retrato 32×32: pelo recogido hacia atrás con el moño arriba ───────────────
//
// Misma silueta de la cabeza que antes; el casco con raya al medio pasa a ser pelo
// tirante. El moño es una bola sobre la coronilla (luz arriba a la izquierda, tono
// profundo abajo a la derecha) y su sombra cae sobre el casco. Una banda de brillo
// del lado de la luz y tres zonas de tono (luz, base, sombra) que separan dos mechones
// en diagonal hacia el moño; el tono más oscuro, junto a las orejas y en el borde
// contrario a la luz.
//
// Leyenda: R pelo (la luz decide) · h brillo · b base · s sombra · r profundo.

const PORTRAIT_LEGEND = { ...LEGEND, b: { mat: 'hair', tone: 1 }, s: { mat: 'hair', tone: 2 } };

const PORTRAIT = [{
  anchor: 'H', at: [8, 2], mode: 'cover', legend: PORTRAIT_LEGEND,
  grid: `
    ......hbsr......
    .....hhbssr.....
    .....RRssrr.....
    ...Rhhssrrrrr...
    .Rhhhbsbbsssrrr.
    .Rhbbsbbbbsssrr.
    Rbbbsbbbbbbssrrr
    Rbs..........srr
    bs............rr
    s..............r
    r..............r
  `,
}];

export default {
  id: 'mono',
  kind: 'hair',
  part: 'hair',
  z: 6,
  portrait: PORTRAIT,
  views: {
    ...DIAGONAL,
    down: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRRR....
        ...RRRhhRRRRRRRR...
        ..RRhhRRRrRRRRRRR..
        .RRhRRRRrRrRRRRRRR.
        .RRRRRRRr.rRRRRRRR.
        .RRRRR.......RRRRR.
        .RRR...........RRR.
        ..R.............R..
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
        .RRRRRRRrrrRRRRRRR.
        ..RRRRRrhhRrRRRRR..
        ..RRRRrhRRRRrRRRR..
        ..RRRRrRRRRRrRRRR..
        ..RRRRrRRRRRrRRRR..
        ...RRRRrRRRrRRRR...
        ....RRRRrrrRRRR....
      `,
    }],
    left: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ......RRRRRRRR........
        ....RRRhhRRRRRRR......
        ...RRhhRRRRRRRRRR.....
        ..RRhRRRRRRRRRRRRR....
        ...RRRRRRRRRRRRRRRR...
        .....RRRRRRRRRRRRRRR..
        .......RRRRRRRRRRrrr..
        ........RR..RRRRrhRRr.
        ........RR..RRRRrRRRr.
        .........R..RRRRrRRRr.
        ............RRRRRrrr..
        ............RRR.......
      `,
    }],
  },
};
