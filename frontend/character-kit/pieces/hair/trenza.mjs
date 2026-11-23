/**
 * Peinado: trenza. Pelo recogido con la raya al medio y una trenza que cae
 * por delante del hombro izquierdo de la persona (a la derecha de la pantalla
 * de frente). Es asimétrica: de perfil izquierdo la trenza queda del lado
 * lejano (solo asoma en la nuca) y de perfil derecho cae delante del hombro.
 *
 * La trenza se dibuja con eslabones de 3 px (brillo arriba-izquierda, sombra
 * abajo-derecha) y una goma al final. Lo que baja del cuello se ancla a `T`.
 *
 * Leyenda: R pelo (la luz decide) · r sombra de eslabón, raya y goma · h brillo.
 */

import { gridFrom, stamp } from '../../raster.mjs';
import { headHalfWidth } from '../../busts/bust-a.mjs';
import { DIAGONAL } from './trenza.diagonal.mjs';
import { hairVolume } from './portrait-volume.mjs';

const LEGEND = {
  R: { mat: 'hair' },
  r: { mat: 'hair', tone: 3 },
  h: { mat: 'hair', tone: 0 },
};

/** Eslabones de trenza de 3 px de ancho desde (x, y0) hasta y1, con goma al final. */
function braid(x, y0, y1) {
  const cells = [];
  for (let y = y0; y <= y1; y++) {
    const link = (y - y0) % 2 === 0 ? ['h', 'R', 'r'] : ['R', 'h', 'r'];
    link.forEach((ch, i) => cells.push([x + i, y, ch]));
  }
  cells.push([x + 1, y1 + 1, 'r'], [x + 1, y1 + 2, 'R']);
  return cells;
}

/** Pasa celdas absolutas del cuadro a celdas relativas de una superposición en (ax, ay). */
const rel = (cells, ax, ay) => cells.map(([x, y, ch]) => [x - ax, y - ay, ch]);
const blank = (w, h) => gridFrom(w, h, () => '.');
/** Refleja una grilla de texto (x ↔ 48 − x) para pasar del perfil izquierdo al derecho. */
const mirrorRows = text => text.split('\n').map(r => r.trim()).filter(Boolean).map(r => [...r].reverse().join('')).join('\n');

// ── Vistas ────────────────────────────────────────────────────────────────────

const DOWN_HEAD = `
  ....RRRRRRRRRRR....
  ...RRRhhRRRRRRRR...
  ..RRhhRRRrRRRRRRR..
  .RRhRRRRrRrRRRRRRR.
  .RRRRRRRr.rRRRRRRR.
  .RRRRR.......RRRRR.
  .RRR...........RRR.
  ..R.............RR.
  ..R.............RRR
  ..R.............RRR
`;

const UP_HEAD = `
  ....RRRRRRRRRRR....
  ...RRRhhRRRRRRRR...
  ..RRhhRRRRRRRRRRR..
  .RRhRRRRRRRRRRRRRR.
  .RRRRRRRRRRRRRRRRR.
  .RRRRRRRRRRRRRRRRR.
  .RRRRRRRRRRRRRRRRR.
  ..RRRRRRRRRRRRRRR..
  ..RRRRRRRRRRRRRRR..
  ..RRRRRRRRRRRRRRR..
  ..RRRRRRRRRRRRRRR..
  ...RRRRRRRRRRRRR...
  ....RRRRRRRRRRR....
`;

/** Perfil izquierdo: recogido, la oreja a la vista y la trenza asomando en la nuca. */
const LEFT_HEAD = `
  ......RRRRRRRR......
  ....RRRhhRRRRRRR....
  ...RRhhRRRRRRRRRR...
  ..RRhRRRRRRRRRRRRR..
  ...RRRRRRRRRRRRRRRR.
  .....RRRRRRRRRRRRRR.
  .......RRRRRRRRRRRR.
  ........RR..RRRRRRRR
  ........RR..RRRRRRRR
  .........R..RRRRRRR.
  ............RRRRRR..
  .............RRRR...
  ..............RRR...
  ..............RRr...
`;

// Trenza de frente: nace detrás de la oreja derecha de la pantalla y cae sobre el hombro.
const DOWN_BRAID_HEAD = rel(braid(30, 16, 20), 15, 5).filter(([, y]) => y <= 15);
const DOWN_BRAID_BODY = rel(braid(29, 21, 29), 15, 21);
// De espalda: nace en la nuca y se va hacia el hombro izquierdo de la persona (izquierda de la pantalla).
const UP_BRAID_BODY = rel([...braid(19, 21, 22)].filter(([, y]) => y <= 22), 15, 21);
// Perfil derecho (mira a la derecha): la trenza sale de la nuca y cae delante del hombro, sobre el pecho.
const RIGHT_BRAID_HEAD = rel(braid(22, 17, 20), 12, 5).filter(([, y]) => y <= 15);
const RIGHT_BRAID_BODY = rel(braid(25, 21, 30), 12, 21);

// ── Retrato 32×32: recogido y la trenza sobre el hombro derecho de la pantalla ─

const CX = 15.5;
const portraitHair = gridFrom(32, 32, (x, y) => {
  if (y < 3 || y > 13) return '.';
  const head = headHalfWidth(Math.max(4, y));
  const half = y === 3 ? 2.5 : head + (y <= 9 ? 1 : 0);
  if (Math.abs(x - CX) > half) return '.';
  if (y <= 8) return x === 15 && y <= 6 ? 'r' : ((x === 10 && y === 6) || (x === 11 && y === 5) ? 'h' : 'R');
  return Math.abs(x - CX) > 6.5 && y <= 12 ? 'R' : '.';
});
const PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'cover', legend: LEGEND,
  grid: stamp(stamp(portraitHair, [[24, 13, 'R'], [25, 13, 'R'], [25, 14, 'R'], [26, 14, 'r'], [25, 15, 'R']]), braid(24, 16, 26)),
}];

export default {
  id: 'trenza',
  kind: 'hair',
  part: 'hair',
  z: 6,
  asymmetric: true,
  portrait: hairVolume('trenza', PORTRAIT),
  views: {
    ...DIAGONAL,
    down: [
      { anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND, grid: DOWN_HEAD },
      { anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND, grid: stamp(blank(19, 16), DOWN_BRAID_HEAD) },
      { anchor: 'T', at: [15, 21], mode: 'cover', legend: LEGEND, grid: stamp(blank(19, 12), DOWN_BRAID_BODY) },
    ],
    up: [
      { anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND, grid: UP_HEAD },
      { anchor: 'T', at: [15, 21], mode: 'cover', legend: LEGEND, grid: stamp(blank(19, 3), UP_BRAID_BODY) },
    ],
    left: [
      { anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND, grid: LEFT_HEAD },
    ],
    right: [
      // Espejo del perfil izquierdo: 20 columnas desde x = 15 pasan a empezar en x = 48 − 34 = 14.
      { anchor: 'H', at: [14, 5], mode: 'cover', legend: LEGEND, grid: mirrorRows(LEFT_HEAD) },
      { anchor: 'H', at: [12, 5], mode: 'cover', legend: LEGEND, grid: stamp(blank(19, 16), RIGHT_BRAID_HEAD) },
      { anchor: 'T', at: [12, 21], mode: 'cover', legend: LEGEND, grid: stamp(blank(19, 13), RIGHT_BRAID_BODY) },
    ],
  },
};
