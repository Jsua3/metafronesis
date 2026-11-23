/**
 * Vistas diagonales (tres cuartos) de hair:corto-rizado, dibujadas a mano.
 * Rizos: copete de mechones sueltos arriba, 2 px de volumen a los lados y un rizo sobre la frente.
 * La cabeza girada ocupa x 17-32; la oreja cercana queda en x 29-30 (de frente)
 * y en x 18-19 (de espalda). Las vistas derechas salen del espejo.
 */

const LEGEND = { R: { mat: 'hair' }, r: { mat: 'hair', tone: 3 }, h: { mat: 'hair', tone: 0 } };

export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', at: [15, 4], mode: 'cover', legend: LEGEND,
      grid: `
        ......RR.RR.RR......
        ....RRRRRRRRRRRRR...
        ...RRhRRRRRhRRRRRR..
        ..RRhRRRRRhRRRRRRRR.
        RRRRRRRRRRRRRRRRrRRR
        RRhRRRRRRRRRRRRRRRRR
        RRRR.R..RRRRRRRRRRrR
        .RR........RRRRRRRRR
        .R..........RR..RRRR
        ............RR..RRrR
        .............R..RRRR
        ................RRR.
        ................RRR.
        ................RR..
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', at: [15, 4], mode: 'cover', legend: LEGEND,
      grid: `
        ......RR.RR.RR......
        ....RRRRRRRRRRRRR...
        ...RRhRRRRRhRRRRRR..
        ..RRhRRRRRhRRRRRRRR.
        RRRRRRRRRRRRRRRRrRRR
        RRhRRRRRRRRRRRRRRRRR
        RRRRRRRRhRRRRRRRRrRR
        .RRRRRRRRRRRRRRRRRRR
        .RR..RRhRRRRRRRRrRRR
        ..R..RRRRRRRRRRRRRRR
        .....RRRRRRRRRRrRRR.
        ......RRRRRRRRRRRRR.
        .......RRRRRRRRRRR..
      `,
    },
  ],
};
