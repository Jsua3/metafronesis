/**
 * Vistas diagonales (tres cuartos) de layer:bata, dibujadas a mano.
 * La abertura y el escote se corren hacia donde mira el personaje (x 21); el bolsillo lejano
 * queda en escorzo (2 px) y el cercano entero. De espalda, la abertura del faldón queda en x 27.
 * El ancho (x 16-31) cubre las dos complexiones. Las vistas derechas salen del espejo.
 */

const LEGEND = {
  L: { mat: 'layer' },
  X: { mat: 'layer', tone: 3 },
  K: { mat: 'layer', tone: 2 },
  t: { mat: 'top' },
};

export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', at: [16, 23], mode: 'repaint', legend: LEGEND,
      grid: `
        LLL.....LLLLLLLL
        LLLX...XLLLLLLLL
        LLLLX.XLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
      `,
    },
    {
      anchor: 'T', at: [19, 23], mode: 'paint', legend: LEGEND,
      grid: `
        ttttt
        .ttt.
        ..t..
      `,
    },
    {
      anchor: 'P', at: [16, 38], mode: 'cover', legend: LEGEND,
      grid: `
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LKKLLXLLLKKKLLLL
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LLLLLXLLLLLLLLLL
        LLLLX.XLLLLLLLLL
        LLLLX.XLLLLLLLLL
        LLLLX.XLLLLLLLLL
        .LLLX.XLLLLLLLL.
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', at: [16, 23], mode: 'repaint', legend: LEGEND,
      grid: `
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
      `,
    },
    {
      anchor: 'P', at: [16, 38], mode: 'cover', legend: LEGEND,
      grid: `
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLLLLLL
        LLLLLLLLLLLXLLLL
        LLLLLLLLLLLXLLLL
        LLLLLLLLLLLXLLLL
        .LLLLLLLLLLXLLL.
      `,
    },
  ],
};
