/**
 * Maniquí — complexión C (adulta de complexión media, curvas suaves).
 *
 * Misma altura (64 px) y MISMA cabeza que A: cabeza, cuello, oreja, respiración,
 * bob y fases de brazos y piernas se toman de A, así el pelo y el rostro sirven
 * en las tres complexiones. Cambia el cuerpo: hombros redondeados como A, busto
 * 1 px más adelante de perfil, cintura marcada pero menos recogida que en A y
 * cadera de 17 px (A: 15), con muslos y brazos más llenos. En tres cuartos,
 * torso de 14 px que abre a una cadera de 16.
 *
 * Ninguna complexión es «de mujer» o «de hombre»: el editor deja elegir
 * cualquiera. Mismas etiquetas que A (ver complexion-a.mjs).
 */

import { COMPLEXION_A, FRAME } from './complexion-a.mjs';

const A = COMPLEXION_A.views;

// ── Grillas fijas ─────────────────────────────────────────────────────────────

/**
 * Frente/espalda: hombros redondeados de 15 px, busto de 15, cintura de 13 que
 * vuelve a abrir a 15 antes de la cadera.
 */
const TORSO_FRONT = {
  at: [16, 23],
  /** Misma fila de cintura que A (y = 33): las superposiciones se desplazan igual. */
  stretchRow: 10,
  grid: `
    ....TTTTTTTTT....
    ...TTTTTTTTTTT...
    ..TTTTTTTTTTTTT..
    .TTTTTTTTTTTTTTT.
    TTTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTTT
    .TTTTTTTTTTTTTTT.
    .TTTTTTTTTTTTTTT.
    ..TTTTTTTTTTTTT..
    ..TTTTTTTTTTTTT..
    ..TTTTTTTTTTTTT..
    .TTTTTTTTTTTTTTT.
    .TTTTTTTTTTTTTTT.
    TTTTTTTTTTTTTTTTT
  `,
};

/** Cadera de 19 px: 4 más que A. */
const PELVIS_FRONT = {
  at: [15, 38],
  grid: `
    .PPPPPPPPPPPPPPPPP.
    PPPPPPPPPPPPPPPPPPP
    PPPPPPPPPPPPPPPPPPP
    PPPPPPPPPPPPPPPPPPP
    PPPPPPPPPPPPPPPPPPP
    .PPPPPPPPPPPPPPPPP.
  `,
};

/** Perfil: busto 1 px más adelante que A (x = 17), cintura recogida y glúteo más lleno. */
const TORSO_SIDE = {
  at: [17, 23],
  stretchRow: 9,
  grid: `
    ....TTTTTTTT.
    ...TTTTTTTTTT
    ..TTTTTTTTTTT
    TTTTTTTTTTTTT
    TTTTTTTTTTTTT
    TTTTTTTTTTTTT
    .TTTTTTTTTTTT
    ..TTTTTTTTTTT
    ...TTTTTTTTTT
    ...TTTTTTTTT.
    ...TTTTTTTTT.
    ...TTTTTTTTT.
    ...TTTTTTTTTT
    ...TTTTTTTTTT
    ...TTTTTTTTTT
  `,
};

const PELVIS_SIDE = {
  at: [17, 38],
  grid: `
    ...PPPPPPPPPP..
    ...PPPPPPPPPPP.
    ...PPPPPPPPPPP.
    ...PPPPPPPPPPP.
    ...PPPPPPPPPP..
    ....PPPPPPPP...
  `,
};

// ── Tres cuartos (diagonales) ─────────────────────────────────────────────────

/** Torso de 14 px como A, cintura de 12 y cadera que vuelve a 14. */
const TORSO_QUARTER = {
  at: [17, 23],
  stretchRow: 10,
  grid: `
    ...TTTTTTTT...
    ..TTTTTTTTTT..
    .TTTTTTTTTTTT.
    TTTTTTTTTTTTTT
    TTTTTTTTTTTTTT
    TTTTTTTTTTTTTT
    TTTTTTTTTTTTTT
    TTTTTTTTTTTTTT
    .TTTTTTTTTTTT.
    .TTTTTTTTTTTT.
    .TTTTTTTTTTTT.
    .TTTTTTTTTTTT.
    .TTTTTTTTTTTT.
    TTTTTTTTTTTTTT
    TTTTTTTTTTTTTT
  `,
};

/** Cadera de 16 px (A: 14). */
const PELVIS_QUARTER = {
  at: [16, 38],
  grid: `
    .PPPPPPPPPPPPPP.
    PPPPPPPPPPPPPPPP
    PPPPPPPPPPPPPPPP
    PPPPPPPPPPPPPPPP
    PPPPPPPPPPPPPPPP
    .PPPPPPPPPPPPPP.
  `,
};

// ── Vistas ────────────────────────────────────────────────────────────────────

/** Los brazos cuelgan 1 px más afuera que en A para librar la cadera. */
const FRONT_LEFT_ARM_REST = { shoulder: [16, 24], elbow: [14, 33], wrist: [14, 42] };

export const COMPLEXION_C = {
  id: 'c',
  frame: FRAME,
  widths: {
    upperArm: [4, 4],
    forearm: [4, 4],
    thighFront: [9, 6],
    shinFront: [5, 4],
    thighSide: [9, 6],
    shinSide: [5, 4],
  },
  views: {
    down: {
      ...A.down,
      torso: TORSO_FRONT, pelvis: PELVIS_FRONT,
      armRest: FRONT_LEFT_ARM_REST,
    },
    up: {
      ...A.up,
      torso: TORSO_FRONT, pelvis: PELVIS_FRONT,
      armRest: FRONT_LEFT_ARM_REST,
    },
    left: {
      ...A.left,
      torso: TORSO_SIDE, pelvis: PELVIS_SIDE,
    },
    'down-left': {
      ...A['down-left'],
      torso: TORSO_QUARTER, pelvis: PELVIS_QUARTER,
      armNear: { shoulder: [30, 24], elbow: [30.5, 33], wrist: [30.5, 42] },
      armFar: { shoulder: [17.5, 24], elbow: [16, 33], wrist: [16, 42] },
    },
    'up-left': {
      ...A['up-left'],
      torso: TORSO_QUARTER, pelvis: PELVIS_QUARTER,
      armNear: { shoulder: [17.5, 24], elbow: [16, 33], wrist: [16, 42] },
      armFar: { shoulder: [30, 24], elbow: [31, 33], wrist: [31, 42] },
    },
  },
  sheets: COMPLEXION_A.sheets,
};
