/**
 * Rostro sereno: cejas, ojos, nariz y boca. Solo pinta sobre la cabeza
 * (modo `paint`); lo que tape el pelo queda tapado. El perfil derecho sale
 * del espejo del izquierdo (el rostro es simétrico).
 *
 * Leyenda: b ceja (pelo, tono profundo) · k ojo (color literal) ·
 * n sombra de nariz · m boca (piel, tono profundo) · q rubor (color literal).
 */

import { SERENO_EXPRESSIONS, SERENO_PORTRAIT } from './sereno.portrait.mjs';
import { DIAGONAL } from './sereno.diagonal.mjs';

const LEGEND = {
  b: { mat: 'hair', tone: 3 },
  k: { literal: 'eye' },
  n: { mat: 'skin', tone: 2 },
  m: { mat: 'skin', tone: 3 },
  q: { literal: 'blush' },
};

export default {
  id: 'sereno',
  kind: 'face',
  portrait: SERENO_PORTRAIT,
  expressions: SERENO_EXPRESSIONS,
  views: {
    ...DIAGONAL,
    down: [{
      anchor: 'H', at: [16, 11], mode: 'paint', legend: LEGEND,
      grid: `
        ....bbb...bbb....
        .................
        .....k.....k.....
        .....k.....k.....
        .................
        ....q....n..q....
        .................
        .......mm........
      `,
    }],
    up: [],
    left: [{
      anchor: 'H', at: [16, 11], mode: 'paint', legend: LEGEND,
      grid: `
        ..bb.
        .....
        ...k.
        ...k.
        .....
        ..n..
        .....
        .m...
      `,
    }],
  },
};
