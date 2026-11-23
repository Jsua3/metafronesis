/**
 * Vistas diagonales (tres cuartos) de face:sereno, dibujadas a mano.
 * El rostro se corre hacia donde mira: ojo lejano en x 19 (ceja de 2 px, en escorzo),
 * ojo cercano en x 24, nariz entre los dos y boca bajo ella. De espalda no se ve.
 * La cabeza girada ocupa x 17-32; la oreja cercana queda en x 29-30 (de frente)
 * y en x 18-19 (de espalda). Las vistas derechas salen del espejo.
 */

const LEGEND = {
  b: { mat: 'hair', tone: 3 },
  k: { literal: 'eye' },
  n: { mat: 'skin', tone: 2 },
  m: { mat: 'skin', tone: 3 },
  q: { literal: 'blush' },
};

export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', at: [18, 11], mode: 'paint', legend: LEGEND,
      grid: `
        bb...bbb.
        .........
        .k....k..
        .k....k..
        .........
        q...n...q
        .........
        ..mm.....
      `,
    },
  ],
  'up-left': [

  ],
};
