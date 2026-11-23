/**
 * Vistas diagonales (tres cuartos) de hair:corto-liso, dibujadas a mano.
 * De frente: flequillo que barre hacia el lado cercano, patilla delante de la oreja y nuca
 * tras ella. De espalda: casco completo con la oreja y la patilla a la izquierda.
 * La cabeza girada ocupa x 17-32; la oreja cercana queda en x 29-30 (de frente)
 * y en x 18-19 (de espalda). Las vistas derechas salen del espejo.
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
        RRRhRRRRRRrRRRRRR.
        RRRRRRRRRrRRRRRRRR
        RRR....RRRRRRRRRRR
        .R........RRRRRRRR
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
        ....RRRRRRRRRR....
        ..RRRhhRRRRRRRR...
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
        .......RRRRRRRR...
      `,
    },
  ],
};
