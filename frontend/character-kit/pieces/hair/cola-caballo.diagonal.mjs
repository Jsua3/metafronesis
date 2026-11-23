/**
 * Vistas diagonales (tres cuartos) de hair:cola-caballo, dibujadas a mano.
 * De frente: flequillo en mechas y la cola asomando tras el cuello, del lado cercano.
 * De espalda: la liga en la coronilla y la cola cayendo, corrida a la derecha por el giro.
 * Las vistas derechas salen del espejo.
 * La cabeza girada ocupa x 17-32; la oreja cercana queda en x 29-30 (de frente)
 * y en x 18-19 (de espalda).
 */

const LEGEND = { R: { mat: 'hair' }, r: { mat: 'hair', tone: 3 }, h: { mat: 'hair', tone: 0 } };

export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', at: [16, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRR....
        ..RRRRhhRRRRRRR...
        .RRRhhRRRRRRRRRR..
        RRRhRRRRRRRRRRRRR.
        RRRRRRRRRRRRRRRRRR
        RRrRRRrRRRRrRRRRRR
        RR.R.R.R..RRRRRRRR
        .R.........RR..RRR
        ...........RR..RRR
        ............R..RRR
        ...............RRR
        ...............RRR
        ...............RR.
        ..............RRR.
        .............RRR..
        .............RRR..
      `,
    },
    {
      anchor: 'T', at: [29, 21], mode: 'cover', legend: LEGEND,
      grid: `
        rr
        r.
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', at: [16, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRR....
        ..RRRhhRRRRRRRR...
        .RRhhRRRRRRRRRRR..
        RRhRRRRRRRRRRRRRR.
        RRRRRRRRRRRRRRRRRR
        RRRRRRRRRRRrrrRRRR
        .RRRRRRRRRRRhRRRRR
        .R..RRRRRRRRRRRRRR
        .R..RRRRRRRRhRRRRR
        ....RRRRRRRRRRRRRR
        .....RRRRRRRhRRRR.
        ......RRRRRRRRRR..
        .......RRRRRRRR...
        ..........RRhRR...
        ..........RRRRR...
        ..........RRRRR...
      `,
    },
    {
      anchor: 'T', at: [26, 21], mode: 'cover', legend: LEGEND,
      grid: `
        rrrrr
        .rrr.
        .rrr.
        ..r..
      `,
    },
  ],
};
