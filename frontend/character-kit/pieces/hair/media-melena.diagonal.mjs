/**
 * Vistas diagonales (tres cuartos) de hair:media-melena, dibujadas a mano.
 * Raya al medio y cortinas hasta los hombros: la lejana asoma 3 px tras la mejilla, la cercana tapa la oreja.
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
        RR........RRRRRRRR.
        RR.........RRRRRRRR
        RR.........RRRRRRRR
        RR.........RRRRRRRR
        RR..........RRRRRRR
        RR..........RRRRRRR
        RR..........RRRRRRR
        RR..........RRRRRRR
        RR..........RRRRRRR
        RR..........RRRRRR.
      `,
    },
    {
      anchor: 'T', at: [16, 21], mode: 'cover', legend: LEGEND,
      grid: `
        RR..........RRRRRRR
        RRR.........RRRRRRR
        RRR.........RRRRRR.
        RRR.........RRRrRR.
        .R...........RRRR..
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', at: [16, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRR.....
        ..RRRhhRRRRRRRR....
        .RRhhRRRRRRRRRRR...
        RRhRRRRRRRRRRRRRR..
        RRRRRRRRRRRRRRRRRR.
        RRRRRRRRRRRRRRRRRR.
        RRRRRRRRRRRRRRRRRR.
        RRhhhRRRRRRRRRRRRRR
        RRRRRhhRRRRRRRRRRRR
        RRRRRRRRRRRRRRRRRRR
        RRRRrRRRRRRRRrRRRRR
        RRRRrRRRRRRRRrRRRRR
        RRRRrRRRRRRRRrRRRRR
        RRRRrRRRRRRRRrRRRRR
        RRRRrRRRRRRRRrRRRRR
        RRRRrRRRRRRRRrRRRRR
      `,
    },
    {
      anchor: 'T', at: [16, 21], mode: 'cover', legend: LEGEND,
      grid: `
        RRRRrRRRRRRRRrRRRRR
        RRRRrRRRRRRRRrRRRRR
        .RRRrRRRRRRRRrRRRR.
        .RRRrRRRRRRRRrRRRR.
        ..RRRRRRRRRRRRRRR..
      `,
    },
  ],
};
