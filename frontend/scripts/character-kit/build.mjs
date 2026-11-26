#!/usr/bin/env node
/**
 * npm run kit:build — escribe el paquete del kit (`kit.json`), las hojas y los
 * retratos de cada receta fija y el manifiesto. Determinista: dos ejecuciones
 * seguidas dan los mismos bytes.
 *
 *   node scripts/character-kit/build.mjs [--out <carpeta>]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyRecipeVariant, composeCharacter } from '../../src/app/features/character/kit/kit-engine.ts';
import { FRONTEND_ROOT, buildBundle, stringifyBundle } from './bundle.mjs';
import { encodePng } from './kit-png.mjs';
import { geometry } from './measure.mjs';
import { RETOUCH_ROOT, applyRetouch, loadRetouch } from './retouch-lib.mjs';

export const DEFAULT_OUT = path.join(FRONTEND_ROOT, 'src', 'assets', 'characters', 'kit');

export const sha256 = data => createHash('sha256').update(data).digest('hex');

/** Imágenes publicadas de un personaje compuesto: `idle`, `walk` y `portrait-<estado>`. */
export function publishedImages(composed) {
  const images = { idle: composed.idle, walk: composed.walk };
  for (const [state, image] of Object.entries(composed.portraits)) images[`portrait-${state}`] = image;
  return images;
}

/**
 * Personaje fijo listo para publicar: sus imágenes con los retoques aplicados.
 * `applied` lista cada retoque con la base sobre la que se pegó (para el validador).
 */
export function finishCharacter(id, composed, retouchRoot = RETOUCH_ROOT) {
  const images = publishedImages(composed);
  const applied = [];
  for (const [name, base] of Object.entries(images)) {
    const retouch = loadRetouch(id, name, retouchRoot);
    if (!retouch) continue;
    images[name] = applyRetouch(base, retouch.layer);
    applied.push({ name, base, ...retouch });
  }
  const portraits = Object.fromEntries(Object.keys(composed.portraits).map(state => [state, images[`portrait-${state}`]]));
  return { composed: { ...composed, idle: images.idle, walk: images.walk, portraits }, images, applied };
}

/**
 * Variantes de una receta que el build publica: los jugables, una por cada
 * entrada de `catalog.playableVariants` (decisión 17); el resto, ninguna.
 * Devuelve [idVariante, receta] con la receta ya mezclada.
 */
export function recipeVariants(bundle, recipe) {
  if (recipe.kind !== 'jugable') return [];
  return Object.entries(bundle.catalog.playableVariants ?? {}).map(([variantId, variant]) => [variantId, applyRecipeVariant(recipe, variant)]);
}

/** Imágenes de un personaje (o variante) en `files` y su entrada del manifiesto. */
function publish(files, prefix, composedWithRetouch, images, applied) {
  const entry = { geometry: geometry(composedWithRetouch), retouched: applied.map(r => r.name), files: {} };
  for (const [name, image] of Object.entries(images)) {
    const rel = `${prefix}/${name}.png`;
    files.set(rel, encodePng(image.width, image.height, image.rgba));
    entry.files[name] = { path: rel, width: image.width, height: image.height, pixelSha256: sha256(image.rgba) };
  }
  return entry;
}

/**
 * Todo lo que el build escribe, en memoria. `files` mapea la ruta relativa a
 * `--out` con sus bytes; el validador lo reutiliza para comparar con el disco.
 */
export function buildOutputs({ retouchRoot = RETOUCH_ROOT } = {}) {
  const bundle = buildBundle();
  const kitJson = stringifyBundle(bundle);
  const files = new Map([['kit.json', Buffer.from(kitJson)]]);
  const characters = {};
  for (const [id, recipe] of Object.entries(bundle.recipes)) {
    const { composed, images, applied } = finishCharacter(id, composeCharacter(bundle, recipe), retouchRoot);
    const entry = {
      displayName: recipe.displayName,
      kind: recipe.kind,
      complexion: recipe.complexion,
      provenance: recipe.provenance,
      ...publish(files, id, composed, images, applied),
    };
    const variants = recipeVariants(bundle, recipe);
    if (variants.length) {
      entry.variants = {};
      for (const [variantId, variantRecipe] of variants) {
        const done = finishCharacter(`${id}/${variantId}`, composeCharacter(bundle, variantRecipe), retouchRoot);
        entry.variants[variantId] = publish(files, `${id}/${variantId}`, done.composed, done.images, done.applied);
      }
    }
    characters[id] = entry;
  }
  const manifest = { schemaVersion: 1, kitSha256: sha256(kitJson), characters };
  files.set('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  return { bundle, files, manifest };
}

/**
 * Escribe `files` en `outDir` y deja en ella exactamente esos archivos: borra
 * lo que sobre (personajes retirados, retratos que ya no existen, archivos
 * sueltos) y las carpetas que queden vacías. Por seguridad solo escribe en una
 * carpeta vacía o que ya sea una salida del kit (tiene manifest.json): un
 * `--out` equivocado no borra nada ajeno.
 */
export function writeOutputs(files, outDir) {
  mkdirSync(outDir, { recursive: true });
  const existing = readdirSync(outDir);
  if (existing.length && !existing.includes('manifest.json')) {
    throw new Error(`${outDir} no parece una salida del kit (no tiene manifest.json): elige una carpeta vacía o la del kit`);
  }
  for (const entry of readdirSync(outDir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    const rel = path.relative(outDir, file).split(path.sep).join('/');
    if (!files.has(rel)) rmSync(file);
  }
  const dirs = readdirSync(outDir, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(entry.parentPath, entry.name))
    .sort((a, b) => b.length - a.length);
  for (const dir of dirs) if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  for (const [rel, bytes] of files) {
    const file = path.join(outDir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT;
  const { files, manifest } = buildOutputs();
  writeOutputs(files, outDir);
  const kitBytes = files.get('kit.json').length;
  process.stdout.write(`kit.json: ${(kitBytes / 1024).toFixed(1)} KB · ${Object.keys(manifest.characters).length} personajes · ${files.size} archivos en ${outDir}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
