/**
 * Rostro de Sara (avatar elegible hecho con permiso de la persona). Como el
 * sereno, pero con cejas de 4 px, más rubor en las mejillas y labios rosados
 * de 3 px. Solo pinta sobre la cabeza (modo `paint`); lo que tape el pelo
 * queda tapado. El perfil derecho sale del espejo del izquierdo.
 *
 * Solo lo usa la receta sara: no se ofrece en el editor del avatar.
 *
 * Leyenda: b ceja (pelo, tono profundo) · k ojo (color literal) ·
 * n sombra de nariz · l labios (literal `labiosRosa`) · q rubor (color literal).
 */

import { SARA_EXPRESSIONS, SARA_PORTRAIT } from './sara.portrait.mjs';
import { DIAGONAL } from './sara.diagonal.mjs';

const LEGEND = {
  b: { mat: 'hair', tone: 3 },
  k: { literal: 'eye' },
  n: { mat: 'skin', tone: 2 },
  l: { literal: 'labiosRosa' },
  q: { literal: 'blush' },
};

export default {
  id: 'sara',
  kind: 'face',
  portrait: SARA_PORTRAIT,
  expressions: SARA_EXPRESSIONS,
  views: {
    ...DIAGONAL,
    down: [{
      anchor: 'H', at: [16, 11], mode: 'paint', legend: LEGEND,
      grid: `
        ...bbbb...bbbb...
        .................
        .....k.....k.....
        .....k.....k.....
        .................
        ...qq....n..qq...
        .................
        .......lll.......
      `,
    }],
    up: [],
    left: [{
      anchor: 'H', at: [16, 11], mode: 'paint', legend: LEGEND,
      grid: `
        ..bbb
        .....
        ...k.
        ...k.
        .....
        .qn..
        .....
        .ll..
      `,
    }],
  },
};
