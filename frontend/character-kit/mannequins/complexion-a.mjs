/**
 * Maniquí — complexión A (adulta estilizada, cintura marcada).
 *
 * Cuadro 48×72, pies en (24,68): la suela llega a y=66 y el contorno a y=67.
 * Altura opaca 64 px (pelo y=5 + contorno y=4 … contorno de suela y=67).
 *
 * Etiquetas del mapa (una por píxel):
 *   H cabeza · e/E oreja (izq./der. en pantalla; en perfil solo `e`, la cercana)
 *   N cuello · T torso · P pelvis
 *   a/A brazo · b/B antebrazo · c/C mano
 *   l/L muslo · m/M pierna · o/O pie
 * Minúscula = lado izquierdo de la pantalla (frente/espalda) o miembro CERCANO
 * (perfil). Mayúscula = lado derecho o miembro LEJANO.
 *
 * Cada vista declara grillas fijas (cabeza, cuello, torso, pelvis), sprites de
 * mano y pie, y un rig por cuadro: `bob` (sube/baja el cuerpo sobre la cadera),
 * `breath` (respiración: hombros y cabeza suben 1 px) y articulaciones de
 * brazos y piernas. Las vistas derechas NO se dibujan: salen del espejo de su
 * izquierda y la luz se recalcula después.
 *
 * Tres cuartos (`down-left`, `up-left`): como en el perfil, minúscula = miembro
 * CERCANO y mayúscula = LEJANO. Mirando abajo-izquierda el lado cercano queda a
 * la derecha de la pantalla; mirando arriba-izquierda, a la izquierda.
 */

export const FRAME = { width: 48, height: 72, pivotX: 24, pivotY: 68 };

// ── Grillas fijas ─────────────────────────────────────────────────────────────

const HEAD_FRONT = {
  at: [16, 6],
  grid: `
    ...HHHHHHHHHHH...
    ..HHHHHHHHHHHHH..
    .HHHHHHHHHHHHHHH.
    .HHHHHHHHHHHHHHH.
    .HHHHHHHHHHHHHHH.
    .HHHHHHHHHHHHHHH.
    eHHHHHHHHHHHHHHHE
    eHHHHHHHHHHHHHHHE
    eHHHHHHHHHHHHHHHE
    .HHHHHHHHHHHHHHH.
    .HHHHHHHHHHHHHHH.
    ..HHHHHHHHHHHHH..
    ...HHHHHHHHHHH...
    ....HHHHHHHHH....
    ......HHHHH......
  `,
};

const NECK_FRONT = { at: [22, 21], grid: `
    NNNNN
    NNNNN
  ` };

const TORSO_FRONT = {
  at: [17, 23],
  /** Fila (relativa) que se estira al respirar: la cintura. */
  stretchRow: 10,
  grid: `
    ...TTTTTTTTT...
    ..TTTTTTTTTTT..
    .TTTTTTTTTTTTT.
    TTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTT
    TTTTTTTTTTTTTTT
    .TTTTTTTTTTTTT.
    .TTTTTTTTTTTTT.
    .TTTTTTTTTTTTT.
    .TTTTTTTTTTTTT.
    .TTTTTTTTTTTTT.
    .TTTTTTTTTTTTT.
  `,
};

const PELVIS_FRONT = {
  at: [17, 38],
  grid: `
    .PPPPPPPPPPPPP.
    PPPPPPPPPPPPPPP
    PPPPPPPPPPPPPPP
    PPPPPPPPPPPPPPP
    PPPPPPPPPPPPPPP
    PPPPPPPPPPPPPPP
  `,
};

const HEAD_SIDE = {
  at: [16, 6],
  grid: `
    .....HHHHHHHH...
    ...HHHHHHHHHHHH.
    ..HHHHHHHHHHHHHH
    .HHHHHHHHHHHHHHH
    .HHHHHHHHHHHHHHH
    .HHHHHHHHHHHHHHH
    ..HHHHHHHHHHHHHH
    ..HHHHHHHHHHHHHH
    .HHHHHHHHHHHHHHH
    HHHHHHHHHHHHHHH.
    .HHHHHHHHHHHHHH.
    ..HHHHHHHHHHHH..
    .HHHHHHHHHHHH...
    ..HHHHHHHHH.....
    ...HHHH.........
  `,
};

const EAR_SIDE = { at: [25, 12], grid: `
    ee
    ee
    ee
    e.
  ` };

const NECK_SIDE = { at: [23, 19], grid: `
    ..NNNN
    NNNNNN
    NNNNNN
    NNNNNN
  ` };

/** Perfil: busto adelante (x=18), omóplato atrás, cintura recogida y glúteo. */
const TORSO_SIDE = {
  at: [18, 23],
  stretchRow: 9,
  grid: `
    ...TTTTTTTT.
    ..TTTTTTTTTT
    .TTTTTTTTTTT
    TTTTTTTTTTTT
    TTTTTTTTTTTT
    TTTTTTTTTTTT
    .TTTTTTTTTTT
    .TTTTTTTTTTT
    ..TTTTTTTTTT
    ..TTTTTTTTT.
    ..TTTTTTTTT.
    ..TTTTTTTTT.
    ..TTTTTTTTT.
    ..TTTTTTTTT.
    ..TTTTTTTTTT
  `,
};

const PELVIS_SIDE = {
  at: [18, 38],
  grid: `
    ..PPPPPPPPPP.
    ..PPPPPPPPPPP
    ..PPPPPPPPPPP
    ..PPPPPPPPPPP
    ..PPPPPPPPPP.
    ...PPPPPPPP..
  `,
};

// ── Manos y pies ──────────────────────────────────────────────────────────────
// `anchor` = desplazamiento de la esquina superior izquierda del sprite respecto
// al píxel IZQUIERDO de la última fila de la muñeca/tobillo.

const HAND_FRONT = { anchor: [0, 1], grid: `
    ccc
    ccc
    ccc
    .c.
  ` };

const HAND_SIDE = { anchor: [0, 1], grid: `
    ccc
    ccc
    ccc
    .c.
  ` };

const FOOT_FRONT = {
  flat: { anchor: [-2, 1], grid: `
    .oooo.
    oooooo
    oooooo
    oooooo
  ` },
  /** Talón levantado: se ve menos empeine. */
  heel: { anchor: [-2, 1], grid: `
    .oooo.
    oooooo
    oooooo
  ` },
};

/** Pies de perfil mirando a la izquierda (la punta queda a la izquierda). */
const FOOT_SIDE = {
  flat: { anchor: [-4, 1], grid: `
    ....oooo
    ...ooooo
    .ooooooo
    oooooooo
  ` },
  heelStrike: { anchor: [-4, 1], grid: `
    oo..oooo
    oooooooo
    .ooooooo
    ....oooo
    ......oo
  ` },
  toeOff: { anchor: [-3, 1], grid: `
    ...oooo
    ..ooooo
    ..oooo.
    .oooo..
    oooo...
    ooo....
  ` },
  lifted: { anchor: [-3, 1], grid: `
    ...oooo
    ..ooooo
    .oooooo
    ooooo..
  ` },
};

// ── Vistas ────────────────────────────────────────────────────────────────────

/**
 * Brazo/pierna: articulaciones absolutas (en reposo, sin bob). El hombro y la
 * cadera se desplazan con `bob`; codo/rodilla y muñeca siguen al hombro salvo
 * el tobillo, que se ancla al suelo.
 */
const FRONT_LEFT_ARM_REST = { shoulder: [17, 24], elbow: [15, 33], wrist: [15, 42] };
const SIDE_ARM_REST = { shoulder: [24.5, 24], elbow: [24.5, 33], wrist: [24.5, 42] };

/** Fases de la pierna izquierda de frente (la derecha es su espejo, 3 cuadros desfasada). */
/**
 * En la vista 3/4 la profundidad es la y de pantalla: el pie que avanza hacia
 * la cámara pisa 1 px más abajo que el suelo de referencia y el que queda
 * atrás, 1-2 px más arriba.
 */
const FRONT_LEG_PHASES = [
  // contacto: pierna adelante, el pie pisa 1 px más cerca de la cámara.
  { knee: [21, 54], ankle: [21.5, 63], foot: 'flat' },
  // bajada: carga el peso sobre la pierna adelantada.
  { knee: [21, 54], ankle: [21.5, 63], foot: 'flat' },
  // paso: pierna de apoyo recta bajo el cuerpo.
  { knee: [21, 53], ankle: [21.5, 62], foot: 'flat' },
  // contacto atrás: talón arriba, el pie queda detrás.
  { knee: [21, 53], ankle: [21.5, 61], foot: 'heel' },
  // despegue: el pie se levanta.
  { knee: [21, 51], ankle: [21.5, 59], foot: 'heel' },
  // paso: rodilla hacia la cámara, pie en el aire.
  { knee: [21, 50], ankle: [21.5, 58], foot: 'flat' },
];

/** Muñeca izquierda de frente por fase (desplazamiento vertical de la mano). */
const FRONT_ARM_PHASES = [-1, -1, 0, 1, 1, 0];

/** Bob por cuadro de caminata (contactos en 0 y 3). */
const WALK_BOB = [1, 1, 0, 1, 1, 0];
/** Respiración por cuadro de reposo (1 px). */
const IDLE_BREATH = [0, 0, -1, -1];

/** Pierna cercana de perfil (mirando a la izquierda). La lejana es la misma con 3 cuadros de desfase. */
const SIDE_LEG_PHASES = [
  { ankle: [17.5, 61], bend: 0.5, foot: 'heelStrike' },
  { ankle: [21, 62], bend: 1.5, foot: 'flat' },
  { ankle: [24.5, 62], bend: 0, foot: 'flat' },
  { ankle: [30, 60], bend: 0.5, foot: 'toeOff' },
  { ankle: [28, 57], bend: 3, foot: 'lifted' },
  { ankle: [23, 57], bend: 3.5, foot: 'lifted' },
];

/** Brazo cercano de perfil: codo y muñeca relativos al hombro. */
const SIDE_ARM_PHASES = [
  { elbow: [2, 9], wrist: [4.5, 17] },
  { elbow: [1.5, 9], wrist: [3, 17.5] },
  { elbow: [0, 9], wrist: [0, 18] },
  { elbow: [-2, 9], wrist: [-5, 16.5] },
  { elbow: [-1.5, 9], wrist: [-3.5, 17.5] },
  { elbow: [0, 9], wrist: [0, 18] },
];

// ── Tres cuartos (diagonales) ─────────────────────────────────────────────────

/**
 * Cabeza girada 45° mirando a la izquierda: el mentón se corre hacia donde mira
 * y la nuca abulta a la derecha. Vale de frente y de espalda: la silueta de un
 * cráneo girado es la misma vista por delante que por detrás. 16 px (frente 17
 * con orejas, perfil 16).
 */
export const HEAD_QUARTER = {
  at: [16, 6],
  grid: `
    ....HHHHHHHHHH...
    ..HHHHHHHHHHHHH..
    .HHHHHHHHHHHHHHH.
    .HHHHHHHHHHHHHHHH
    .HHHHHHHHHHHHHHHH
    .HHHHHHHHHHHHHHHH
    .HHHHHHHHHHHHHHHH
    .HHHHHHHHHHHHHHHH
    .HHHHHHHHHHHHHHHH
    .HHHHHHHHHHHHHHH.
    .HHHHHHHHHHHHHHH.
    ..HHHHHHHHHHHHH..
    ..HHHHHHHHHHHH...
    ...HHHHHHHHH.....
    ....HHHHHH.......
  `,
};

/** De frente se ve la oreja del lado cercano (derecha de la pantalla), dentro de la silueta. */
export const EAR_QUARTER_FRONT = { at: [29, 12], grid: `
    ee
    ee
    ee
    e.
  ` };

/** De espalda la oreja cercana queda a la izquierda, vista desde atrás. */
export const EAR_QUARTER_BACK = { at: [18, 12], grid: `
    ee
    ee
    ee
    .e
  ` };

/** Cuello bajo el centro del cráneo: el mentón queda por delante (a la izquierda). */
export const NECK_QUARTER = { at: [22, 20], grid: `
    ...NNN
    NNNNNN
    NNNNNN
  ` };

/** Torso de 14 px (frente 15, perfil 12): pecho hacia donde mira, cintura recogida. */
const TORSO_QUARTER = {
  at: [17, 23],
  /** Misma fila de cintura que de frente (y = 33): las superposiciones se desplazan igual. */
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
    TTTTTTTTTTTTTT
    .TTTTTTTTTTTT.
    .TTTTTTTTTTTT.
    .TTTTTTTTTTTT.
    .TTTTTTTTTTTT.
    .TTTTTTTTTTTT.
    .TTTTTTTTTTTT.
  `,
};

const PELVIS_QUARTER = {
  at: [17, 38],
  grid: `
    .PPPPPPPPPPPP.
    PPPPPPPPPPPPPP
    PPPPPPPPPPPPPP
    PPPPPPPPPPPPPP
    PPPPPPPPPPPPPP
    .PPPPPPPPPPPP.
  `,
};

/** Pies de tres cuartos de frente: la punta mira abajo-izquierda. */
const FOOT_QUARTER_FRONT = {
  flat: { anchor: [-3, 1], grid: `
    ...oooo
    .oooooo
    ooooooo
    oooooo.
  ` },
  /** Despegue: talón arriba, se apoya la punta. */
  heel: { anchor: [-3, 1], grid: `
    ...oooo
    .oooooo
    oooooo.
  ` },
  lifted: { anchor: [-3, 1], grid: `
    ...oooo
    .oooooo
    ooooooo
  ` },
};

/** Pies de tres cuartos de espalda: el talón queda hacia la cámara y la punta se aleja arriba-izquierda. */
const FOOT_QUARTER_BACK = {
  flat: { anchor: [-2, 1], grid: `
    .ooooo.
    oooooo.
    ooooooo
    ..ooooo
  ` },
  heel: { anchor: [-2, 1], grid: `
    .ooooo.
    oooooo.
    ..ooooo
  ` },
  lifted: { anchor: [-2, 1], grid: `
    .ooooo.
    oooooo.
    .oooooo
  ` },
};

/**
 * Fases de la pierna cercana en tres cuartos: desplazamiento del tobillo
 * respecto al reposo, flexión de la rodilla y pie. La lejana es la misma con 3
 * cuadros de desfase. Avanzar es ir hacia donde mira el personaje: de frente,
 * abajo-izquierda (el pie que avanza baja 1 px, como en la vista de frente); de
 * espalda, arriba-izquierda (el pie que avanza sube). El vaivén lateral es
 * corto a propósito: con más, las piernas se cruzan y a este tamaño se funden.
 */
export const QUARTER_FRONT_LEG_PHASES = [
  { ankle: [-1.5, 1], bend: 0.5, foot: 'flat' },
  { ankle: [-1, 1], bend: 1, foot: 'flat' },
  { ankle: [0, 0], bend: 0, foot: 'flat' },
  { ankle: [1, -1], bend: 0.5, foot: 'heel' },
  { ankle: [1, -3], bend: 2.5, foot: 'lifted' },
  { ankle: [0, -4], bend: 3, foot: 'lifted' },
];

export const QUARTER_BACK_LEG_PHASES = [
  { ankle: [-1.5, -1], bend: 0.5, foot: 'flat' },
  { ankle: [-1, 0], bend: 1, foot: 'flat' },
  { ankle: [0, 0], bend: 0, foot: 'flat' },
  { ankle: [1, 1], bend: 0, foot: 'heel' },
  { ankle: [1, -2], bend: 2, foot: 'lifted' },
  { ankle: [0, -4], bend: 3, foot: 'lifted' },
];

/** Braceo del brazo cercano por fase de su pierna: el brazo va atrás cuando la pierna avanza. */
export const QUARTER_FRONT_ARM_PHASES = [
  { elbow: [1, 0], wrist: [2, -1] },
  { elbow: [1, 0], wrist: [1.5, -1] },
  { elbow: [0, 0], wrist: [0, 0] },
  { elbow: [-1, 0], wrist: [-2.5, 1] },
  { elbow: [-1, 0], wrist: [-1.5, 1] },
  { elbow: [0, 0], wrist: [0, 0] },
];

export const QUARTER_BACK_ARM_PHASES = [
  { elbow: [1, 0], wrist: [2, 1] },
  { elbow: [1, 0], wrist: [1.5, 1] },
  { elbow: [0, 0], wrist: [0, 0] },
  { elbow: [-1, 0], wrist: [-2.5, -1] },
  { elbow: [-1, 0], wrist: [-1.5, -1] },
  { elbow: [0, 0], wrist: [0, 0] },
];

export const COMPLEXION_A = {
  id: 'a',
  frame: FRAME,
  /** Ancho de los segmentos (inicio → fin). */
  widths: {
    upperArm: [3, 3],
    forearm: [3, 3],
    thighFront: [7, 5],
    shinFront: [5, 4],
    thighSide: [7, 5],
    shinSide: [5, 4],
  },
  views: {
    down: {
      kind: 'front',
      head: HEAD_FRONT, neck: NECK_FRONT, torso: TORSO_FRONT, pelvis: PELVIS_FRONT,
      hand: HAND_FRONT, feet: FOOT_FRONT,
      armRest: FRONT_LEFT_ARM_REST,
      hip: [20, 44],
      legPhases: FRONT_LEG_PHASES,
      armPhases: FRONT_ARM_PHASES,
    },
    up: {
      kind: 'back',
      head: HEAD_FRONT, neck: NECK_FRONT, torso: TORSO_FRONT, pelvis: PELVIS_FRONT,
      hand: HAND_FRONT, feet: FOOT_FRONT,
      armRest: FRONT_LEFT_ARM_REST,
      hip: [20, 44],
      legPhases: FRONT_LEG_PHASES,
      armPhases: FRONT_ARM_PHASES,
    },
    left: {
      kind: 'side',
      head: HEAD_SIDE, ear: EAR_SIDE, neck: NECK_SIDE, torso: TORSO_SIDE, pelvis: PELVIS_SIDE,
      hand: HAND_SIDE, feet: FOOT_SIDE,
      armRest: SIDE_ARM_REST,
      hip: [24, 44],
      farOffset: 1,
      legPhases: SIDE_LEG_PHASES,
      armPhases: SIDE_ARM_PHASES,
    },
    'down-left': {
      kind: 'front34',
      head: HEAD_QUARTER, ear: EAR_QUARTER_FRONT, neck: NECK_QUARTER, torso: TORSO_QUARTER, pelvis: PELVIS_QUARTER,
      hand: HAND_FRONT, feet: FOOT_QUARTER_FRONT,
      armNear: { shoulder: [29.5, 24], elbow: [30, 33], wrist: [29.5, 42] },
      armFar: { shoulder: [17.5, 24], elbow: [16.5, 33], wrist: [16.5, 42] },
      legNear: { hip: [27, 44], ankle: [26.5, 62] },
      legFar: { hip: [21, 44], ankle: [22, 61] },
      kneeDir: [-0.6, 0],
      farArmSwing: 0.5,
      legPhases: QUARTER_FRONT_LEG_PHASES,
      armPhases: QUARTER_FRONT_ARM_PHASES,
    },
    'up-left': {
      kind: 'back34',
      head: HEAD_QUARTER, ear: EAR_QUARTER_BACK, neck: NECK_QUARTER, torso: TORSO_QUARTER, pelvis: PELVIS_QUARTER,
      hand: HAND_FRONT, feet: FOOT_QUARTER_BACK,
      armNear: { shoulder: [18, 24], elbow: [17.5, 33], wrist: [18, 42] },
      armFar: { shoulder: [30.5, 24], elbow: [31.5, 33], wrist: [31.5, 42] },
      legNear: { hip: [21, 44], ankle: [21.5, 62] },
      legFar: { hip: [27, 44], ankle: [26, 61] },
      kneeDir: [-0.4, 0],
      farArmSwing: 0.5,
      legPhases: QUARTER_BACK_LEG_PHASES,
      armPhases: QUARTER_BACK_ARM_PHASES,
    },
  },
  sheets: {
    idle: { frames: 4, breath: IDLE_BREATH },
    walk: { frames: 6, bob: WALK_BOB },
  },
};
