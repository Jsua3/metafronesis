/**
 * Accesorio: gafas. Montura fina de 1 px (literal `gafas`) alrededor de los
 * ojos, con el puente entre ellos; de perfil, el aro y la patilla hasta la
 * oreja. Pinta solo sobre la cabeza: lo que tape el pelo queda tapado.
 * Simétrico: el perfil derecho sale del espejo del izquierdo.
 *
 * Leyenda: g montura.
 */

import { gridFrom, stamp } from '../../raster.mjs';
import { DIAGONAL } from './gafas.diagonal.mjs';

const LEGEND = { g: { literal: 'gafas' } };

/**
 * Retrato: dos aros alrededor de los ojos de 2×3 (x 11-12 y 19-20, y 15-17),
 * con 1 px de piel a cada lado del ojo para que no se lean como gafas de sol,
 * y el puente entre ellos.
 */
const ring = x0 => {
  const cells = [];
  for (let x = x0 - 1; x <= x0 + 2; x++) cells.push([x, 14, 'g'], [x, 18, 'g']);
  for (let y = 15; y <= 17; y++) cells.push([x0 - 2, y, 'g'], [x0 + 3, y, 'g']);
  return cells;
};
const PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: stamp(gridFrom(32, 32, () => '.'), [...ring(11), ...ring(19), [15, 15, 'g'], [16, 15, 'g']]),
}];

export default {
  id: 'gafas',
  kind: 'accessory',
  portrait: PORTRAIT,
  views: {
    ...DIAGONAL,
    down: [{
      // Aro de 5 px alrededor del ojo de 1 px: queda piel dentro y no se lee como gafas de sol.
      anchor: 'H', at: [19, 12], mode: 'paint', legend: LEGEND,
      grid: `
        .ggg...ggg.
        g...ggg...g
        g...g.g...g
        .ggg...ggg.
      `,
    }],
    up: [],
    left: [{
      // Perfil: el cristal delante del ojo y la patilla hasta la oreja; el ojo queda entre ambos.
      anchor: 'H', at: [18, 12], mode: 'paint', legend: LEGEND,
      grid: `
        gg......
        g.gggggg
        g.......
        gg......
      `,
    }],
  },
};
