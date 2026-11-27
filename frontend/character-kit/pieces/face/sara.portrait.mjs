/**
 * Rostro de Sara — retrato 32×32 con sus seis estados. Parte del rostro de
 * retrato compartido (ojos de 2×3 con brillo, 6 px entre ellos) y le suma lo
 * que la distingue: cejas arqueadas de 4 px, sin delineado, mejillas con más
 * rubor (2×2 por lado) y labios rosados naturales con el de abajo más lleno.
 * Su gesto de siempre es la sonrisa cerrada, que es el neutral; el alegre la
 * abre.
 *
 * Solo lo usa face:sara. Leyenda como portrait-face.mjs, más
 * l labio (literal `labiosRosa`) · L labio en sombra (literal `labiosRosaSombra`).
 */

import { gridFrom, stamp } from '../../raster.mjs';
import { FACE_LEGEND } from './portrait-face.mjs';

const LEGEND = {
  ...FACE_LEGEND,
  l: { literal: 'labiosRosa' },
  L: { literal: 'labiosRosaSombra' },
};

const EYES_X = [11, 19];

const EYES = {
  open: x => [[x, 15, 'g'], [x + 1, 15, 'k'], [x, 16, 'k'], [x + 1, 16, 'k'], [x, 17, 'k'], [x + 1, 17, 'k']],
  low: x => [[x, 16, 'g'], [x + 1, 16, 'k'], [x, 17, 'k'], [x + 1, 17, 'k']],
  happy: x => [[x - 1, 16, 'k'], [x, 15, 'k'], [x + 1, 15, 'k'], [x + 2, 16, 'k']],
  side: x => [[x + 1, 15, 'g'], [x + 2, 15, 'k'], [x + 1, 16, 'k'], [x + 2, 16, 'k'], [x + 1, 17, 'k'], [x + 2, 17, 'k']],
  wide: x => [[x, 14, 'g'], [x + 1, 14, 'k'], [x, 15, 'k'], [x + 1, 15, 'k'], [x, 16, 'k'], [x + 1, 16, 'k'], [x, 17, 'k'], [x + 1, 17, 'k']],
};

/** Cejas arqueadas de 4 px: el centro sube 1 px sobre los extremos. */
const brow = (left, [a, b, c, d]) => [[left, a, 'b'], [left + 1, b, 'b'], [left + 2, c, 'b'], [left + 3, d, 'b']];
const BROWS = {
  flat: [...brow(10, [13, 12, 12, 13]), ...brow(18, [13, 12, 12, 13])],
  /** Preocupación y tristeza: el extremo de dentro sube. */
  worried: [...brow(10, [13, 13, 12, 11]), ...brow(18, [11, 12, 13, 13])],
  raised: [...brow(10, [12, 11, 11, 12]), ...brow(18, [12, 11, 11, 12])],
  /** Levemente juntas (cautelosa): el extremo de dentro baja hacia el centro. */
  knit: [...brow(10, [12, 12, 13, 14]), ...brow(18, [14, 13, 12, 12])],
  high: [...brow(10, [11, 10, 10, 11]), ...brow(18, [11, 10, 10, 11])],
};

const MOUTHS = {
  /** Sonrisa cerrada: las comisuras suben y el labio de abajo, más lleno, en sombra. */
  smile: [[14, 20, 'l'], [15, 21, 'l'], [16, 21, 'l'], [17, 20, 'l'], [15, 22, 'L'], [16, 22, 'L']],
  grin: [[13, 20, 'l'], [14, 21, 'l'], [15, 21, 'l'], [16, 21, 'l'], [17, 21, 'l'], [18, 20, 'l'], [15, 22, 'L'], [16, 22, 'L']],
  flat: [[15, 21, 'l'], [16, 21, 'l'], [15, 22, 'L'], [16, 22, 'L']],
  frown: [[14, 21, 'l'], [15, 20, 'l'], [16, 20, 'l'], [17, 21, 'l'], [15, 21, 'L'], [16, 21, 'L']],
  short: [[16, 21, 'l'], [17, 21, 'l'], [18, 21, 'l'], [17, 22, 'L']],
  open: [[15, 20, 'l'], [16, 20, 'l'], [14, 21, 'l'], [15, 21, 'm'], [16, 21, 'm'], [17, 21, 'l'], [15, 22, 'L'], [16, 22, 'L']],
};

const BLUSH = [[9, 18, 'q'], [10, 18, 'q'], [9, 19, 'q'], [10, 19, 'q'], [21, 18, 'q'], [22, 18, 'q'], [21, 19, 'q'], [22, 19, 'q']];
const TENSION_LINES = [[14, 12, 'w'], [14, 13, 'w'], [17, 12, 'w'], [17, 13, 'w']];

const STATES = {
  neutral: { eyes: 'open', brows: 'flat', mouth: 'smile', blush: true },
  preocupada: { eyes: 'open', brows: 'worried', mouth: 'flat', blush: false },
  triste: { eyes: 'low', brows: 'worried', mouth: 'frown', blush: false },
  alegre: { eyes: 'happy', brows: 'raised', mouth: 'grin', blush: true },
  cautelosa: { eyes: 'side', brows: 'knit', mouth: 'short', blush: false },
  'en-crisis': { eyes: 'wide', brows: 'high', mouth: 'open', blush: false, tension: true },
};

function saraPortrait(state) {
  const s = STATES[state];
  const cells = [
    ...EYES_X.flatMap(EYES[s.eyes]),
    ...BROWS[s.brows],
    ...MOUTHS[s.mouth],
    ...(s.blush ? BLUSH : []),
    ...(s.tension ? TENSION_LINES : []),
  ];
  return [{ anchor: 'H', at: [0, 0], mode: 'paint', legend: LEGEND, grid: stamp(gridFrom(32, 32, () => '.'), cells) }];
}

export const SARA_PORTRAIT = saraPortrait('neutral');
export const SARA_EXPRESSIONS = Object.fromEntries(
  ['preocupada', 'triste', 'alegre', 'cautelosa', 'en-crisis'].map(state => [state, saraPortrait(state)]),
);
