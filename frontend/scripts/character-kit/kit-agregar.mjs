/**
 * Suma al kit publicado (`src/assets/characters/kit/`) lo que aún no tiene,
 * sin regenerar lo que ya existe:
 *
 *   - la complexión C (alta), derivada de los cuadros de B (ver
 *     `character-kit/mannequins/complexion-c.mjs`), y su busto (el de B);
 *   - las piezas de `character-kit/pieces/index.mjs` que falten en `kit.json`
 *     (o las que se pasen por clave, p. ej. `accessory:barba-corta`);
 *   - las recetas de `character-kit/recipes/` que falten (o las que se pasen
 *     por nombre), con sus hojas `idle`/`walk`, sus retratos y su entrada en
 *     `manifest.json`.
 *
 * Usa el mismo motor que el juego (`kit-engine.ts`), así que los píxeles son
 * los que dibuja el navegador.
 *
 *   node scripts/character-kit/kit-agregar.mjs [--comprobar] [receta | tipo:pieza ...]
 *
 * `--comprobar` no escribe nada: vuelve a componer las recetas ya publicadas y
 * falla si algún PNG no coincide con su `pixelSha256` del manifiesto.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT_SRC = path.join(FRONTEND, 'character-kit');
const OUT = path.join(FRONTEND, 'src', 'assets', 'characters', 'kit');
const href = file => pathToFileURL(path.join(FRONTEND, file)).href;

const E = await import(href('src/app/features/character/kit/kit-engine.ts'));
const { PIECES } = await import(href('character-kit/pieces/index.mjs'));
const { COMPLEXION_C } = await import(href('character-kit/mannequins/complexion-c.mjs'));

const args = process.argv.slice(2);
const checkOnly = args.includes('--comprobar');
const wanted = args.filter(a => !a.startsWith('--'));

const kitPath = path.join(OUT, 'kit.json');
const manifestPath = path.join(OUT, 'manifest.json');
const kit = JSON.parse(fs.readFileSync(kitPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// ── Complexión alta ───────────────────────────────────────────────────────────

export function liftFrame(encoded, { lift, drop = 0, stretchFrom, stretchTo }) {
  const { width: W, height: H } = E.FRAME;
  const labels = E.decodeRle(encoded.labels);
  const span = stretchTo + 1 - stretchFrom;
  const rows = [];
  for (let y = 0; y < H; y++) {
    let src;
    if (y < stretchFrom - lift) src = y + lift;
    else if (y <= stretchTo + drop) src = stretchFrom + Math.floor((y - (stretchFrom - lift)) * span / (span + lift + drop));
    else src = y - drop;
    rows.push(src < H ? labels.slice(src * W, src * W + W) : '.'.repeat(W));
  }
  return {
    labels: E.encodeRle(rows.join('')),
    motion: { ...encoded.motion, upper: encoded.motion.upper - lift, bob: encoded.motion.bob - lift },
  };
}

function deriveTall(spec) {
  const base = kit.complexions[spec.base];
  return Object.fromEntries(Object.entries(base).map(([view, v]) => [view, {
    kind: v.kind,
    idle: v.idle.map(f => liftFrame(f, spec)),
    walk: v.walk.map(f => liftFrame(f, spec)),
  }]));
}

// ── Piezas: módulo de autoría → formato del paquete ───────────────────────────

const packGrid = grid => E.encodeRle(E.parseGrid(grid).join('\n'));
const packList = list => list?.map(o => ({ ...o, grid: packGrid(o.grid) }));

export function packPiece(piece) {
  const out = { ...piece, views: Object.fromEntries(Object.entries(piece.views).map(([v, l]) => [v, packList(l)])) };
  if (piece.portrait) out.portrait = packList(piece.portrait);
  if (piece.expressions) out.expressions = Object.fromEntries(Object.entries(piece.expressions).map(([s, l]) => [s, packList(l)]));
  return JSON.parse(JSON.stringify(out));
}

// ── PNG RGBA sin dependencias ─────────────────────────────────────────────────

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = buf => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng({ width, height, rgba }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const pixelSha = img => createHash('sha256').update(img.rgba).digest('hex');

// ── Geometría del manifiesto (cuadro 0 de idle por vista) ─────────────────────
// Aproximación: coincide con la altura y el fondo del torso publicados, y con
// la mayoría de anchos de cabeza y hombros (el juego no lee estos campos).

export function geometry(composed, recipe) {
  const out = {};
  E.VIEW_ROWS.forEach((view, row) => {
    const sheet = composed.idle;
    const opaque = (x, y) => sheet.rgba[((row * E.FRAME.height + y) * sheet.width + x) * 4 + 3] > 0;
    let top = E.FRAME.height, bottom = -1;
    for (let y = 0; y < E.FRAME.height; y++) for (let x = 0; x < E.FRAME.width; x++) if (opaque(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    const labels = E.decodeRle(kit.complexions[recipe.complexion][view].idle[0].labels);
    /** Ancho opaco (con contorno) más grande entre las filas donde el maniquí tiene alguna de esas etiquetas. */
    const widthOf = chars => {
      let w = 0;
      for (let y = 0; y < E.FRAME.height; y++) {
        let hasLabel = false, left = E.FRAME.width, right = -1;
        for (let x = 0; x < E.FRAME.width; x++) {
          if (chars.includes(labels[y * E.FRAME.width + x])) hasLabel = true;
          if (opaque(x, y)) { left = Math.min(left, x); right = Math.max(right, x); }
        }
        if (hasLabel && right >= 0) w = Math.max(w, right - left + 1);
      }
      return w;
    };
    const g = { opaqueHeight: bottom - top + 1, headWidth: widthOf('HeE') };
    if (view === 'left' || view === 'right') g.torsoDepth = widthOf('T');
    else g.shoulderWidth = widthOf('T');
    out[view] = g;
  });
  return out;
}

// ── Recetas ───────────────────────────────────────────────────────────────────

function readRecipes() {
  const dir = path.join(KIT_SRC, 'recipes');
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

function publish(recipe) {
  const composed = E.composeCharacter(kit, recipe);
  const dir = path.join(OUT, recipe.id);
  fs.mkdirSync(dir, { recursive: true });
  const files = {};
  const write = (key, img) => {
    const rel = `${recipe.id}/${key}.png`;
    fs.writeFileSync(path.join(OUT, rel), encodePng(img));
    files[key] = { path: rel, width: img.width, height: img.height, pixelSha256: pixelSha(img) };
  };
  write('idle', composed.idle);
  write('walk', composed.walk);
  for (const state of recipe.portraits ?? ['neutral']) write(`portrait-${state}`, composed.portraits[state]);
  manifest.characters[recipe.id] = {
    displayName: recipe.displayName,
    kind: recipe.kind,
    complexion: recipe.complexion,
    provenance: recipe.provenance,
    geometry: geometry(composed, recipe),
    retouched: [],
    files,
  };
}

const sortKeys = v => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;

// ── Main ──────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain && checkOnly) {
  let bad = 0;
  for (const [id, entry] of Object.entries(manifest.characters)) {
    const recipe = kit.recipes[id];
    if (!recipe || entry.retouched?.length) continue;
    const c = E.composeCharacter(kit, recipe);
    const imgs = { idle: c.idle, walk: c.walk, ...Object.fromEntries(Object.entries(c.portraits).map(([s, i]) => [`portrait-${s}`, i])) };
    for (const [key, file] of Object.entries(entry.files)) {
      if (imgs[key] && pixelSha(imgs[key]) !== file.pixelSha256) { bad++; console.error(`✗ ${id}/${key}`); }
    }
  }
  console.log(bad ? `${bad} archivo(s) no coinciden` : 'todos los personajes publicados coinciden con el motor');
  process.exit(bad ? 1 : 0);
}

if (isMain) main();

function main() {
kit.complexions[COMPLEXION_C.id] = deriveTall(COMPLEXION_C);
kit.busts[COMPLEXION_C.id] = kit.busts[COMPLEXION_C.base];

const addedPieces = [];
for (const piece of PIECES) {
  const key = `${piece.kind}:${piece.id}`;
  if (!kit.pieces[key] || wanted.includes(key)) { kit.pieces[key] = packPiece(piece); addedPieces.push(key); }
}

const addedRecipes = [];
for (const recipe of readRecipes()) {
  if (kit.recipes[recipe.id] && !wanted.includes(recipe.id)) continue;
  if (recipe.complexion === COMPLEXION_C.id && COMPLEXION_C.hairNotSupported.includes(recipe.pieces.hair)) {
    throw new Error(`receta ${recipe.id}: el peinado ${recipe.pieces.hair} se recorta en la complexión ${COMPLEXION_C.id}`);
  }
  kit.recipes[recipe.id] = recipe;
  publish(recipe);
  addedRecipes.push(recipe.id);
}

manifest.characters = Object.fromEntries(Object.keys(manifest.characters).sort().map(id => [id, manifest.characters[id]]));
fs.writeFileSync(kitPath, JSON.stringify(sortKeys(kit)) + '\n');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`complexión ${COMPLEXION_C.id} derivada de ${COMPLEXION_C.base} (+${COMPLEXION_C.lift + (COMPLEXION_C.drop ?? 0)} px)`);
console.log(`piezas nuevas: ${addedPieces.join(', ') || 'ninguna'}`);
console.log(`recetas publicadas: ${addedRecipes.join(', ') || 'ninguna'}`);
}
