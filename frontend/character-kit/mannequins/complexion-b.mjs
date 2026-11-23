/**
 * Maniquí — complexión B (adulta estilizada, torso recto).
 *
 * Misma altura (64 px) y MISMA cabeza que A: cabeza, cuello, oreja, respiración,
 * bob y fases de brazos y piernas se toman de A, así el pelo y el rostro sirven
 * en las dos complexiones. Cambia el cuerpo: hombros de 25-27 px con contorno,
 * torso recto sin cintura, brazos, manos y pies 1 px más grandes y perfil 1 px
 * más profundo. En tres cuartos, torso de 16 px (A: 14).
 *
 * Ninguna complexión es «de mujer» o «de hombre»: el editor deja elegir
 * cualquiera. Mismas etiquetas que A (ver complexion-a.mjs).
 */

import { COMPLEXION_A, FRAME } from './complexion-a.mjs';

const A = COMPLEXION_A.views;

// ── Grillas fijas ─────────────────────────────────────────────────────────────

/**
 * Frente/espalda: hombros cuadrados de 17 px que bajan rectos hasta un torso
 * de 15 (sin la cintura marcada de A); cadera de 15, como el torso.
 */
const TORSO_FRONT = {
  at: [16, 23],
  /** Misma fila de cintura que A (y = 33): las superposiciones se desplazan igual. */
  stretchRow: 10,
  grid: `
    ...TTTTTTTTTTT...
    .TTTTTTTTTTTTTTT.
    TTTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTTT
    .TTTTTTTTTTTTTTT.
    .TTTTTTTTTTTTTTT.
    .TTTTTTTTTTTTTTT.
    .TTTTTTTTTTTTTTT.
    .TTTTTTTTTTTTTTT.
    .TTTTTTTTTTTTTTT.
  `,
};

const PELVIS_FRONT = {
  at: [16, 38],
  grid: `
    .PPPPPPPPPPPPPPP.
    .PPPPPPPPPPPPPPP.
    .PPPPPPPPPPPPPPP.
    .PPPPPPPPPPPPPPP.
    .PPPPPPPPPPPPPPP.
    .PPPPPPPPPPPPPPP.
  `,
};

/** Perfil: pecho y espalda rectos, 13 px de fondo (A: 12). */
const TORSO_SIDE = {
  at: [18, 23],
  stretchRow: 9,
  grid: `
    ...TTTTTTTTT.
    ..TTTTTTTTTTT
    .TTTTTTTTTTTT
    TTTTTTTTTTTTT
    TTTTTTTTTTTTT
    TTTTTTTTTTTTT
    TTTTTTTTTTTTT
    TTTTTTTTTTTTT
    TTTTTTTTTTTTT
    TTTTTTTTTTTTT
    TTTTTTTTTTTTT
    TTTTTTTTTTTTT
    TTTTTTTTTTTTT
    TTTTTTTTTTTTT
    .TTTTTTTTTTTT
  `,
};

const PELVIS_SIDE = {
  at: [18, 38],
  grid: `
    .PPPPPPPPPPPP
    .PPPPPPPPPPPP
    .PPPPPPPPPPPP
    .PPPPPPPPPPPP
    .PPPPPPPPPPP.
    ..PPPPPPPPP..
  `,
};

// ── Manos y pies (1 px más grandes que en A) ──────────────────────────────────

const HAND_FRONT = { anchor: [0, 1], grid: `
    cccc
    cccc
    cccc
    .cc.
  ` };

const HAND_SIDE = { anchor: [0, 1], grid: `
    cccc
    cccc
    cccc
    .cc.
  ` };

const FOOT_FRONT = {
  flat: { anchor: [-3, 1], grid: `
    .ooooo.
    ooooooo
    ooooooo
    ooooooo
  ` },
  heel: { anchor: [-3, 1], grid: `
    .ooooo.
    ooooooo
    ooooooo
  ` },
};

/** Perfil mirando a la izquierda: la punta, 1 px más larga que en A. */
const FOOT_SIDE = {
  flat: { anchor: [-5, 1], grid: `
    .....oooo
    ....ooooo
    ..ooooooo
    ooooooooo
  ` },
  heelStrike: { anchor: [-5, 1], grid: `
    ooo..oooo
    ooooooooo
    .oooooooo
    .....oooo
    .......oo
  ` },
  toeOff: { anchor: [-4, 1], grid: `
    ....oooo
    ...ooooo
    ...oooo.
    ..oooo..
    .oooo...
    oooo....
  ` },
  lifted: { anchor: [-4, 1], grid: `
    ....oooo
    ...ooooo
    .ooooooo
    oooooo..
  ` },
};

// ── Tres cuartos (diagonales) ─────────────────────────────────────────────────

/** Hombros cuadrados de 16 px que bajan a un torso recto de 14. */
const TORSO_QUARTER = {
  at: [16, 23],
  stretchRow: 10,
  grid: `
    ...TTTTTTTTTT...
    .TTTTTTTTTTTTTT.
    TTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTTT
    .TTTTTTTTTTTTTT.
    .TTTTTTTTTTTTTT.
    .TTTTTTTTTTTTTT.
    .TTTTTTTTTTTTTT.
    .TTTTTTTTTTTTTT.
    .TTTTTTTTTTTTTT.
  `,
};

const PELVIS_QUARTER = {
  at: [16, 38],
  grid: `
    .PPPPPPPPPPPPPP.
    .PPPPPPPPPPPPPP.
    .PPPPPPPPPPPPPP.
    .PPPPPPPPPPPPPP.
    .PPPPPPPPPPPPPP.
    .PPPPPPPPPPPPPP.
  `,
};

/** Pies 1 px más largos que en A. */
const FOOT_QUARTER_FRONT = {
  flat: { anchor: [-4, 1], grid: `
    ....oooo
    ..oooooo
    oooooooo
    ooooooo.
  ` },
  heel: { anchor: [-4, 1], grid: `
    ....oooo
    ..oooooo
    ooooooo.
  ` },
  lifted: { anchor: [-4, 1], grid: `
    ....oooo
    ..oooooo
    oooooooo
  ` },
};

const FOOT_QUARTER_BACK = {
  flat: { anchor: [-3, 1], grid: `
    .oooooo.
    ooooooo.
    oooooooo
    ...ooooo
  ` },
  heel: { anchor: [-3, 1], grid: `
    .oooooo.
    ooooooo.
    ...ooooo
  ` },
  lifted: { anchor: [-3, 1], grid: `
    .oooooo.
    ooooooo.
    ..oooooo
  ` },
};

// ── Vistas ────────────────────────────────────────────────────────────────────

const FRONT_LEFT_ARM_REST = { shoulder: [16, 24], elbow: [14, 33], wrist: [14, 42] };
const SIDE_ARM_REST = { shoulder: [25, 24], elbow: [25, 33], wrist: [25, 42] };

export const COMPLEXION_B = {
  id: 'b',
  frame: FRAME,
  widths: {
    upperArm: [4, 4],
    forearm: [4, 4],
    thighFront: [7, 6],
    shinFront: [6, 4],
    thighSide: [8, 6],
    shinSide: [6, 4],
  },
  views: {
    down: {
      ...A.down,
      torso: TORSO_FRONT, pelvis: PELVIS_FRONT,
      hand: HAND_FRONT, feet: FOOT_FRONT,
      armRest: FRONT_LEFT_ARM_REST,
      hip: [20, 44],
    },
    up: {
      ...A.up,
      torso: TORSO_FRONT, pelvis: PELVIS_FRONT,
      hand: HAND_FRONT, feet: FOOT_FRONT,
      armRest: FRONT_LEFT_ARM_REST,
      hip: [20, 44],
    },
    left: {
      ...A.left,
      torso: TORSO_SIDE, pelvis: PELVIS_SIDE,
      hand: HAND_SIDE, feet: FOOT_SIDE,
      armRest: SIDE_ARM_REST,
    },
    'down-left': {
      ...A['down-left'],
      torso: TORSO_QUARTER, pelvis: PELVIS_QUARTER,
      hand: HAND_FRONT, feet: FOOT_QUARTER_FRONT,
      armNear: { shoulder: [30, 24], elbow: [30.5, 33], wrist: [30, 42] },
      armFar: { shoulder: [17, 24], elbow: [16, 33], wrist: [16, 42] },
    },
    'up-left': {
      ...A['up-left'],
      torso: TORSO_QUARTER, pelvis: PELVIS_QUARTER,
      hand: HAND_FRONT, feet: FOOT_QUARTER_BACK,
      armNear: { shoulder: [17, 24], elbow: [16.5, 33], wrist: [17, 42] },
      armFar: { shoulder: [31, 24], elbow: [32, 33], wrist: [32, 42] },
    },
  },
  sheets: COMPLEXION_A.sheets,
};
