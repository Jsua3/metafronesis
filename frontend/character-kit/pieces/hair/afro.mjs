/**
 * Peinado: afro. Volumen redondo alrededor de la cabeza, con textura de rizo
 * (brillo arriba a la izquierda, sombra abajo a la derecha) y el borde de la
 * frente suave. Peinado de volumen: la cabeza con pelo puede medir hasta 25 px
 * (decisión 14 del spec); el tope queda en y = 4 (y = 3 al respirar) para no
 * pasar de 66 px de alto.
 *
 * Las formas se autoran con geometría (elipses) y se guardan como grilla; el
 * perfil desplaza el volumen hacia la nuca. Simétrico: la derecha sale del
 * espejo de la izquierda.
 *
 * Leyenda: R pelo (la luz decide) · h brillo de rizo · r sombra de rizo.
 */

import { gridFrom } from '../../raster.mjs';
import { headHalfWidth } from '../../busts/bust-a.mjs';
import { DIAGONAL } from './afro.diagonal.mjs';
import { hairVolume } from './portrait-volume.mjs';

const LEGEND = {
  R: { mat: 'hair' },
  r: { mat: 'hair', tone: 3 },
  h: { mat: 'hair', tone: 0 },
};

/** Textura de rizo dispersa: brillo en la mitad iluminada (arriba-izquierda), sombra en la otra. */
function curl(x, y, cx, cy) {
  const k = (x + 3 * y) % 7;
  if (k === 0 && (x - cx) + (y - cy) < 0) return 'h';
  if ((x + 3 * y) % 11 === 5 && (x - cx) + (y - cy) > 2) return 'r';
  return 'R';
}

const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/** Vista de frente o de espalda (cuadro 48×72, coordenadas absolutas del reposo). */
function frontGrid(withFace) {
  return gridFrom(48, 20, (x, y) => {
    if (!inEllipse(x, y, 24, 11, 11.6, 7.8)) return '.';
    // La cara: desde la frente (y = 10) hacia abajo, entre las sienes.
    if (withFace && y >= 10 && Math.abs(x - 24) <= 6) return '.';
    if (withFace && y >= 15 && Math.abs(x - 24) <= 7) return '.';
    return curl(x, y, 24, 10);
  });
}

/** Perfil mirando a la izquierda: el volumen cae hacia la nuca y deja ver la cara. */
function sideGrid() {
  return gridFrom(48, 20, (x, y) => {
    if (!inEllipse(x, y, 25.5, 11, 10.6, 7.8)) return '.';
    if (y >= 9 && x <= 21) return '.';
    if (y >= 12 && x <= 23) return '.';
    return curl(x, y, 25, 10);
  });
}

// ── Retrato 32×32 ─────────────────────────────────────────────────────────────

const CX = 15.5;
const PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'cover', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    if (!inEllipse(x, y, CX, 11, 12.6, 9.2)) return '.';
    // Borde rizado: muescas en el contorno cada 3 píxeles.
    if (!inEllipse(x, y, CX, 11, 11.6, 8.2) && (x + y) % 3 === 0) return '.';
    const face = headHalfWidth(y);
    if (y >= 9 && face !== null && Math.abs(x - CX) <= Math.min(face, 7)) return '.';
    return curl(x, y, CX, 10);
  }),
}];

export default {
  id: 'afro',
  kind: 'hair',
  part: 'hair',
  z: 6,
  volume: true,
  portrait: hairVolume('afro', PORTRAIT),
  views: {
    ...DIAGONAL,
    down: [{ anchor: 'H', at: [0, 0], mode: 'cover', legend: LEGEND, grid: frontGrid(true) }],
    up: [{ anchor: 'H', at: [0, 0], mode: 'cover', legend: LEGEND, grid: frontGrid(false) }],
    left: [{ anchor: 'H', at: [0, 0], mode: 'cover', legend: LEGEND, grid: sideGrid() }],
  },
};
