/**
 * Vistas diagonales (tres cuartos) de hair:afro, dibujadas a mano.
 * Esfera de volumen (3 px del lado lejano, 4 del cercano): de frente deja ver el rostro y tapa la oreja;
 * de espalda lo cubre todo. Las vistas derechas salen del espejo.
 * La cabeza girada ocupa x 17-32; la oreja cercana queda en x 29-30 (de frente)
 * y en x 18-19 (de espalda).
 */

const LEGEND = { R: { mat: 'hair' }, r: { mat: 'hair', tone: 3 }, h: { mat: 'hair', tone: 0 } };

export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', at: [14, 4], mode: 'cover', legend: LEGEND,
      grid: `
        ......RRRRhRRRRRR......
        ....RRRhRRRRRRhRRRR....
        ...RRhRRRRRhRRRRRRrR...
        ..RRRRRRhRRRRRRRRRRRR..
        .RRRRhRRRRRRRhRRRRRRRR.
        RRRhRRRRRhRRRRRRRRRRrRR
        RRR.........RRRRRRRRRrR
        RhR..........RRRRRRRRRR
        RRR..........RRhRRRRRRR
        RRR..........RRRRRRRrRR
        .RR..........RRRRRRRRR.
        .RR..........RRRRRRRR..
        ..R..........RRRrRRR...
        ..............RRRRR....
        ..............RRR......
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', at: [14, 4], mode: 'cover', legend: LEGEND,
      grid: `
        ......RRRRhRRRRRR......
        ....RRRhRRRRRRhRRRR....
        ...RRhRRRRRhRRRRRRrR...
        ..RRRRRRhRRRRRRRRRRRR..
        .RRRRhRRRRRRRhRRRRRRRR.
        RRRhRRRRRhRRRRRRRRRRrRR
        RRRRRRhRRRRRRRRRRrRRRRR
        RRhRRRRRRRRRRRrRRRRRRRR
        RRRRRRRhRRRRRRRRRRRRRrR
        RRRhRRRRRRRRRRRRRRRrRRR
        .RhRRRRRRRRRRRRRrRRRRR.
        ..RRRhRRRRRRRrRRRRRRR..
        ..RRRRRRRRrRRRRRRRRR...
        ....RRRrRRRRRRRRRRr....
        ......RRRRRRRRRrR......
      `,
    },
  ],
};
