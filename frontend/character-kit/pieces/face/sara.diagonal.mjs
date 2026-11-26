/**
 * Vistas diagonales (tres cuartos) de face:sara, dibujadas a mano sobre las
 * del rostro sereno: cejas más marcadas (la cercana de 4 px), mejillas con más
 * rubor y labios rosados. La cabeza girada ocupa x 17-32. Las vistas derechas
 * salen del espejo.
 */

const LEGEND = {
  b: { mat: 'hair', tone: 3 },
  k: { literal: 'eye' },
  n: { mat: 'skin', tone: 2 },
  l: { literal: 'labiosRosa' },
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
        qq..n..qq
        .........
        ..lll....
      `,
    },
  ],
  'up-left': [],
};
