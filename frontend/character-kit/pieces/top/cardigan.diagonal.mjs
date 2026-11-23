/**
 * Vistas diagonales (tres cuartos) de top:cardigan.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, x: {mat: 'top', tone: 3}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [18, 23],
      grid: `
        xiiiiix
        xiiiix.
        .xiix..
        .xiix..
        ..xx...
        ..xx...
        ...x...
        ...J...
        ...x...
        ...x...
        ...J...
        ...x...
        ...x...
        ...J...
        ...x...
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, x: {mat: 'top', tone: 3}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [17, 38],
      grid: `
        KKKKxKKKK
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, x: {mat: 'top', tone: 3}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [26, 23],
      grid: `
        iix
        ix.
        x..
        ...
        ...
        ...
        ...
        ...
        J..
        x..
        x..
        J..
        x..
        x..
        x..
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, x: {mat: 'top', tone: 3}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [27, 38],
      grid: `
        xKKK
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, x: {mat: 'top', tone: 3}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [24, 23],
      grid: `
        KKKKKK
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, x: {mat: 'top', tone: 3}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [22, 38],
      grid: `
        KKKKKKKKK
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, x: {mat: 'top', tone: 3}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [17, 38],
      grid: `
        KKKKK
      `,
    },
  ],
};
