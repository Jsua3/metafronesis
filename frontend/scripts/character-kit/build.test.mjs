import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { composeCharacter } from '../../src/app/features/character/kit/kit-engine.ts';
import { buildOutputs, writeOutputs } from './build.mjs';
import { buildBundle } from './bundle.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('el build es determinista: dos ejecuciones, mismos bytes', () => {
  const a = buildOutputs().files;
  const b = buildOutputs().files;
  assert.deepEqual([...a.keys()].sort(), [...b.keys()].sort());
  for (const [rel, bytes] of a) assert.ok(bytes.equals(b.get(rel)), rel);
});

test('el manifiesto registra los hashes de píxeles de Valentina', () => {
  const { manifest, files } = buildOutputs();
  const v = manifest.characters.valentina;
  const bundle = buildBundle();
  const composed = composeCharacter(bundle, bundle.recipes.valentina);
  assert.equal(v.files.idle.pixelSha256, sha(composed.idle.rgba));
  assert.equal(v.files.walk.pixelSha256, sha(composed.walk.rgba));
  assert.equal(v.files['portrait-neutral'].pixelSha256, sha(composed.portraits.neutral.rgba));
  assert.deepEqual(v.provenance, { source: 'Kit SIEP', license: 'SIEP-INTERNAL' });
  assert.ok(files.has('kit.json') && files.has('manifest.json') && files.has('valentina/idle.png'));
});

test('writeOutputs escribe todo y borra carpetas de personajes que ya no existen', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'kit-'));
  try {
    // Una salida anterior del kit (tiene manifest.json) con una carpeta de una receta retirada.
    writeFileSync(path.join(out, 'manifest.json'), '{}');
    mkdirSync(path.join(out, 'retirado'));
    writeFileSync(path.join(out, 'retirado', 'idle.png'), 'x');
    const { files } = buildOutputs();
    writeOutputs(files, out);
    assert.ok(!existsSync(path.join(out, 'retirado')));
    for (const rel of files.keys()) assert.ok(existsSync(path.join(out, rel)), rel);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('writeOutputs borra lo que sobra dentro de las carpetas que conserva', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'kit-'));
  try {
    const { files } = buildOutputs();
    writeOutputs(files, out);
    // Una receta que dejó de tener un retrato, un archivo suelto y una carpeta vacía.
    writeFileSync(path.join(out, 'valentina', 'portrait-sobrante.png'), 'x');
    writeFileSync(path.join(out, 'viejo.json'), '{}');
    mkdirSync(path.join(out, 'valentina', 'vacia'));
    writeOutputs(files, out);
    assert.ok(!existsSync(path.join(out, 'valentina', 'portrait-sobrante.png')));
    assert.ok(!existsSync(path.join(out, 'viejo.json')));
    assert.ok(!existsSync(path.join(out, 'valentina', 'vacia')));
    for (const rel of files.keys()) assert.ok(existsSync(path.join(out, rel)), rel);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('writeOutputs se niega a escribir en una carpeta que no es una salida del kit', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'ajena-'));
  try {
    mkdirSync(path.join(out, 'src'));
    writeFileSync(path.join(out, 'src', 'main.ts'), 'importante');
    assert.throws(() => writeOutputs(buildOutputs().files, out), /no parece una salida del kit/);
    assert.deepEqual(readdirSync(out), ['src']);
    assert.equal(readFileSync(path.join(out, 'src', 'main.ts'), 'utf8'), 'importante');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('el build saca la versión con bata de cada jugable (y solo de los jugables)', () => {
  const { files, manifest } = buildOutputs();
  for (const name of ['idle', 'walk', 'portrait-neutral']) assert.ok(files.has(`valentina/bata/${name}.png`), name);
  const variant = manifest.characters.valentina.variants.bata;
  assert.equal(variant.files.idle.path, 'valentina/bata/idle.png');
  assert.notEqual(variant.files.idle.pixelSha256, manifest.characters.valentina.files.idle.pixelSha256);
  assert.ok(!files.has('abuela-familia/bata/idle.png'), 'los NPC no tienen variante');
  assert.equal(manifest.characters['abuela-familia'].variants, undefined);
});
