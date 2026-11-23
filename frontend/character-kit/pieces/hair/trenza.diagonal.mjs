/**
 * Vistas diagonales (tres cuartos) de hair:trenza, dibujadas a mano.
 * Mirando a la izquierda la trenza queda del lado cercano: nace tras la oreja y baja por delante del hombro.
 * Mirando a la derecha queda del lado lejano y asoma por delante del pecho. De espalda solo se ve su arranque sobre el hombro.
 * La cabeza girada ocupa x 17-32 mirando a la izquierda (x 16-31 a la derecha).
 * Pieza asimétrica: las cuatro diagonales se dibujan; ninguna sale del espejo.
 */

const LEGEND = { R: { mat: 'hair' }, r: { mat: 'hair', tone: 3 }, h: { mat: 'hair', tone: 0 } };

export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', at: [16, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRR....
        ..RRRRhhRRRRRRR...
        .RRRhhRrRRRRRRRR..
        RRRhRRrRrRRRRRRRR.
        RRRRRr.rRRRRRRRRRR
        RRR......RRRRRRRRR
        RR.........RRRRRRR
        ...........RR..RRR
        ...........RR..RRR
        ............R..RRR
        ...............RR.
        .............hRr..
        .............Rhr..
        .............hRr..
        .............Rhr..
        .............hRr..
      `,
    },
    {
      anchor: 'T', at: [28, 21], mode: 'cover', legend: LEGEND,
      grid: `
        hRr
        Rhr
        hRr
        Rhr
        hRr
        Rhr
        hRr
        Rhr
        hRr
        .R.
        .r.
      `,
    },
  ],
  'down-right': [
    {
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRR....
        ...RRRRRRRhhRRRR..
        ..RRRRRRRRrRhhRRR.
        .RRRRRRRRrRrRRhRRR
        RRRRRRRRRRr.rRRRRR
        RRRRRRRRR......RRR
        RRRRRRR.........RR
        RRR..RR...........
        RRR..RR...........
        RRR..R............
        .RR...............
        ..R...............
        ..................
        ..................
        ...............Rr.
        ..............rhR.
      `,
    },
    {
      anchor: 'T', at: [28, 21], mode: 'cover', legend: LEGEND,
      grid: `
        rRh
        rhR
        rRh
        rhR
        rRh
        rhR
        rRh
        rhR
        rRh
        .R.
        .r.
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
        ....RRRRRRRRRRRR..
        ....RRRRRRRRRRR...
        ....RRr...........
        ....RRr...........
        ....hRr...........
      `,
    },
    {
      anchor: 'T', at: [19, 21], mode: 'cover', legend: LEGEND,
      grid: `
        hRr
        Rhr
        hRr
      `,
    },
  ],
  'up-right': [
    {
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRR....
        ...RRRRRRRRhhRRR..
        ..RRRRRRRRRRRhhRR.
        .RRRRRRRRRRRRRRhRR
        RRRRRRRRRRRRRRRRRR
        RRRRRRRRRRRRRRRRRR
        RRRRRRRRRRRRRRRRR.
        RRRRRRRRRRRRRR..R.
        RRRRRRRRRRRRRR..R.
        RRRRRRRRRRRRRR....
        .RRRRRRRRRRRR.....
        ..RRRRRRRRRR......
        ...RRRRRRRR.......
      `,
    },
    {
      anchor: 'T', at: [19, 21], mode: 'cover', legend: LEGEND,
      grid: `
        rRh
        rhR
      `,
    },
  ],
};
