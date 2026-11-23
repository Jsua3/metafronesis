/**
 * Vistas diagonales (tres cuartos) de hair:bob-flequillo, dibujadas a mano.
 * Mirando a la izquierda se ve el lado pesado: el flequillo cae en diagonal sobre la frente cercana.
 * Mirando a la derecha se ve el lado de la raya: la frente cercana queda despejada y el flequillo tapa la ceja lejana.
 * La cabeza girada ocupa x 17-32 mirando a la izquierda (x 16-31 a la derecha).
 * Pieza asimétrica: las cuatro diagonales se dibujan; ninguna sale del espejo.
 */

const LEGEND = { R: { mat: 'hair' }, r: { mat: 'hair', tone: 3 }, h: { mat: 'hair', tone: 0 } };

export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', at: [16, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRR.....
        ..RRRhhRRRRRRRR....
        .RRhhrRRRRRRRRRR...
        RRhRrRRhhhRRRRRRR..
        RRR..RRRRRRRRRRRRR.
        RR....RRrRRRRRRRRR.
        RR......RRRrRRRRRR.
        .R........RRRRRRRR.
        .R.........RRRRRRR.
        RR..........RRRRRRR
        RR..........RRRRRRR
        RR..........RRrRRRR
        RR..........RRrRRRR
        RRR.........RRRrrR.
        .RR.........RRRRR..
        ..R.........RRRR...
      `,
    },
  ],
  'down-right': [
    {
      anchor: 'H', at: [14, 5], mode: 'cover', legend: LEGEND,
      grid: `
        .....RRRRRRRRRR....
        ....RRRRRhhRRRRRR..
        ...RRRRrRRRhhRRRRR.
        ..RRRRRRrRRRRhhhRRR
        .RRRRRRR..RRRRRRRRR
        .RRRRRR......RrRRRR
        .RRRRRR........RrRR
        .RRRRRRR........RRR
        .RRRRRRR.........RR
        RRRRRRRR.........RR
        RRRRRRRR.........RR
        RRRRRrRR.........RR
        RRRRRrRR.........RR
        .RRrrRRR........RRR
        ..RRRRRR........RR.
        ...RRRRR........R..
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', at: [16, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRR.....
        ..RRRhhhRRRRRRR....
        .RRhhRRRRRRRRRRR...
        RRhRRRRRRRRRRRRRR..
        RRRRRRRRRRRRRRRRRR.
        RRRRRRRRRRRRRRRRRR.
        RRRRRRRRRRRRRRRRRR.
        RRRRRRRRRRRRRRRRRR.
        RRRRRRRRRRRRRRRRRR.
        RRRRRRRRRRRRRRRRRRR
        RRRRRRRRRRRRRRRRRRR
        RRrRRRRRRRRRRRRrRRR
        RRrRRRRRRRRRRRRrRRR
        RRRrRRRRRRRRRrrRRRR
        RRRRRRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRR...
      `,
    },
  ],
  'up-right': [
    {
      anchor: 'H', at: [14, 5], mode: 'cover', legend: LEGEND,
      grid: `
        .....RRRRRRRRRR....
        ....RRRRRRRhhhRRR..
        ...RRRRRRRRRRRhhRR.
        ..RRRRRRRRRRRRRRhRR
        .RRRRRRRRRRRRRRRRRR
        .RRRRRRRRRRRRRRRRRR
        .RRRRRRRRRRRRRRRRRR
        .RRRRRRRRRRRRRRRRRR
        .RRRRRRRRRRRRRRRRRR
        RRRRRRRRRRRRRRRRRRR
        RRRRRRRRRRRRRRRRRRR
        RRRrRRRRRRRRRRRRrRR
        RRRrRRRRRRRRRRRRrRR
        RRRRrrRRRRRRRRRrRRR
        .RRRRRRRRRRRRRRRRRR
        ...RRRRRRRRRRRRRRR.
      `,
    },
  ],
};
