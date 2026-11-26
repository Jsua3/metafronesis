/**
 * Medidas del contrato de personajes (biblia v1 §1, enmendada por el spec de
 * personajes unificados §6 y §11). Funciones puras sobre RGBA y cuadros
 * vestidos; devuelven listas de errores legibles (vacía = cumple).
 */

import { FRAME, MIRROR_OF, PORTRAIT_FRAME, SHEETS, SHEET_IDS, VIEW_ROWS, decodeRle } from '../../src/app/features/character/kit/kit-engine.ts';

export const RULES = Object.freeze({
  axisX: 24,
  bodyBottom: [66, 68],
  opaqueHeight: [60, 66],
  /** Primeras 18 filas del cuerpo: ancho del tramo que cruza x = 24. */
  head: { from: 0, to: 17, width: [18, 21], volumeWidth: [18, 25], consecutive: 6, total: 8 },
  /** Diez filas siguientes: hombros de frente/espalda, fondo del torso en perfil. */
  shoulders: { from: 18, to: 27, front: [20, 27], side: [10, 16], quarter: [14, 25], consecutive: 3, total: 4 },
  /** Cráneo (etiqueta H) con contorno, de frente: el de la complexión A. */
  skullWidth: 17,
  stanceTolerance: 6,
  soleY: 66,
});

const SIDE_VIEWS = new Set(['left', 'right']);
const QUARTER_VIEWS = new Set(['down-left', 'down-right', 'up-left', 'up-right']);

/** Banda de hombros de una vista: rango admitido, nombre de la medida y clave en la geometría. */
function shoulderBand(view) {
  if (SIDE_VIEWS.has(view)) return { range: RULES.shoulders.side, label: 'fondo del torso', key: 'torsoDepth' };
  if (QUARTER_VIEWS.has(view)) return { range: RULES.shoulders.quarter, label: 'hombros en tres cuartos', key: 'shoulderWidth' };
  return { range: RULES.shoulders.front, label: 'hombros', key: 'shoulderWidth' };
}

function hex(rgba, i) {
  return `#${[rgba[i], rgba[i + 1], rgba[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Acceso a un cuadro (col, row) de una imagen; fuera del cuadro = transparente. */
export function cell(image, col, row, fw = FRAME.width, fh = FRAME.height) {
  const ox = col * fw;
  const oy = row * fh;
  const index = (x, y) => ((oy + y) * image.width + ox + x) * 4;
  const alpha = (x, y) => (x < 0 || y < 0 || x >= fw || y >= fh ? 0 : image.rgba[index(x, y) + 3]);
  return { fw, fh, index, alpha, color: (x, y) => hex(image.rgba, index(x, y)) };
}

/**
 * Tamaño, alfa binario, paleta, borde del cuadro vacío y contorno exterior
 * `#15131d` en cada cuadro de la imagen.
 */
export function checkImageContract(image, { name, fw, fh, cols, rows, palette, outline }) {
  const errors = [];
  if (image.width !== cols * fw || image.height !== rows * fh) {
    return [`${name}: mide ${image.width}×${image.height}; debe medir ${cols * fw}×${rows * fh}`];
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const c = cell(image, col, row, fw, fh);
      const where = `${name} [${col},${row}]`;
      let opaque = 0;
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          const a = c.alpha(x, y);
          if (a !== 0 && a !== 255) { errors.push(`${where}: alfa ${a} en (${x},${y}); solo 0 o 255`); continue; }
          if (a === 0) continue;
          opaque++;
          if (x === 0 || y === 0 || x === fw - 1 || y === fh - 1) errors.push(`${where}: píxel opaco en el borde (${x},${y})`);
          const color = c.color(x, y);
          if (!palette.has(color)) errors.push(`${where}: color ${color} fuera de la paleta en (${x},${y})`);
          const exterior = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => c.alpha(nx, ny) === 0);
          if (exterior && color !== outline) errors.push(`${where}: borde exterior ${color} en (${x},${y}); debe ser ${outline}`);
        }
      }
      if (opaque === 0) errors.push(`${where}: cuadro vacío`);
    }
  }
  return errors;
}

/** Componentes 4-conexos opacos de un cuadro. */
export function components(c) {
  const seen = new Set();
  const out = [];
  for (let y = 0; y < c.fh; y++) {
    for (let x = 0; x < c.fw; x++) {
      const key = y * c.fw + x;
      if (c.alpha(x, y) !== 255 || seen.has(key)) continue;
      const pixels = new Set([key]);
      const stack = [[x, y]];
      seen.add(key);
      let top = y;
      let bottom = y;
      while (stack.length) {
        const [px, py] = stack.pop();
        top = Math.min(top, py);
        bottom = Math.max(bottom, py);
        for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
          const nk = ny * c.fw + nx;
          if (c.alpha(nx, ny) !== 255 || seen.has(nk)) continue;
          seen.add(nk);
          pixels.add(nk);
          stack.push([nx, ny]);
        }
      }
      out.push({ pixels, top, bottom });
    }
  }
  return out;
}

/** Ancho del tramo opaco contiguo que cruza x = 24 en la fila y (0 si no cruza). */
export function centralWidth(body, fw, y) {
  const at = x => body.pixels.has(y * fw + x);
  if (!at(RULES.axisX)) return 0;
  let left = RULES.axisX;
  let right = RULES.axisX;
  while (left - 1 >= 0 && at(left - 1)) left--;
  while (right + 1 < fw && at(right + 1)) right++;
  return right - left + 1;
}

function bandErrors(body, fw, band, [min, max], label) {
  let total = 0;
  let run = 0;
  let longest = 0;
  const widths = [];
  for (let y = body.top + band.from; y <= body.top + band.to; y++) {
    const w = centralWidth(body, fw, y);
    widths.push(w);
    if (w >= min && w <= max) { total++; run++; longest = Math.max(longest, run); } else run = 0;
  }
  if (longest >= band.consecutive || total >= band.total) return [];
  return [`${label}: ${total} filas en ${min}-${max} px (${longest} seguidas); requiere ${band.consecutive} seguidas o ${band.total} en total. Anchos: ${widths.join(',')}`];
}

/** Extremos x de los pies (etiquetas o/O) y su fila más baja. */
function feet(dressed) {
  const out = { minX: Infinity, maxX: -Infinity, o: -1, O: -1 };
  for (let y = 0; y < dressed.height; y++) {
    for (let x = 0; x < dressed.width; x++) {
      const p = dressed.part[y * dressed.width + x];
      if (p !== 'o' && p !== 'O') continue;
      out.minX = Math.min(out.minX, x);
      out.maxX = Math.max(out.maxX, x);
      out[p] = Math.max(out[p], y);
    }
  }
  return out;
}

/** Reglas por cuadro de cuerpo: un componente, pies, altura, cabeza, hombros, apoyo. */
export function checkSpriteFrame(image, col, row, { name, view, dressed, volume = false }) {
  const errors = [];
  const where = `${name} ${view} [${col}]`;
  const c = cell(image, col, row);
  const parts = components(c);
  if (parts.length !== 1) return [`${where}: ${parts.length} componentes opacos; el personaje debe ser una sola silueta`];
  const body = parts[0];
  const [b0, b1] = RULES.bodyBottom;
  if (body.bottom < b0 || body.bottom > b1) errors.push(`${where}: el cuerpo termina en y=${body.bottom}; debe terminar entre ${b0} y ${b1}`);
  const height = body.bottom - body.top + 1;
  const [h0, h1] = RULES.opaqueHeight;
  if (height < h0 || height > h1) errors.push(`${where}: altura opaca ${height}; debe estar entre ${h0} y ${h1}`);
  errors.push(...bandErrors(body, c.fw, RULES.head, volume ? RULES.head.volumeWidth : RULES.head.width, `${where} cabeza`));
  const band = shoulderBand(view);
  errors.push(...bandErrors(body, c.fw, RULES.shoulders, band.range, `${where} ${band.label}`));
  if (dressed) {
    const f = feet(dressed);
    const center = (f.minX + f.maxX) / 2;
    if (!Number.isFinite(center) || Math.abs(center - RULES.axisX) > RULES.stanceTolerance) {
      errors.push(`${where}: centro del apoyo en x=${center}; debe quedar a ±${RULES.stanceTolerance} de ${RULES.axisX}`);
    }
  }
  return errors;
}

function bodyTop(image, col, row) {
  const parts = components(cell(image, col, row));
  return parts.length ? Math.min(...parts.map(p => p.top)) : null;
}

/** Respiración de 1 px en reposo, bob ≤ 1 px en caminata y apoyo doble en los contactos. */
export function checkAnimation(composed, name) {
  const errors = [];
  VIEW_ROWS.forEach((view, row) => {
    const idleTops = Array.from({ length: SHEETS.idle.frames }, (_, f) => bodyTop(composed.idle, f, row));
    const breath = Math.max(...idleTops) - Math.min(...idleTops);
    if (breath !== 1) errors.push(`${name} idle ${view}: respiración de ${breath} px (topes ${idleTops.join(',')}); debe ser 1`);
    const walkTops = Array.from({ length: SHEETS.walk.frames }, (_, f) => bodyTop(composed.walk, f, row));
    const bob = Math.max(...walkTops) - Math.min(...walkTops);
    if (bob > 1) errors.push(`${name} walk ${view}: bob de ${bob} px (topes ${walkTops.join(',')}); máximo 1`);
    if (SIDE_VIEWS.has(view) && composed.dressed) {
      for (const f of [0, 3]) {
        const ft = feet(composed.dressed.walk[view][f]);
        if (ft.o !== RULES.soleY || ft.O !== RULES.soleY) {
          errors.push(`${name} walk ${view} [${f}]: contacto con los pies en y=${ft.o} y y=${ft.O}; los dos deben pisar y=${RULES.soleY}`);
        }
      }
    }
  });
  return errors;
}

function isMirror(image, col, leftRow, rightRow, shift) {
  const l = cell(image, col, leftRow);
  const r = cell(image, col, rightRow);
  for (let y = 0; y < l.fh; y++) {
    for (let x = 0; x < l.fw; x++) {
      const mx = shift - x;
      const la = l.alpha(x, y);
      const ra = r.alpha(mx, y);
      if (la !== ra) return false;
      if (la && l.color(x, y) !== r.color(mx, y)) return false;
    }
  }
  return true;
}

/** Ninguna vista derecha puede ser el espejo exacto de su izquierda (ni con eje 47−x ni 48−x): la luz se recalcula. */
export function checkMirror(image, name, sheet) {
  const errors = [];
  const cols = image.width / FRAME.width;
  for (const [right, left] of Object.entries(MIRROR_OF)) {
    const leftRow = VIEW_ROWS.indexOf(left);
    const rightRow = VIEW_ROWS.indexOf(right);
    const what = right === 'right' ? 'la derecha es el espejo exacto de la izquierda' : `${right} es el espejo exacto de ${left}`;
    for (let col = 0; col < cols; col++) {
      for (const shift of [FRAME.width - 1, FRAME.width]) {
        if (isMirror(image, col, leftRow, rightRow, shift)) errors.push(`${name} ${sheet} [${col}]: ${what}`);
      }
    }
  }
  return errors;
}

/** Resumen geométrico por vista (reposo, cuadro 0) para el manifiesto. */
export function geometry(composed) {
  const out = {};
  VIEW_ROWS.forEach((view, row) => {
    const c = cell(composed.idle, 0, row);
    const [body] = components(c);
    const widest = (from, to) => Math.max(...Array.from({ length: to - from + 1 }, (_, k) => centralWidth(body, c.fw, body.top + from + k)));
    out[view] = {
      opaqueHeight: body.bottom - body.top + 1,
      headWidth: widest(RULES.head.from, RULES.head.to),
      [shoulderBand(view).key]: widest(RULES.shoulders.from, RULES.shoulders.to),
    };
  });
  return out;
}

/** Todas las reglas de un personaje compuesto (con `keepDressed`). */
export function checkCharacter(composed, { name, palette, outline, volume = false }) {
  const errors = [];
  for (const sheet of ['idle', 'walk']) {
    const image = composed[sheet];
    const cols = SHEETS[sheet].frames;
    errors.push(...checkImageContract(image, { name: `${name} ${sheet}`, fw: FRAME.width, fh: FRAME.height, cols, rows: VIEW_ROWS.length, palette, outline }));
    VIEW_ROWS.forEach((view, row) => {
      for (let col = 0; col < cols; col++) {
        errors.push(...checkSpriteFrame(image, col, row, { name: `${name} ${sheet}`, view, dressed: composed.dressed?.[sheet][view][col], volume }));
      }
    });
    errors.push(...checkMirror(image, name, sheet));
  }
  errors.push(...checkAnimation(composed, name));
  for (const [state, image] of Object.entries(composed.portraits)) {
    errors.push(...checkImageContract(image, { name: `${name} retrato ${state}`, fw: PORTRAIT_FRAME.width, fh: PORTRAIT_FRAME.height, cols: 1, rows: 1, palette, outline }));
  }
  return errors;
}

const HEAD_LABELS = new Set(['H', 'e', 'E']);

/**
 * Cráneo compartido: toda complexión tiene exactamente la cabeza de A (H, e, E
 * en las mismas celdas de cada vista y cuadro), y de frente mide 17 px con
 * contorno. Así el pelo sirve en todas las complexiones.
 */
export function checkSharedHead(bundle) {
  const errors = [];
  const ref = bundle.complexions.a;
  if (!ref) return ['falta la complexión a (referencia de la cabeza)'];
  const labels = decodeRle(ref.down.idle[0].labels);
  let skull = 0;
  for (let y = 0; y < FRAME.height; y++) {
    let run = 0;
    for (let x = 0; x < FRAME.width; x++) run = labels[y * FRAME.width + x] === 'H' ? run + 1 : run;
    skull = Math.max(skull, run ? run + 2 : 0);
  }
  if (skull !== RULES.skullWidth) errors.push(`complexión a: cráneo de ${skull} px con contorno; debe medir ${RULES.skullWidth}`);
  for (const [id, views] of Object.entries(bundle.complexions)) {
    if (id === 'a') continue;
    for (const view of VIEW_ROWS) {
      for (const sheet of SHEET_IDS) {
        views[view][sheet].forEach((enc, f) => {
          const a = decodeRle(ref[view][sheet][f].labels);
          const b = decodeRle(enc.labels);
          for (let i = 0; i < a.length; i++) {
            if ((HEAD_LABELS.has(a[i]) || HEAD_LABELS.has(b[i])) && a[i] !== b[i]) {
              errors.push(`complexión ${id} ${view}/${sheet} [${f}]: la cabeza no coincide con la de A en (${i % FRAME.width},${Math.floor(i / FRAME.width)})`);
              break;
            }
          }
        });
      }
    }
  }
  return errors;
}
