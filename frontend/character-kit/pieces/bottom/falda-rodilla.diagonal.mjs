/**
 * Vistas diagonales (tres cuartos) de bottom:falda-rodilla.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'P', mode: 'cover', legend: {S: {mat: 'bottom'}, J: {mat: 'bottom', tone: 3}}, at: [16, 38],
      grid: `
        .SSSSSSSSS......
        .SSSSSSSSS......
        .SSSSSSSSS......
        .SSSSSSSSS......
        .SSSSSSSSS......
        .SSSSSSSSS......
        .SSSSSSSSS......
        SSSSSSSSSS.....S
        SSSSSSSSSS.....S
        SSSSSSSSSS.....S
        SSSSSSSSSS.....S
        SSSSSSSSSS.....S
        SSSSSSSSSS.....S
        SSSSSSSSSS.....S
        JJJJJJJJJJ.....J
      `,
    },
    {
      anchor: 'P', mode: 'cover', legend: {S: {mat: 'bottom'}, J: {mat: 'bottom', tone: 3}}, at: [26, 38],
      grid: `
        .SSSS
        .SSSS
        .SSSS
        .SSSS
        .SSSS
        .SSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        JJJJJ
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'P', mode: 'cover', legend: {S: {mat: 'bottom'}, J: {mat: 'bottom', tone: 3}}, at: [16, 38],
      grid: `
        ......SSSSSSSSS.
        ......SSSSSSSSS.
        ......SSSSSSSSS.
        ......SSSSSSSSS.
        ......SSSSSSSSS.
        ......SSSSSSSSS.
        ......SSSSSSSSS.
        S.....SSSSSSSSSS
        S.....SSSSSSSSSS
        S.....SSSSSSSSSS
        S.....SSSSSSSSSS
        S.....SSSSSSSSSS
        S.....SSSSSSSSSS
        S.....SSSSSSSSSS
        J.....JJJJJJJJJJ
      `,
    },
    {
      anchor: 'P', mode: 'cover', legend: {S: {mat: 'bottom'}, J: {mat: 'bottom', tone: 3}}, at: [17, 38],
      grid: `
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        SSSSS
        JJJJJ
      `,
    },
  ],
};
