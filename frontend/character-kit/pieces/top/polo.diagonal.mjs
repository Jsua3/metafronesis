/**
 * Vistas diagonales (tres cuartos) de top:polo.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', at: [20, 22], mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, i: {mat: 'inner'}},
      grid: `
        hh..hhhhh
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, i: {mat: 'inner'}}, at: [18, 23],
      grid: `
        hJJJJhh
        ..JJ...
        ...i...
        ...J...
        ...i...
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, i: {mat: 'inner'}}, at: [17, 38],
      grid: `
        jjjjjjjjj
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, i: {mat: 'inner'}}, at: [26, 23],
      grid: `
        .hJ
        iJ.
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, i: {mat: 'inner'}}, at: [26, 38],
      grid: `
        jjjjj
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', at: [21, 22], mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, i: {mat: 'inner'}},
      grid: `
        hhhhhhh
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, i: {mat: 'inner'}}, at: [24, 23],
      grid: `
        JJJJJJ
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, i: {mat: 'inner'}}, at: [22, 38],
      grid: `
        jjjjjjjjj
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, i: {mat: 'inner'}}, at: [17, 38],
      grid: `
        jjjjj
      `,
    },
  ],
};
