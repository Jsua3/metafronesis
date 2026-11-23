/**
 * Vistas diagonales (tres cuartos) de top:camisa.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', at: [20, 22], mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}},
      grid: `
        hh..hhhhh
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}}, at: [18, 23],
      grid: `
        hhJJhhh
        ..JJ...
        ...J...
        ...h...
        ...J...
        ...J...
        ...h...
        ...J...
        ...J...
        ...h...
        ...J...
        ...J...
        ...h...
        ...J...
        ...J...
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}}, at: [26, 23],
      grid: `
        .hJ
        J..
        ...
        ...
        ...
        ...
        ...
        J..
        J..
        h..
        .J.
        .J.
        .h.
        .J.
        .J.
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', at: [21, 22], mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}},
      grid: `
        hhhhhhh
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}}, at: [24, 23],
      grid: `
        JJJJJJ
      `,
    },
  ],
};
