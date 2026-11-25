/**
 * Vistas diagonales (tres cuartos) de face:karen, dibujadas a mano sobre las
 * del rostro sereno: cejas más marcadas (la cercana de 4 px) y labios rojo
 * vino. La cabeza girada ocupa x 17-32. Las vistas derechas salen del espejo.
 */

const LEGEND = {
  b: { mat: 'hair', tone: 3 },
  k: { literal: 'eye' },
  n: { mat: 'skin', tone: 2 },
  l: { literal: 'labios' },
  q: { literal: 'blush' },
};

export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', at: [18, 11], mode: 'paint', legend: LEGEND,
      grid: `
        bb...bbbb
        .........
        .k....k..
        .k....k..
        .........
        q...n...q
        .........
        ..lll....
      `,
    },
  ],
  'up-left': [],
};
