/**
 * Vistas diagonales (tres cuartos) de top:uniforme-psicologia, dibujadas a mano.
 * El bordado va en el pecho y la manga IZQUIERDOS de quien la lleva. Mirando a la izquierda ese
 * lado es el cercano: marca en el pecho (x 25-26) y en la manga del brazo cercano (`a`).
 * Mirando a la derecha es el lejano: la marca queda al fondo del pecho y en el brazo lejano (`A`).
 * Pieza asimétrica: las cuatro diagonales se dibujan.
 */

const LEGEND = {
  j: { mat: 'top' },
  h: { mat: 'top', tone: 0 },
  J: { mat: 'top', tone: 3 },
  K: { mat: 'top', tone: 2 },
  f: { mat: 'accent', tone: 1 },
};

export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND,
      grid: `
        hh.hhhhh
      `,
    },
    {
      anchor: 'T', at: [18, 23], mode: 'paint', legend: LEGEND,
      grid: `
        ...J.....
        ...J.....
        ...h.....
        ...J.....
        ...h.....
        ...J.....
        .........
        .........
        .........
        .........
        .........
        JJJ..JJJJ
      `,
    },
    {
      anchor: 'T', at: [25, 26], mode: 'paint', legend: LEGEND,
      grid: `
        ff
        ff
      `,
    },
    {
      anchor: 'T', at: [30, 27], mode: 'paint', legend: LEGEND, parts: ['a'],
      grid: `
        f
        f
      `,
    },
    {
      anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND,
      grid: `
        jjjjjjjjjjjjjj
        KKKKKKKKKKKKKK
      `,
    },
  ],
  'down-right': [
    {
      anchor: 'T', at: [21, 22], mode: 'cover', legend: LEGEND,
      grid: `
        hhhhh.hh
      `,
    },
    {
      anchor: 'T', at: [22, 23], mode: 'paint', legend: LEGEND,
      grid: `
        .....J...
        .....J...
        .....h...
        .....J...
        .....h...
        .....J...
        .........
        .........
        .........
        .........
        .........
        JJJJ..JJJ
      `,
    },
    {
      anchor: 'T', at: [29, 26], mode: 'paint', legend: LEGEND,
      grid: `
        ff
        ff
      `,
    },
    {
      anchor: 'T', at: [32, 27], mode: 'paint', legend: LEGEND, parts: ['A'],
      grid: `
        f
        f
      `,
    },
    {
      anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND,
      grid: `
        jjjjjjjjjjjjjj
        KKKKKKKKKKKKKK
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', at: [23, 22], mode: 'cover', legend: LEGEND,
      grid: `
        hhhhh
      `,
    },
    {
      anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND,
      grid: `
        jjjjjjjjjjjjjj
        KKKKKKKKKKKKKK
      `,
    },
  ],
  'up-right': [
    {
      anchor: 'T', at: [21, 22], mode: 'cover', legend: LEGEND,
      grid: `
        hhhhh
      `,
    },
    {
      anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND,
      grid: `
        jjjjjjjjjjjjjj
        KKKKKKKKKKKKKK
      `,
    },
  ],
};
