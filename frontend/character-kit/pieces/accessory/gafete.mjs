/**
 * Accesorio: gafete de identificación colgado de una cinta, al centro del
 * pecho (el de hospital y comisaría). Literales `gafete` (tarjeta) y
 * `gafeteCinta` (cinta y franja de la tarjeta). De espalda se ve la cinta
 * detrás del cuello; de perfil, la tarjeta en el pecho. Simétrico.
 *
 * Leyenda: c cinta / franja · w tarjeta.
 */

import { gridFrom, stamp } from '../../raster.mjs';
import { DIAGONAL } from './gafete.diagonal.mjs';

const LEGEND = {
  c: { literal: 'gafeteCinta' },
  w: { literal: 'gafete' },
};

const PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: stamp(gridFrom(32, 32, () => '.'), [
    [12, 26, 'c'], [12, 27, 'c'], [13, 28, 'c'], [19, 26, 'c'], [19, 27, 'c'], [18, 28, 'c'],
    [14, 29, 'c'], [15, 29, 'c'], [16, 29, 'c'], [17, 29, 'c'],
  ]),
}];

export default {
  id: 'gafete',
  kind: 'accessory',
  portrait: PORTRAIT,
  views: {
    ...DIAGONAL,
    down: [{
      anchor: 'T', at: [21, 24], mode: 'paint', legend: LEGEND,
      grid: `
        .c...c.
        .c...c.
        ..c.c..
        ..ccc..
        ..www..
        ..www..
      `,
    }],
    up: [{
      anchor: 'T', at: [21, 23], mode: 'paint', legend: LEGEND,
      grid: '.ccccc.',
    }],
    left: [{
      anchor: 'T', at: [18, 24], mode: 'paint', legend: LEGEND,
      grid: `
        ..c
        .c.
        .c.
        cc.
        ww.
        ww.
      `,
    }],
  },
};
