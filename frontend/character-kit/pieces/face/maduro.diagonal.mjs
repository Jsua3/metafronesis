/**
 * Vistas diagonales (tres cuartos) de face:maduro, dibujadas a mano.
 * Como el sereno, con ojeras bajo los ojos y surcos a los lados de la boca.
 * La cabeza girada ocupa x 17-32; la oreja cercana queda en x 29-30 (de frente)
 * y en x 18-19 (de espalda). Las vistas derechas salen del espejo.
 */

const LEGEND = {
  b: { mat: 'hair', tone: 3 },
  k: { literal: 'eye' },
  n: { mat: 'skin', tone: 2 },
  m: { mat: 'skin', tone: 3 },
};

export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', at: [18, 11], mode: 'paint', legend: LEGEND,
      grid: `
        bb...bbb
        ........
        .k....k.
        .k....k.
        n......n
        ....n...
        .n...n..
        ..mm....
      `,
    },
  ],
  'up-left': [

  ],
};
