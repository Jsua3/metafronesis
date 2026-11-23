/**
 * Rostro sereno — versión retrato (32×32), con sus cinco expresiones. El
 * dibujo vive en portrait-face.mjs, compartido con el rostro maduro.
 */

import { faceExpressions, facePortrait } from './portrait-face.mjs';

export const SERENO_PORTRAIT = facePortrait('neutral');
export const SERENO_EXPRESSIONS = faceExpressions();
