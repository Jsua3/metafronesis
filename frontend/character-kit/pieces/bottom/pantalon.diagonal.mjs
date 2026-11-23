/**
 * Vistas diagonales (tres cuartos) de bottom:pantalon.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'P', mode: 'paint', legend: {J: {mat: 'bottom', tone: 3}, h: {mat: 'bottom', tone: 0}}, at: [17, 38],
      grid: `
        JJJJhJJJJ
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {J: {mat: 'bottom', tone: 3}, h: {mat: 'bottom', tone: 0}}, at: [27, 38],
      grid: `
        hJJJ
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'P', mode: 'paint', legend: {J: {mat: 'bottom', tone: 3}, h: {mat: 'bottom', tone: 0}}, at: [22, 38],
      grid: `
        JJJJJJJJJ
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {J: {mat: 'bottom', tone: 3}, h: {mat: 'bottom', tone: 0}}, at: [17, 38],
      grid: `
        JJJJJ
      `,
    },
  ],
};
