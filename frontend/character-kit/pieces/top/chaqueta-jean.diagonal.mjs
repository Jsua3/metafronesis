/**
 * Vistas diagonales (tres cuartos) de top:chaqueta-jean.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', at: [20, 22], mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}, x: {mat: 'top', tone: 3}},
      grid: `
        hh..hhhhh
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}, x: {mat: 'top', tone: 3}}, at: [17, 23],
      grid: `
        .hhiihhh.
        .hxiixh..
        ..xiix...
        J.xiix.JJ
        ..xiix.J.
        ..xiix...
        ..xiix...
        ..xiix...
        ..xiix...
        ..xiix...
        ..xiix...
        ..xiix...
        ..xiix...
        ..xiix...
        ..xiix...
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}, x: {mat: 'top', tone: 3}}, at: [17, 38],
      grid: `
        KKxiixKKK
        KKxiixKKK
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}, x: {mat: 'top', tone: 3}}, at: [26, 23],
      grid: `
        .ih
        x..
        ...
        JJ.
        ...
        ...
        x..
        x..
        .x.
        .x.
        .x.
        .x.
        .x.
        .x.
        .x.
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}, x: {mat: 'top', tone: 3}}, at: [27, 38],
      grid: `
        xKKK
        xKKK
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', at: [21, 22], mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}, x: {mat: 'top', tone: 3}},
      grid: `
        hhhhhhh
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}, x: {mat: 'top', tone: 3}}, at: [22, 27],
      grid: `
        JJJJJJJJJ
        ....J....
        ....J....
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}, x: {mat: 'top', tone: 3}}, at: [22, 38],
      grid: `
        KKKKKKKKK
        KKKKKKKKK
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}, x: {mat: 'top', tone: 3}}, at: [17, 38],
      grid: `
        KKKKK
        KKKKK
      `,
    },
  ],
};
