/**
 * Retoques a mano (spec §4.6): una capa PNG por hoja de un personaje fijo,
 * transparente salvo los píxeles retocados. El build compone la hoja y pega
 * encima los píxeles opacos de la capa; un píxel magenta `#ff00ff` borra.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { KIT_ROOT } from './bundle.mjs';
import { decodePng } from './kit-png.mjs';

export const RETOUCH_ROOT = path.join(KIT_ROOT, 'retouch');
export const ERASE_HEX = '#ff00ff';
const ERASE = [255, 0, 255];

export function retouchPaths(id, sheet, root = RETOUCH_ROOT) {
  const dir = path.join(root, id);
  return {
    dir,
    layer: path.join(dir, `${sheet}.png`),
    meta: path.join(dir, `${sheet}.json`),
    edit: path.join(dir, `${sheet}.edit.png`),
  };
}

/** Capa guardada de una hoja, o null. `baseSha256` es la base sobre la que se retocó. */
export function loadRetouch(id, sheet, root = RETOUCH_ROOT) {
  const paths = retouchPaths(id, sheet, root);
  if (!existsSync(paths.layer)) return null;
  const meta = existsSync(paths.meta) ? JSON.parse(readFileSync(paths.meta, 'utf8')) : {};
  return { layer: decodePng(readFileSync(paths.layer)), baseSha256: meta.baseSha256 ?? null };
}

const isErase = (rgba, i) => rgba[i] === ERASE[0] && rgba[i + 1] === ERASE[1] && rgba[i + 2] === ERASE[2];

/** Hoja + capa → hoja retocada (copia). */
export function applyRetouch(image, layer) {
  if (layer.width !== image.width || layer.height !== image.height) {
    throw new Error(`retoque de ${layer.width}×${layer.height} sobre una hoja de ${image.width}×${image.height}`);
  }
  const rgba = image.rgba.slice();
  for (let i = 0; i < rgba.length; i += 4) {
    if (layer.rgba[i + 3] !== 255) continue;
    if (isErase(layer.rgba, i)) rgba.set([0, 0, 0, 0], i);
    else rgba.set(layer.rgba.subarray(i, i + 4), i);
  }
  return { width: image.width, height: image.height, rgba };
}

/** Diferencia entre la base y la hoja editada → capa de retoque. */
export function diffRetouch(base, edited) {
  if (base.width !== edited.width || base.height !== edited.height) throw new Error('la hoja editada cambió de tamaño');
  const rgba = new Uint8Array(base.rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = base.rgba.subarray(i, i + 4);
    const b = edited.rgba.subarray(i, i + 4);
    if (a[3] === 0 && b[3] === 0) continue;
    if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]) continue;
    rgba.set(b[3] === 0 ? [...ERASE, 255] : b, i);
  }
  return { width: base.width, height: base.height, rgba };
}

/** Paleta y alfa binario de la capa. */
export function checkRetouchLayer(layer, { name, palette }) {
  const errors = [];
  for (let i = 0; i < layer.rgba.length; i += 4) {
    const a = layer.rgba[i + 3];
    const x = (i / 4) % layer.width;
    const y = Math.floor(i / 4 / layer.width);
    if (a !== 0 && a !== 255) { errors.push(`${name}: alfa ${a} en (${x},${y}); solo 0 o 255`); continue; }
    if (a === 0) continue;
    const hex = `#${[0, 1, 2].map(k => layer.rgba[i + k].toString(16).padStart(2, '0')).join('')}`;
    if (hex !== ERASE_HEX && !palette.has(hex)) errors.push(`${name}: color ${hex} fuera de la paleta en (${x},${y})`);
  }
  return errors;
}
