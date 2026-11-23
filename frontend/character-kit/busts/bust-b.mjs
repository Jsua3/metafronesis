/**
 * Maniquí de retrato (busto) — complexión B. Cuadro 32×32, de frente.
 *
 * La cabeza, las orejas y el cuello son EXACTAMENTE los del busto A (misma
 * función de grilla), así el pelo y el rostro de retrato sirven en las dos
 * complexiones. Cambian los hombros: caen menos y llegan 1 px más afuera.
 */

import { BUST_A, PORTRAIT_FRAME, bustGrid } from './bust-a.mjs';

/** Borde izquierdo de los hombros por fila; desde y = 29 queda en `rest`. */
const SHOULDER_LEFT = { 25: 9, 26: 6, 27: 4, 28: 3, rest: 2 };

export const BUST_B = {
  frame: PORTRAIT_FRAME,
  z: BUST_A.z,
  grid: bustGrid(SHOULDER_LEFT),
};
