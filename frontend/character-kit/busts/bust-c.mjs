/**
 * Maniquí de retrato (busto) — complexión C. Cuadro 32×32, de frente.
 *
 * La cabeza, las orejas y el cuello son EXACTAMENTE los del busto A (misma
 * función de grilla), así el pelo y el rostro de retrato sirven en las tres
 * complexiones. Cambian los hombros: más redondeados, empiezan 1 px más adentro
 * y abren igual que A abajo.
 */

import { BUST_A, PORTRAIT_FRAME, bustGrid } from './bust-a.mjs';

/** Borde izquierdo de los hombros por fila; desde y = 29 queda en `rest`. */
const SHOULDER_LEFT = { 25: 11, 26: 7, 27: 5, 28: 4, rest: 3 };

export const BUST_C = {
  frame: PORTRAIT_FRAME,
  z: BUST_A.z,
  grid: bustGrid(SHOULDER_LEFT),
};
