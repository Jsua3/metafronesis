/**
 * Vistas diagonales (tres cuartos) de hair:largo-suelto, dibujadas a mano.
 * Raya de lado y melena hasta media espalda; de frente cae por delante de los dos hombros.
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
        .RRRhhrRRRRRRRRR...
        RRRhRrRrRRRRRRRRR..
        RRRRr.RRRRRRRRRRRR.
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
        RRR.........RRRRRR.
        RRR.........RRRrRR.
        RRR.........RRRRRR.
        .RR.........RRRRR..
        .RR.........RRrRR..
        .RR..........RRRR..
        ..R..........RRR...
        ..............R....
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
        .RRRrRRRrRRRRrRRRR.
        .RRRrRRRrRRRRrRRRR.
        .RRRrRRRrRRRRrRRRR.
        .RRRrRRRRRRRRrRRR..
        .RRRRrRRRRRRrRRRR..
        .RRRRrRRRRRRrRRRR..
        ..RRRRRRRRRRRRRR...
        ...RRRRRRRRRRRR....
      `,
    },
  ],
};
