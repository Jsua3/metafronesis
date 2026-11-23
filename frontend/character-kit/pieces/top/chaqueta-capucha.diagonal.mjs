/**
 * Vistas diagonales (tres cuartos) de top:chaqueta-capucha.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', mode: 'paint', legend: {i: {mat: 'inner'}, x: {mat: 'top', tone: 3}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}, j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [17, 23],
      grid: `
        .fiiiiff.
        ffiiiifff
        .fxiixff.
        ..xiix...
        ..xiix...
        ..xiix...
        ..xiix...
        ..xiix...
        ..xiix...
        ..xiix...
        ..xiix...
        ..xiix...
        J.xiix..J
        J.xiix..J
        ..xiix...
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {i: {mat: 'inner'}, x: {mat: 'top', tone: 3}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}, j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [17, 38],
      grid: `
        jjxiixjjj
        jjxiixjjj
        jjxiixjjj
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {i: {mat: 'inner'}, x: {mat: 'top', tone: 3}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}, j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [26, 23],
      grid: `
        ..ff
        .fiF
        x...
        ....
        ....
        ....
        x...
        x...
        .x..
        .x..
        .x..
        .x..
        .x..
        .x..
        .x..
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {i: {mat: 'inner'}, x: {mat: 'top', tone: 3}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}, j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [27, 38],
      grid: `
        xjjj
        xjjj
        xjjj
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', mode: 'paint', legend: {i: {mat: 'inner'}, x: {mat: 'top', tone: 3}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}, j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [22, 23],
      grid: `
        .fffffff.
        J.......J
        .J.....J.
        ..JJJJJJ.
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {i: {mat: 'inner'}, x: {mat: 'top', tone: 3}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}, j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [22, 38],
      grid: `
        jjjjjjjjj
        jjjjjjjjj
        jjjjjjjjj
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {i: {mat: 'inner'}, x: {mat: 'top', tone: 3}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}, j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [20, 23],
      grid: `
        ff
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {i: {mat: 'inner'}, x: {mat: 'top', tone: 3}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}, j: {mat: 'top'}, J: {mat: 'top', tone: 3}}, at: [17, 38],
      grid: `
        jjjjj
        jjjjj
        jjjjj
      `,
    },
  ],
};
