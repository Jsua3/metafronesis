/**
 * Vistas diagonales (tres cuartos) de hair:mono, dibujadas a mano.
 * De frente: raya al medio y el moño asomando 1 px por detrás del lado cercano.
 * De espalda: el moño (7 × 7) sobre la nuca, corrido hacia la derecha por el giro.
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
        ....RRRRRRRRRR.....
        ..RRRRhhRRRRRRR....
        .RRRhhRrRRRRRRRR...
        RRRhRRrRrRRRRRRRR..
        RRRRRr.rRRRRRRRRRR.
        RRR......RRRRRRRRR.
        RR.........RRRRRRRr
        ...........RR..RRRr
        ...........RR..RRRr
        ............R..RRRr
        ...............RRR.
        ...............R...
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
        RRRRRRRRRRRRRRRRRR
        .RRRRRRRRRRrrrRRRR
        .R..RRRRRRrhhRrRRR
        .R..RRRRRrhRRRRrRR
        ....RRRRRrRRRRRrRR
        .....RRRRrRRRRRrR.
        ......RRRRrRRRrR..
        .......RRRRrrrR...
      `,
    },
  ],
};
