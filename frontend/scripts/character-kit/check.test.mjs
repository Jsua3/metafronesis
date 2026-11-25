import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildBundle } from './bundle.mjs';
import { buildOutputs, writeOutputs } from './build.mjs';
import { checkColors, checkUpToDate, loadPalette, runCheck } from './check.mjs';
import { decodePng, encodePng } from './kit-png.mjs';

function freshOut() {
  const out = mkdtempSync(path.join(tmpdir(), 'kit-check-'));
  writeOutputs(buildOutputs().files, out);
  return out;
}

test('un kit recién construido pasa el validador completo', () => {
  const out = freshOut();
  try {
    assert.deepEqual(runCheck({ outDir: out }), { errors: [], warnings: [] });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('detecta hojas desactualizadas y archivos que sobran', () => {
  const out = freshOut();
  try {
    const { files } = buildOutputs();
    const idle = decodePng(files.get('valentina/idle.png'));
    idle.rgba[(30 * idle.width + 24) * 4] ^= 0xff;
    writeFileSync(path.join(out, 'valentina', 'idle.png'), encodePng(idle.width, idle.height, idle.rgba));
    writeFileSync(path.join(out, 'valentina', 'viejo.png'), 'x');
    const errors = checkUpToDate(files, out);
    assert.ok(errors.includes('valentina/idle.png está desactualizado: ejecuta npm run kit:build'), errors.join('\n'));
    assert.ok(errors.includes('valentina/viejo.png sobra: el build no lo genera (ejecuta npm run kit:build)'), errors.join('\n'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('rampas fuera de la paleta o que no oscurecen', () => {
  const bundle = buildBundle();
  bundle.ramps.mala = ['#010203', '#5b8d70', '#85b294', '#29483d'];
  const errors = checkColors(bundle, loadPalette());
  assert.ok(errors.includes('rampa mala: #010203 no está en palette.v2.json'), errors.join('\n'));
  assert.ok(errors.includes('rampa mala: #85b294 no es más oscuro que #5b8d70'), errors.join('\n'));
});

test('el manifiesto lleva la geometría por vista', () => {
  const { manifest } = buildOutputs();
  assert.deepEqual(manifest.characters.valentina.geometry.down, { opaqueHeight: 64, headWidth: 21, shoulderWidth: 23 });
});
