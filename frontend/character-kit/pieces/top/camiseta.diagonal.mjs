/**
 * Vistas diagonales (tres cuartos) de top:camiseta.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [18, 23],
      grid: `
        JJ..JJJ
        .JJJJ..
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [17, 38],
      grid: `
        jjjjjjjjj
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [27, 23],
      grid: `
        .JJ
        J..
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [26, 38],
      grid: `
        jjjjj
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [24, 23],
      grid: `
        JJJJJJ
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [22, 38],
      grid: `
        jjjjjjjjj
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [17, 38],
      grid: `
        jjjjj
      `,
    },
  ],
};
