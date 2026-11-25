#!/usr/bin/env node
/**
 * npm run kit:check — falla si el kit no está al día o rompe el contrato de
 * personajes (spec «personajes unificados» §6). Reúne todos los errores antes
 * de salir, para arreglarlos de una vez.
 *
 *   node scripts/character-kit/check.mjs [--out <carpeta>]
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { OUTLINE, composeCharacter } from '../../src/app/features/character/kit/kit-engine.ts';
import { KIT_ROOT } from './bundle.mjs';
import { DEFAULT_OUT, buildOutputs, finishCharacter, recipeVariants, sha256 } from './build.mjs';
import { decodePng } from './kit-png.mjs';
import { checkCharacter, checkSharedHead } from './measure.mjs';
import { RETOUCH_ROOT, checkRetouchLayer } from './retouch-lib.mjs';
import { REPO_ROOT, checkCatalogKeys, checkCatalogRecipes, checkScenarioRecipes, editorSamples } from './coverage.mjs';
import { checkSourceMinimums, referencedKeys } from './coverage-sources.mjs';
import { sampleRecipes } from './muestras.mjs';
import { checkApoyo, checkGiro } from './silueta.mjs';

export function loadPalette() {
  const palette = JSON.parse(readFileSync(path.join(KIT_ROOT, 'palette.v2.json'), 'utf8'));
  return new Set(palette.masterColors);
}

function luminance(hex) {
  const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Rampas y literales dentro de la paleta; cada rampa oscurece de la luz a la profunda. */
export function checkColors(bundle, palette) {
  const errors = [];
  for (const [id, ramp] of Object.entries(bundle.ramps)) {
    if (ramp.length !== 4) errors.push(`rampa ${id}: tiene ${ramp.length} colores; deben ser 4`);
    for (const hex of ramp) if (!palette.has(hex)) errors.push(`rampa ${id}: ${hex} no está en palette.v2.json`);
    for (let k = 1; k < ramp.length; k++) {
      if (luminance(ramp[k]) >= luminance(ramp[k - 1])) errors.push(`rampa ${id}: ${ramp[k]} no es más oscuro que ${ramp[k - 1]}`);
    }
  }
  for (const [key, hex] of Object.entries(bundle.literals)) {
    if (!palette.has(hex)) errors.push(`literal ${key}: ${hex} no está en palette.v2.json`);
  }
  for (const recipe of Object.values(bundle.recipes)) {
    for (const [key, hex] of Object.entries(recipe.literals ?? {})) {
      if (!palette.has(hex)) errors.push(`receta ${recipe.id}: literal ${key} ${hex} no está en palette.v2.json`);
    }
  }
  return errors;
}

/** Lo publicado en `outDir` es exactamente lo que genera el build (píxeles, no bytes). */
export function checkUpToDate(files, outDir) {
  const errors = [];
  const stale = rel => `${rel} está desactualizado: ejecuta npm run kit:build`;
  for (const [rel, expected] of files) {
    const file = path.join(outDir, rel);
    if (!existsSync(file)) { errors.push(`falta ${rel}: ejecuta npm run kit:build`); continue; }
    const actual = readFileSync(file);
    if (!rel.endsWith('.png')) { if (!actual.equals(expected)) errors.push(stale(rel)); continue; }
    const a = decodePng(actual);
    const b = decodePng(expected);
    if (a.width !== b.width || a.height !== b.height || !Buffer.from(a.rgba).equals(Buffer.from(b.rgba))) errors.push(stale(rel));
  }
  if (existsSync(outDir)) {
    for (const entry of readdirSync(outDir, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      const rel = path.relative(outDir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
      if (!files.has(rel)) errors.push(`${rel} sobra: el build no lo genera (ejecuta npm run kit:build)`);
    }
  }
  return errors;
}

const isVolume = (bundle, recipe) => bundle.pieces[`hair:${recipe.pieces.hair}`]?.volume === true;

export function runCheck({ outDir = DEFAULT_OUT, retouchRoot = RETOUCH_ROOT } = {}) {
  const errors = [];
  const warnings = [];
  const { bundle, files } = buildOutputs({ retouchRoot });
  const palette = loadPalette();
  errors.push(...checkUpToDate(files, outDir));
  errors.push(...checkColors(bundle, palette));
  errors.push(...checkSharedHead(bundle));
  const published = Object.values(bundle.recipes).flatMap(recipe => [
    [recipe.id, recipe],
    ...recipeVariants(bundle, recipe).map(([variantId, variantRecipe]) => [`${recipe.id}/${variantId}`, variantRecipe]),
  ]);
  for (const [id, recipe] of published) {
    const { composed, applied } = finishCharacter(id, composeCharacter(bundle, recipe, { keepDressed: true }), retouchRoot);
    for (const retouch of applied) {
      const name = `retoque ${id}/${retouch.name}`;
      errors.push(...checkRetouchLayer(retouch.layer, { name, palette }));
      if (retouch.baseSha256 !== sha256(retouch.base.rgba)) {
        warnings.push(`${name}: la base cambió debajo del retoque; revisa la lámina y vuelve a guardarlo con npm run kit:retoque`);
      }
    }
    errors.push(...checkCharacter(composed, { name: id, palette, outline: OUTLINE, volume: isVolume(bundle, recipe) }));
    errors.push(...checkGiro(composed, id), ...checkApoyo(composed, id));
  }
  for (const recipe of sampleRecipes(bundle)) {
    const composed = composeCharacter(bundle, recipe, { keepDressed: true });
    errors.push(...checkCharacter(composed, { name: recipe.id, palette, outline: OUTLINE, volume: isVolume(bundle, recipe) }));
    errors.push(...checkGiro(composed, recipe.id), ...checkApoyo(composed, recipe.id));
  }
  const refs = referencedKeys(REPO_ROOT);
  errors.push(...checkCatalogKeys(bundle.catalog, refs));
  errors.push(...checkScenarioRecipes(bundle.recipes, refs));
  errors.push(...checkSourceMinimums(refs));
  errors.push(...checkCatalogRecipes(bundle));
  for (const recipe of editorSamples(bundle)) {
    const composed = composeCharacter(bundle, recipe, { keepDressed: true });
    errors.push(...checkCharacter(composed, { name: recipe.id, palette, outline: OUTLINE }));
  }
  return { errors, warnings };
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT;
  const { errors, warnings } = runCheck({ outDir });
  if (warnings.length) process.stdout.write(`${warnings.map(w => `aviso: ${w}`).join('\n')}\n`);
  if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n\nkit:check: ${errors.length} errores\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('kit:check: 0 errores\n');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
