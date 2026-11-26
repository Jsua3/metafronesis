/**
 * Paquete del kit (`kit.json`): compila la autoría (maniquíes, bustos, piezas,
 * rampas y recetas) al formato que consume el motor. Puro y determinista: no
 * escribe archivos (eso lo hace `build.mjs`).
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUSTS } from '../../character-kit/busts/index.mjs';
import { COMPLEXIONS } from '../../character-kit/mannequins/index.mjs';
import { PIECES } from '../../character-kit/pieces/index.mjs';
import { LITERAL_DEFAULTS, RAMPS } from '../../character-kit/ramps.mjs';
import {
  MIRROR_OF,
  PORTRAIT_STATES,
  SHEET_IDS,
  VIEW_ROWS,
  encodeLabelFrame,
  encodeRle,
  parseGrid,
} from '../../src/app/features/character/kit/kit-engine.ts';
import { rasterizeMannequin } from './mannequin-raster.mjs';

export const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const KIT_ROOT = path.join(FRONTEND_ROOT, 'character-kit');

const PIECE_KINDS = new Set(['hair', 'face', 'top', 'layer', 'bottom', 'shoes', 'accessory']);
const MODES = new Set(['paint', 'repaint', 'cover']);
const VIEW_KIND = Object.freeze({
  down: 'front', up: 'back', left: 'side', right: 'side',
  'down-left': 'front34', 'down-right': 'front34', 'up-left': 'back34', 'up-right': 'back34',
});

/** Grilla de autoría → RLE de las filas normalizadas (unidas con \n). */
export function compileGrid(text, where) {
  const rows = parseGrid(text);
  const joined = rows.join('\n');
  if (/\d/.test(joined)) throw new Error(`${where}: la grilla no puede contener dígitos`);
  return { rows, encoded: encodeRle(joined) };
}

function compileOverlay(overlay, where) {
  if (!MODES.has(overlay.mode)) throw new Error(`${where}: modo desconocido «${overlay.mode}»`);
  for (const sheet of overlay.sheets ?? []) {
    if (!SHEET_IDS.includes(sheet)) throw new Error(`${where}: hoja desconocida «${sheet}»`);
  }
  const { rows, encoded } = compileGrid(overlay.grid, where);
  for (const row of rows) {
    for (const ch of row) {
      if (ch === '.' || ch === ' ') continue;
      const spec = overlay.legend[ch];
      if (!spec) throw new Error(`${where}: símbolo «${ch}» sin leyenda`);
      if (overlay.mode === 'cover' && !spec.mat && !spec.literal) {
        throw new Error(`${where}: en modo cover «${ch}» necesita mat o literal`);
      }
    }
  }
  return { ...overlay, grid: encoded };
}

const compileList = (list, where) => list.map((o, i) => compileOverlay(o, `${where}[${i}]`));

/** Valida una pieza de autoría y codifica sus grillas. */
export function compilePiece(piece) {
  const key = `${piece.kind}:${piece.id}`;
  if (!PIECE_KINDS.has(piece.kind)) throw new Error(`pieza ${key}: tipo desconocido`);
  // Una pieza asimétrica dibuja sus vistas derechas: el espejo pondría el detalle en el lado contrario.
  if (piece.asymmetric) {
    for (const [right, left] of Object.entries(MIRROR_OF)) {
      const needed = right === 'right' || piece.views?.[left] !== undefined;
      if (needed && !piece.views?.[right]) throw new Error(`pieza ${key}: es asimétrica y le falta la vista ${right}`);
    }
  }
  for (const rule of piece.edges ?? []) {
    if (rule.edge !== 'bottom' && rule.edge !== 'top') throw new Error(`pieza ${key}: borde desconocido «${rule.edge}»`);
    if (rule.depth !== undefined && !(Number.isInteger(rule.depth) && rule.depth >= 1)) throw new Error(`pieza ${key}: depth debe ser un entero ≥ 1`);
  }
  const views = {};
  for (const [view, list] of Object.entries(piece.views ?? {})) {
    if (!VIEW_ROWS.includes(view)) throw new Error(`pieza ${key}: vista desconocida «${view}»`);
    views[view] = compileList(list, `pieza ${key} ${view}`);
  }
  const out = { ...piece, views };
  if (piece.portrait) out.portrait = compileList(piece.portrait, `pieza ${key} retrato`);
  if (piece.expressions) {
    out.expressions = {};
    for (const [state, list] of Object.entries(piece.expressions)) {
      if (!PORTRAIT_STATES.includes(state)) throw new Error(`pieza ${key}: estado de retrato desconocido «${state}»`);
      out.expressions[state] = compileList(list, `pieza ${key} ${state}`);
    }
  }
  return out;
}

/** Recetas fijas: `recipes/<id>.json` (las que empiezan por `_` no se publican). */
export function loadRecipes(dir = path.join(KIT_ROOT, 'recipes')) {
  const out = {};
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort()) {
    const recipe = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    if (`${recipe.id}.json` !== file) throw new Error(`receta ${file}: el id debe coincidir con el nombre del archivo`);
    out[recipe.id] = recipe;
  }
  return out;
}

export function buildBundle() {
  const complexions = {};
  for (const [id, def] of Object.entries(COMPLEXIONS)) {
    const frames = rasterizeMannequin(def);
    complexions[id] = Object.fromEntries(VIEW_ROWS.map(view => [view, {
      kind: VIEW_KIND[view],
      idle: frames[view].idle.map(encodeLabelFrame),
      walk: frames[view].walk.map(encodeLabelFrame),
    }]));
  }
  const busts = {};
  for (const [id, bust] of Object.entries(BUSTS)) {
    busts[id] = { grid: compileGrid(bust.grid, `busto ${id}`).encoded, z: bust.z };
  }
  const pieces = {};
  for (const piece of PIECES) {
    const key = `${piece.kind}:${piece.id}`;
    if (pieces[key]) throw new Error(`pieza duplicada ${key}`);
    pieces[key] = compilePiece(piece);
  }
  const catalog = JSON.parse(readFileSync(path.join(KIT_ROOT, 'catalog.json'), 'utf8'));
  return { schemaVersion: 1, complexions, busts, pieces, ramps: RAMPS, literals: LITERAL_DEFAULTS, recipes: loadRecipes(), catalog };
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortKeys(value[k])]));
  }
  return value;
}

/** JSON canónico del paquete: claves ordenadas, sin espacios y con salto final. */
export function stringifyBundle(bundle) {
  return `${JSON.stringify(sortKeys(bundle))}\n`;
}
