/**
 * Vistas diagonales (tres cuartos) de top:uniforme-clinico.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, s: {mat: 'skin'}}, at: [17, 23],
      grid: `
        .JsssssJ
        .JssssJ.
        ..JssJ..
        ...JJ...
        ....J...
        JJ......
        JJ......
        JJ......
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, s: {mat: 'skin'}}, at: [17, 38],
      grid: `
        KKKKKKKKK
        KKKKKKKKK
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, s: {mat: 'skin'}}, at: [27, 23],
      grid: `
        ssJ
        sJ.
        J..
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, s: {mat: 'skin'}}, at: [26, 38],
      grid: `
        KKKKK
        KKKKK
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, s: {mat: 'skin'}}, at: [24, 23],
      grid: `
        JJJJJJ
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, s: {mat: 'skin'}}, at: [22, 38],
      grid: `
        KKKKKKKKK
        KKKKKKKKK
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, s: {mat: 'skin'}}, at: [17, 38],
      grid: `
        KKKKK
        KKKKK
      `,
    },
  ],
};
