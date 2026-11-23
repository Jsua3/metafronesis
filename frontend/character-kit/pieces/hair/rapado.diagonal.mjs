/**
 * Vistas diagonales (tres cuartos) de hair:rapado, dibujadas a mano.
 * Casco al ras con la línea del pelo recta en la frente.
 * La cabeza girada ocupa x 17-32; la oreja cercana queda en x 29-30 (de frente)
 * y en x 18-19 (de espalda). Las vistas derechas salen del espejo.
 */

const LEGEND = { R: { mat: 'hair' }, r: { mat: 'hair', tone: 3 }, h: { mat: 'hair', tone: 0 } };

export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', at: [16, 5], mode: 'cover', legend: LEGEND,
      grid: `
        .....RRRRRRRRR....
        ...RRRRRRRRRRRR...
        .RRRhhRRRRRRRRRR..
        RRRhRRRRRRRRRRRRR.
        RRRRRRRRRRRRRRRRRR
        RR........RRRRRRRR
        .R.........RRRRRRR
        ...........RR..RRR
        ...........RR..RRR
        ............R..RRR
        ...............RR.
        ...............R..
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', at: [16, 5], mode: 'cover', legend: LEGEND,
      grid: `
        .....RRRRRRRRR....
        ...RRRRRRRRRRRR...
        .RRhhRRRRRRRRRRR..
        RRhRRRRRRRRRRRRRR.
        RRRRRRRRRRRRRRRRRR
        RRRRRRRRRRRRRRRRRR
        .RRRRRRRRRRRRRRRRR
        .R..RRRRRRRRRRRRRR
        .R..RRRRRRRRRRRRRR
        ....RRRRRRRRRRRRRR
        .....RRRRRRRRRRRR.
        ......RRRRRRRRRR..
      `,
    },
  ],
};
