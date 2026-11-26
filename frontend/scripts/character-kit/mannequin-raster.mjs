/**
 * Construye los cuadros etiquetados del maniquí (por vista y por cuadro) a
 * partir de su definición: grillas fijas + rig por cuadro.
 *
 * Salida: { [vista]: { idle: Frame[], walk: Frame[] } } con `part` = etiqueta
 * de la parte del cuerpo, `z` = profundidad y `far` = miembro lejano. Los
 * materiales (`mat`) los pone después la receta (vestir).
 */

import { FAR_LABELS, MIRROR_OF, createFrame, hasFarLimbs, inside, isEmptyChar, labelZ, mirrorFrame, parseGrid } from '../../src/app/features/character/kit/kit-engine.ts';

function stampGrid(frame, gridSpec, dx, dy, kind, opts = {}) {
  const rows = parseGrid(gridSpec.grid);
  const [ax, ay] = gridSpec.at;
  rows.forEach((row, r) => {
    let rowDy = dy;
    if (opts.lowerDy !== undefined && r >= opts.stretchRow) rowDy = opts.lowerDy;
    [...row].forEach((ch, c) => {
      if (isEmptyChar(ch)) return;
      put(frame, ax + c + dx, ay + r + rowDy, ch, kind);
    });
  });
  // Relleno del estiramiento (respiración): repite la fila de la cintura.
  if (opts.lowerDy !== undefined && opts.lowerDy - dy === 1) {
    const row = rows[opts.stretchRow];
    [...row].forEach((ch, c) => {
      if (!isEmptyChar(ch)) put(frame, ax + c + dx, ay + opts.stretchRow + dy, ch, kind);
    });
  }
}

function stampSprite(frame, sprite, left, top, label, kind, flipX = false) {
  const rows = parseGrid(sprite.grid);
  const w = rows[0].length;
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (!isEmptyChar(ch)) put(frame, left + (flipX ? w - 1 - c : c), top + r, label, kind);
    });
  });
}

/** Ancho de un sprite de grilla. */
function spriteWidth(sprite) {
  return parseGrid(sprite.grid)[0].length;
}

function put(frame, x, y, label, kind) {
  if (!inside(frame, x, y)) return;
  const i = y * frame.width + x;
  const z = labelZ(kind, label);
  // Gana lo que está delante: así el orden de estampado no importa.
  if (frame.part[i] !== null && frame.z[i] > z) return;
  frame.part[i] = label;
  frame.z[i] = z;
  frame.far[i] = hasFarLimbs(kind) && FAR_LABELS.has(label) ? 1 : 0;
}

/** Izquierda del tramo de ancho `w` centrado en `cx` (en índices de píxel). */
function spanLeft(cx, w) {
  return Math.round(cx - (w - 1) / 2);
}

/**
 * Rasteriza un segmento por filas: en cada fila entre las dos articulaciones
 * pinta un tramo horizontal interpolando centro y ancho. Devuelve el tramo de
 * la última fila (para anclar mano o pie).
 */
function rasterSegment(frame, p0, p1, w0, w1, label, kind) {
  const [x0, y0] = p0;
  const [x1, y1] = p1;
  const ys = Math.round(y0);
  const ye = Math.round(y1);
  let last = null;
  for (let y = ys; y <= ye; y++) {
    const t = ye === ys ? 1 : (y - ys) / (ye - ys);
    const cx = x0 + (x1 - x0) * t;
    const w = Math.max(1, Math.round(w0 + (w1 - w0) * t));
    const left = spanLeft(cx, w);
    for (let x = left; x < left + w; x++) put(frame, x, y, label, kind);
    last = { left, right: left + w - 1, y };
  }
  return last;
}

/**
 * Miembro de dos segmentos + sprite final (mano o pie). Con `mirrored` el
 * sprite se refleja y se ancla por el borde derecho del tramo (lado derecho de
 * la pantalla en las vistas de frente/espalda).
 */
function limb(frame, joints, widths, labels, sprite, kind, spriteLabel, mirrored = false) {
  const [w0, w1] = widths[0];
  const [w2, w3] = widths[1];
  rasterSegment(frame, joints[0], joints[1], w0, w1, labels[0], kind);
  const end = rasterSegment(frame, joints[1], joints[2], w2, w3, labels[1], kind);
  if (!sprite || !end) return;
  const top = end.y + sprite.anchor[1];
  if (mirrored) {
    const left = end.right - (spriteWidth(sprite) - 1) - sprite.anchor[0];
    stampSprite(frame, sprite, left, top, spriteLabel, kind, true);
  } else {
    stampSprite(frame, sprite, end.left + sprite.anchor[0], top, spriteLabel, kind);
  }
}

const add = (p, dx, dy) => [p[0] + dx, p[1] + dy];
const mirrorX = (p, pivotX) => [2 * pivotX - p[0], p[1]];

function buildFrontFrame(m, view, sheet, f) {
  const { width, height, pivotX } = m.frame;
  const frame = createFrame(width, height);
  const kind = 'front';
  const walk = sheet === 'walk';
  const bob = walk ? m.sheets.walk.bob[f] : 0;
  const breath = walk ? 0 : m.sheets.idle.breath[f];
  const upper = bob + breath;

  stampGrid(frame, view.head, 0, upper, kind);
  stampGrid(frame, view.neck, 0, upper, kind);
  stampGrid(frame, view.torso, 0, upper, kind, { stretchRow: view.torso.stretchRow, lowerDy: bob });
  stampGrid(frame, view.pelvis, 0, bob, kind);

  const n = view.legPhases.length;
  for (const side of ['left', 'right']) {
    const isLeft = side === 'left';
    const phaseIndex = walk ? (isLeft ? f : (f + n / 2) % n) : 2;
    const leg = view.legPhases[phaseIndex];
    const armDy = walk ? view.armPhases[phaseIndex] : 0;
    const flip = (p) => (isLeft ? p : mirrorX(p, pivotX));

    const rest = view.armRest;
    const arm = [
      flip(add(rest.shoulder, 0, upper)),
      flip(add(rest.elbow, 0, upper)),
      flip(add(rest.wrist, 0, upper + armDy)),
    ];
    const armLabels = isLeft ? ['a', 'b'] : ['A', 'B'];
    limb(frame, arm, [m.widths.upperArm, m.widths.forearm], armLabels, view.hand, kind, isLeft ? 'c' : 'C', !isLeft);

    const hip = flip([view.hip[0], view.hip[1] + bob]);
    const knee = flip(leg.knee);
    const ankle = flip(leg.ankle);
    const foot = view.feet[leg.foot];
    const legLabels = isLeft ? ['l', 'm'] : ['L', 'M'];
    limb(frame, [hip, knee, ankle], [m.widths.thighFront, m.widths.shinFront], legLabels, foot, kind, isLeft ? 'o' : 'O', !isLeft);
  }
  frame.motion = { upper, bob, waistY: view.torso.at[1] + view.torso.stretchRow };
  return frame;
}

function buildSideFrame(m, view, sheet, f) {
  const { width, height } = m.frame;
  const frame = createFrame(width, height);
  const kind = 'side';
  const walk = sheet === 'walk';
  const bob = walk ? m.sheets.walk.bob[f] : 0;
  const breath = walk ? 0 : m.sheets.idle.breath[f];
  const upper = bob + breath;

  stampGrid(frame, view.head, 0, upper, kind);
  stampGrid(frame, view.ear, 0, upper, kind);
  stampGrid(frame, view.neck, 0, upper, kind);
  stampGrid(frame, view.torso, 0, upper, kind, { stretchRow: view.torso.stretchRow, lowerDy: bob });
  stampGrid(frame, view.pelvis, 0, bob, kind);

  const n = view.legPhases.length;
  for (const near of [true, false]) {
    const phaseIndex = walk ? (near ? f : (f + n / 2) % n) : 2;
    const dx = near ? 0 : view.farOffset;

    const armPhase = view.armPhases[phaseIndex];
    const shoulder = add(view.armRest.shoulder, dx, upper);
    const arm = [shoulder, add(shoulder, ...armPhase.elbow), add(shoulder, ...armPhase.wrist)];
    limb(frame, arm, [m.widths.upperArm, m.widths.forearm], near ? ['a', 'b'] : ['A', 'B'], view.hand, kind, near ? 'c' : 'C');

    const leg = view.legPhases[phaseIndex];
    const hip = [view.hip[0] + dx, view.hip[1] + bob];
    const ankle = [leg.ankle[0] + dx, leg.ankle[1]];
    // Rodilla: punto medio empujado hacia delante (−x) según la flexión.
    const knee = [(hip[0] + ankle[0]) / 2 - leg.bend, (hip[1] + ankle[1]) / 2];
    const foot = view.feet[leg.foot];
    limb(frame, [hip, knee, ankle], [m.widths.thighSide, m.widths.shinSide], near ? ['l', 'm'] : ['L', 'M'], foot, kind, near ? 'o' : 'O');
  }
  frame.motion = { upper, bob, waistY: view.torso.at[1] + view.torso.stretchRow };
  return frame;
}

/** Huecos encerrados de hasta este tamaño se cierran (uno mayor es una abertura de verdad, p. ej. entre las piernas al dar el paso). */
const PINHOLE_MAX = 8;

/**
 * Cierra los huecos pequeños entre dos partes del cuerpo (pierna con pierna,
 * brazo lejano con tronco): los de 1 px de ancho y los encerrados de hasta
 * `PINHOLE_MAX` celdas. A este tamaño un hueco suelto se llena de contorno y
 * se lee como ruido. Lo rellena la parte vecina que queda más atrás.
 */
function closePinholes(frame) {
  const { width, height } = frame;
  const copy = (i, from) => {
    frame.part[i] = frame.part[from];
    frame.z[i] = frame.z[from];
    frame.far[i] = frame.far[from];
  };
  const narrow = [];
  for (let y = 0; y < height; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (frame.part[i] !== null || frame.part[i - 1] === null || frame.part[i + 1] === null) continue;
      narrow.push([i, frame.z[i - 1] <= frame.z[i + 1] ? i - 1 : i + 1]);
    }
  }
  for (const [i, from] of narrow) copy(i, from);

  // Regiones vacías que no tocan el borde del cuadro = encerradas por el cuerpo.
  const seen = new Uint8Array(width * height);
  for (let start = 0; start < width * height; start++) {
    if (frame.part[start] !== null || seen[start]) continue;
    const region = [];
    const around = new Set();
    let open = false;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      region.push(i);
      const x = i % width;
      const y = (i - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) open = true;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (frame.part[j] !== null) around.add(j);
        else if (!seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (open || region.length > PINHOLE_MAX) continue;
    let back = -1;
    for (const j of around) if (back < 0 || frame.z[j] < frame.z[back]) back = j;
    // `around` ya no cambia: se copia de una celda del cuerpo, no de otra del hueco.
    const source = { part: frame.part[back], z: frame.z[back], far: frame.far[back] };
    for (const i of region) { frame.part[i] = source.part; frame.z[i] = source.z; frame.far[i] = source.far; }
  }
}

/**
 * Tres cuartos (de frente o de espalda): como el perfil, distingue miembro
 * cercano y lejano, pero cada uno tiene su hombro y su cadera (el cuerpo está
 * girado 45°, no de canto). El braceo y el paso se dan como desplazamientos
 * sobre la pose de reposo; la rodilla se dobla hacia `kneeDir`.
 */
function buildQuarterFrame(m, view, sheet, f) {
  const { width, height } = m.frame;
  const frame = createFrame(width, height);
  const kind = view.kind;
  const walk = sheet === 'walk';
  const bob = walk ? m.sheets.walk.bob[f] : 0;
  const breath = walk ? 0 : m.sheets.idle.breath[f];
  const upper = bob + breath;

  stampGrid(frame, view.head, 0, upper, kind);
  if (view.ear) stampGrid(frame, view.ear, 0, upper, kind);
  stampGrid(frame, view.neck, 0, upper, kind);
  stampGrid(frame, view.torso, 0, upper, kind, { stretchRow: view.torso.stretchRow, lowerDy: bob });
  stampGrid(frame, view.pelvis, 0, bob, kind);

  const n = view.legPhases.length;
  for (const near of [true, false]) {
    const phaseIndex = walk ? (near ? f : (f + n / 2) % n) : 2;

    const rest = near ? view.armNear : view.armFar;
    const swing = view.armPhases[phaseIndex];
    // El brazo lejano bracea menos: casi todo queda tras el tronco y, si se abre, deja un hueco negro.
    const k = near ? 1 : view.farArmSwing ?? 1;
    const arm = [
      add(rest.shoulder, 0, upper),
      add(rest.elbow, swing.elbow[0] * k, upper + swing.elbow[1]),
      add(rest.wrist, swing.wrist[0] * k, upper + swing.wrist[1]),
    ];
    limb(frame, arm, [m.widths.upperArm, m.widths.forearm], near ? ['a', 'b'] : ['A', 'B'], view.hand, kind, near ? 'c' : 'C');

    const base = near ? view.legNear : view.legFar;
    const leg = view.legPhases[phaseIndex];
    const hip = [base.hip[0], base.hip[1] + bob];
    const ankle = add(base.ankle, leg.ankle[0], leg.ankle[1]);
    const knee = [(hip[0] + ankle[0]) / 2 + leg.bend * view.kneeDir[0], (hip[1] + ankle[1]) / 2 + leg.bend * view.kneeDir[1]];
    limb(frame, [hip, knee, ankle], [m.widths.thighFront, m.widths.shinFront], near ? ['l', 'm'] : ['L', 'M'], view.feet[leg.foot], kind, near ? 'o' : 'O');
  }
  closePinholes(frame);
  frame.motion = { upper, bob, waistY: view.torso.at[1] + view.torso.stretchRow };
  return frame;
}

const BUILDERS = { front: buildFrontFrame, back: buildFrontFrame, side: buildSideFrame, front34: buildQuarterFrame, back34: buildQuarterFrame };

/**
 * Cuadros etiquetados del maniquí para las 8 vistas. Las tres derechas son el
 * espejo de su izquierda (la luz se calcula más tarde, ya reflejada).
 */
export function rasterizeMannequin(m) {
  const out = {};
  for (const [name, view] of Object.entries(m.views)) {
    const build = BUILDERS[view.kind];
    if (!build) throw new Error(`complexión ${m.id}: vista ${name} de tipo desconocido «${view.kind}»`);
    out[name] = {};
    for (const [sheet, spec] of Object.entries(m.sheets)) {
      out[name][sheet] = Array.from({ length: spec.frames }, (_, f) => build(m, view, sheet, f));
    }
  }
  for (const [right, left] of Object.entries(MIRROR_OF)) {
    if (!out[left]) throw new Error(`complexión ${m.id}: falta la vista ${left}`);
    out[right] = {};
    for (const [sheet, frames] of Object.entries(out[left])) {
      out[right][sheet] = frames.map(fr => mirrorFrame(fr, m.frame.pivotX));
    }
  }
  return out;
}
