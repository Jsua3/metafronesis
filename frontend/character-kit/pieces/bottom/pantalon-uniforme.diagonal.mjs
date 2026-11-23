/**
 * Vistas diagonales (tres cuartos) de bottom:pantalon-uniforme.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'P', mode: 'paint', legend: {K: {mat: 'bottom', tone: 2}, h: {mat: 'bottom', tone: 0}}, at: [17, 38],
      grid: `
        KKKhhKKKK
        ...hh....
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {K: {mat: 'bottom', tone: 2}, h: {mat: 'bottom', tone: 0}}, at: [27, 38],
      grid: `
        hKKK
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'P', mode: 'paint', legend: {K: {mat: 'bottom', tone: 2}, h: {mat: 'bottom', tone: 0}}, at: [22, 38],
      grid: `
        KKKKKKKKK
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {K: {mat: 'bottom', tone: 2}, h: {mat: 'bottom', tone: 0}}, at: [17, 38],
      grid: `
        KKKKK
      `,
    },
  ],
};
