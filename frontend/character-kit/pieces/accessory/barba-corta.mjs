/**
 * Accesorio: barba corta de pocos días, suave. Bigote, mandíbula y patillas en
 * sombra de piel (tono 2) y solo la punta de la perilla en piel profunda
 * (tono 3, el de la boca): se lee como barba sin oscurecer la cara ni tapar
 * la boca, y sirve con cualquier color de pelo. Pinta solo
 * sobre la cabeza; de espalda no se ve. Simétrica: el perfil derecho y las
 * diagonales derechas salen del espejo.
 *
 * Leyenda: s sombra de barba · b punta de la perilla.
 */

import { gridFrom } from '../../raster.mjs';

const LEGEND = {
  s: { mat: 'skin', tone: 2 },
  b: { mat: 'skin', tone: 3 },
};

/**
 * Retrato (cabeza de x 7-24): patillas junto a las orejas, bigote sobre la
 * boca (fila 19), mandíbula en sombra y punta de la perilla (filas 23-24).
 * Las mejillas (filas 19-20 a los lados) quedan libres para el rubor.
 * Las filas 20-21 dejan libre x 12-19, donde dibujan las bocas de las seis
 * expresiones.
 */
const PORTRAIT_CELLS = {
  s: [
    [13, 19], [14, 19], [15, 19], [16, 19], [17, 19], [18, 19],
    [11, 20], [20, 20],
    [11, 21], [12, 21], [19, 21], [20, 21],
    ...[11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(x => [x, 22]),
    [12, 23], [13, 23], [18, 23], [19, 23],
    [7, 15], [7, 16], [7, 17], [7, 18], [24, 15], [24, 16], [24, 17], [24, 18],
    [10, 21], [21, 21],
  ],
  b: [[14, 23], [15, 23], [16, 23], [17, 23], [15, 24], [16, 24]],
};
const portraitKey = (x, y) => `${x},${y}`;
const PORTRAIT_MAP = new Map(
  Object.entries(PORTRAIT_CELLS).flatMap(([ch, cells]) => cells.map(([x, y]) => [portraitKey(x, y), ch])),
);
const PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => PORTRAIT_MAP.get(portraitKey(x, y)) ?? '.'),
}];

export default {
  id: 'barba-corta',
  kind: 'accessory',
  portrait: PORTRAIT,
  views: {
    down: [{
      // Cabeza de x 17-31; boca en (23-24, 18), que queda libre.
      anchor: 'H', at: [17, 16], mode: 'paint', legend: LEGEND,
      grid: `
        s.............s
        .s...ssss....s.
        ..ss.s..s.ss...
        ...sssssssss...
        ......bbb......
      `,
    }],
    'down-left': [{
      // Rostro corrido hacia la izquierda: boca en (20-21, 18); la mejilla cercana, a la derecha.
      anchor: 'H', at: [17, 16], mode: 'paint', legend: LEGEND,
      grid: `
        ..............s
        ..ssss......ss.
        .s...s..ssss...
        ..sssssss......
        ....bbb........
      `,
    }],
    left: [{
      // Perfil: patilla delante de la oreja (x 24), bigote y perilla junto a la boca (x 17).
      anchor: 'H', at: [17, 15], mode: 'paint', legend: LEGEND,
      grid: `
        .......s
        .......s
        .ss...ss
        ..s.sss.
        .sssss..
        ..bb....
      `,
    }],
    up: [],
    'up-left': [],
  },
};
