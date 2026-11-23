/**
 * Parte de abajo: falda recta a la rodilla, un poco abierta abajo. Ranura
 * `bottom`. La falda es un `cover` anclado a la pelvis (sigue al bob); las
 * piernas van en piel, así lo que asoma al dar el paso es pierna, no tela.
 * Como el cover respeta la profundidad, las manos quedan por delante.
 *
 * Leyenda: S falda (la luz decide) · J bajo (profundo).
 */

import { DIAGONAL } from './falda-rodilla.diagonal.mjs';

const LEGEND = {
  S: { mat: 'bottom' },
  J: { mat: 'bottom', tone: 3 },
};

const FRONT = `
  .SSSSSSSSSSSSSSS.
  .SSSSSSSSSSSSSSS.
  .SSSSSSSSSSSSSSS.
  .SSSSSSSSSSSSSSS.
  .SSSSSSSSSSSSSSS.
  .SSSSSSSSSSSSSSS.
  .SSSSSSSSSSSSSSS.
  SSSSSSSSSSSSSSSSS
  SSSSSSSSSSSSSSSSS
  SSSSSSSSSSSSSSSSS
  SSSSSSSSSSSSSSSSS
  SSSSSSSSSSSSSSSSS
  SSSSSSSSSSSSSSSSS
  SSSSSSSSSSSSSSSSS
  JJJJJJJJJJJJJJJJJ
`;

const SIDE = `
  ..SSSSSSSSSSS
  ..SSSSSSSSSSS
  ..SSSSSSSSSSS
  ..SSSSSSSSSSS
  ..SSSSSSSSSSS
  ..SSSSSSSSSSS
  .SSSSSSSSSSSS
  .SSSSSSSSSSSS
  .SSSSSSSSSSSS
  .SSSSSSSSSSSS
  .SSSSSSSSSSSS
  SSSSSSSSSSSSS
  SSSSSSSSSSSSS
  SSSSSSSSSSSSS
  JJJJJJJJJJJJJ
`;

export default {
  id: 'falda-rodilla',
  kind: 'bottom',
  slots: ['bottom'],
  coverage: { P: 'bottom', l: 'skin', m: 'skin', L: 'skin', M: 'skin' },
  views: {
    ...DIAGONAL,
    down: [{ anchor: 'P', at: [16, 38], mode: 'cover', legend: LEGEND, grid: FRONT }],
    up: [{ anchor: 'P', at: [16, 38], mode: 'cover', legend: LEGEND, grid: FRONT }],
    left: [{ anchor: 'P', at: [18, 38], mode: 'cover', legend: LEGEND, grid: SIDE }],
  },
};
