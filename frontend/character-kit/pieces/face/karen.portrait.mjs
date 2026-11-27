/**
 * Rostro de Karen — retrato 32×32 con sus seis estados. Parte del rostro de
 * retrato compartido (ojos de 2×3 con brillo, 6 px entre ellos, rubor) y le
 * suma lo que la distingue: cejas de 3 px bien marcadas, un píxel de delineado
 * en la esquina de fuera de cada ojo y labios rojo vino con el labio de abajo
 * más lleno. Su gesto de siempre es una sonrisa de labios cerrados que sube un
 * poco más de un lado: es el neutral, y el alegre la abre.
 *
 * Solo lo usa face:karen. Leyenda como portrait-face.mjs, más
 * l labio (literal `labios`) · L labio en sombra (literal `labiosSombra`).
 */

import { gridFrom, stamp } from '../../raster.mjs';
import { FACE_LEGEND } from './portrait-face.mjs';

const LEGEND = {
  ...FACE_LEGEND,
  l: { literal: 'labios' },
  L: { literal: 'labiosSombra' },
};

const EYES_X = [11, 19];

/** Delineado: un píxel en la esquina de fuera, a la altura de la fila de arriba del ojo. */
const LINER = row => [[10, row, 'k'], [21, row, 'k']];

const EYES = {
  open: x => [[x, 15, 'g'], [x + 1, 15, 'k'], [x, 16, 'k'], [x + 1, 16, 'k'], [x, 17, 'k'], [x + 1, 17, 'k']],
  low: x => [[x, 16, 'g'], [x + 1, 16, 'k'], [x, 17, 'k'], [x + 1, 17, 'k']],
  happy: x => [[x - 1, 16, 'k'], [x, 15, 'k'], [x + 1, 15, 'k'], [x + 2, 16, 'k']],
  side: x => [[x + 1, 15, 'g'], [x + 2, 15, 'k'], [x + 1, 16, 'k'], [x + 2, 16, 'k'], [x + 1, 17, 'k'], [x + 2, 17, 'k']],
  wide: x => [[x, 14, 'g'], [x + 1, 14, 'k'], [x, 15, 'k'], [x + 1, 15, 'k'], [x, 16, 'k'], [x + 1, 16, 'k'], [x, 17, 'k'], [x + 1, 17, 'k']],
};

/** Delineado por forma de ojo (null: el ojo ya lo dibuja). */
const LINER_ROW = { open: 15, low: 16, happy: null, side: 15, wide: 14 };

const BROWS = {
  flat: [[10, 13, 'b'], [11, 13, 'b'], [12, 13, 'b'], [19, 13, 'b'], [20, 13, 'b'], [21, 13, 'b']],
  worried: [[10, 13, 'b'], [11, 13, 'b'], [12, 12, 'b'], [19, 12, 'b'], [20, 13, 'b'], [21, 13, 'b']],
  raised: [[10, 12, 'b'], [11, 12, 'b'], [12, 12, 'b'], [19, 12, 'b'], [20, 12, 'b'], [21, 12, 'b']],
  knit: [[10, 13, 'b'], [11, 13, 'b'], [12, 13, 'b'], [13, 14, 'b'], [18, 14, 'b'], [19, 13, 'b'], [20, 13, 'b'], [21, 13, 'b']],
  high: [[10, 11, 'b'], [11, 11, 'b'], [12, 11, 'b'], [19, 11, 'b'], [20, 11, 'b'], [21, 11, 'b']],
};

const MOUTHS = {
  /** Sonrisa cerrada que sube del lado derecho de la pantalla. */
  smile: [[14, 21, 'l'], [15, 21, 'l'], [16, 21, 'l'], [17, 20, 'l'], [15, 22, 'L'], [16, 22, 'L']],
  grin: [[13, 20, 'l'], [14, 21, 'l'], [15, 21, 'l'], [16, 21, 'l'], [17, 21, 'l'], [18, 20, 'l'], [15, 22, 'L'], [16, 22, 'L']],
  flat: [[15, 21, 'l'], [16, 21, 'l'], [15, 22, 'L'], [16, 22, 'L']],
  frown: [[14, 21, 'l'], [15, 20, 'l'], [16, 20, 'l'], [17, 21, 'l'], [15, 21, 'L'], [16, 21, 'L']],
  short: [[16, 21, 'l'], [17, 21, 'l'], [18, 21, 'l'], [17, 22, 'L']],
  open: [[15, 20, 'l'], [16, 20, 'l'], [14, 21, 'l'], [15, 21, 'm'], [16, 21, 'm'], [17, 21, 'l'], [15, 22, 'L'], [16, 22, 'L']],
};

const BLUSH = [[9, 19, 'q'], [10, 19, 'q'], [21, 19, 'q'], [22, 19, 'q']];
const TENSION_LINES = [[14, 12, 'w'], [14, 13, 'w'], [17, 12, 'w'], [17, 13, 'w']];

const STATES = {
  neutral: { eyes: 'open', brows: 'flat', mouth: 'smile', blush: true },
  preocupada: { eyes: 'open', brows: 'worried', mouth: 'flat', blush: false },
  triste: { eyes: 'low', brows: 'worried', mouth: 'frown', blush: false },
  alegre: { eyes: 'happy', brows: 'raised', mouth: 'grin', blush: true },
  cautelosa: { eyes: 'side', brows: 'knit', mouth: 'short', blush: false },
  'en-crisis': { eyes: 'wide', brows: 'high', mouth: 'open', blush: false, tension: true },
};

function karenPortrait(state) {
  const s = STATES[state];
  const liner = LINER_ROW[s.eyes];
  const cells = [
    ...EYES_X.flatMap(EYES[s.eyes]),
    ...(liner === null ? [] : LINER(liner)),
    ...BROWS[s.brows],
    ...MOUTHS[s.mouth],
    ...(s.blush ? BLUSH : []),
    ...(s.tension ? TENSION_LINES : []),
  ];
  return [{ anchor: 'H', at: [0, 0], mode: 'paint', legend: LEGEND, grid: stamp(gridFrom(32, 32, () => '.'), cells) }];
}

export const KAREN_PORTRAIT = karenPortrait('neutral');
export const KAREN_EXPRESSIONS = Object.fromEntries(
  ['preocupada', 'triste', 'alegre', 'cautelosa', 'en-crisis'].map(state => [state, karenPortrait(state)]),
);
