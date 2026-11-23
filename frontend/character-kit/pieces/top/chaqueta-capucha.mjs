/**
 * Parte de arriba: chaqueta abierta con capucha (forro de color) sobre una
 * camiseta. Ranuras: `top` (chaqueta), `accent` (forro de la capucha),
 * `inner` (camiseta).
 *
 * `coverage` viste las regiones del maniquí (sigue sola a la caminata porque
 * se aplica por etiqueta, cuadro a cuadro). Los `overlays` añaden la abertura,
 * el cuello y el bajo, anclados al torso o a la pelvis.
 *
 * Leyenda de overlays: i camiseta · x borde de la abertura (chaqueta, tono
 * profundo) · f forro · F forro en sombra · j chaqueta · J chaqueta en tono
 * profundo (costura/borde de capucha).
 */

import { TOP_CHAQUETA_PORTRAIT } from './chaqueta-capucha.portrait.mjs';
import { DIAGONAL } from './chaqueta-capucha.diagonal.mjs';

const LEGEND = {
  i: { mat: 'inner' },
  x: { mat: 'top', tone: 3 },
  f: { mat: 'accent' },
  F: { mat: 'accent', tone: 2 },
  j: { mat: 'top' },
  J: { mat: 'top', tone: 3 },
};

export default {
  id: 'chaqueta-capucha',
  kind: 'top',
  portrait: TOP_CHAQUETA_PORTRAIT,
  coverage: { T: 'top', a: 'top', b: 'top', A: 'top', B: 'top' },
  /** Puños: la última fila del antebrazo en tono profundo. */
  edges: [{ labels: ['b', 'B'], edge: 'bottom', tone: 3 }],
  views: {
    ...DIAGONAL,
    down: [
      {
        anchor: 'T', at: [17, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ...ffiiiiiff...
          ..fffiiiiifff..
          ...ffxiiixff...
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          ..J..xiiix..J..
          ..J..xiiix..J..
          .....xiiix.....
        `,
      },
      {
        // Bajo de la chaqueta sobre la cadera (la abertura sigue hasta el borde).
        anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND,
        grid: `
          jjjjjxiiixjjjjj
          jjjjjxiiixjjjjj
          jjjjjxiiixjjjjj
        `,
      },
    ],
    up: [
      {
        // Capucha caída sobre la espalda: borde de forro arriba y contorno en U.
        anchor: 'T', at: [17, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ...fffffffff...
          ..J.........J..
          ...J.......J...
          ....JJJJJJJ....
        `,
      },
      {
        anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND,
        grid: `
          jjjjjjjjjjjjjjj
          jjjjjjjjjjjjjjj
          jjjjjjjjjjjjjjj
        `,
      },
    ],
    left: [
      {
        // Perfil: el forro y el cuello de la camiseta asoman en el escote y el
        // borde delantero de la chaqueta baja hasta el bajo.
        anchor: 'T', at: [18, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ...ff....ff..
          ..fiF........
          .x...........
          x............
          x............
          x............
          .x...........
          .x...........
          ..x..........
          ..x..........
          ..x..........
          ..x..........
          ..x..........
          ..x..........
          ..x..........
        `,
      },
      {
        anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND,
        grid: `
          ..xjjjjjjjjjj
          ..xjjjjjjjjjj
          ..xjjjjjjjjjj
        `,
      },
    ],
  },
};
