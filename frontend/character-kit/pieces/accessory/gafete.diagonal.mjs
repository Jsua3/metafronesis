/**
 * Vistas diagonales (tres cuartos) de accessory:gafete, dibujadas a mano.
 * La cinta baja de los dos lados del cuello y la tarjeta cuelga sobre la línea media del pecho,
 * que en tres cuartos queda en x 21. De espalda solo se ve la cinta en la nuca.
 * Las vistas derechas salen del espejo.
 */

const LEGEND = {
  c: { literal: 'gafeteCinta' },
  w: { literal: 'gafete' },
};

export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', at: [19, 24], mode: 'paint', legend: LEGEND,
      grid: `
        c...c
        c...c
        .c.c.
        .ccc.
        .www.
        .www.
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', at: [23, 23], mode: 'paint', legend: LEGEND,
      grid: `
        ccccc
      `,
    },
  ],
};
