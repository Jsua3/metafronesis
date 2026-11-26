import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildOutputs, writeOutputs } from './build.mjs';
import { loadPalette, runCheck } from './check.mjs';
import { readPng, writePng } from './kit-png.mjs';
import { applyRetouch, checkRetouchLayer, diffRetouch } from './retouch-lib.mjs';
import { retouchCommand } from './retoque.mjs';

const image = (w, h, pixels) => {
  const rgba = new Uint8Array(w * h * 4);
  pixels.forEach(([x, y, c]) => rgba.set(c, (y * w + x) * 4));
  return { width: w, height: h, rgba };
};
const VERDE = [0x5b, 0x8d, 0x70, 255];
const NEGRO = [0x15, 0x13, 0x1d, 255];

test('applyRetouch pinta lo opaco y el magenta borra', () => {
  const base = image(2, 1, [[0, 0, VERDE], [1, 0, VERDE]]);
  const layer = image(2, 1, [[0, 0, NEGRO], [1, 0, [255, 0, 255, 255]]]);
  const out = applyRetouch(base, layer);
  assert.deepEqual([...out.rgba], [...NEGRO, 0, 0, 0, 0]);
  assert.deepEqual([...base.rgba], [...VERDE, ...VERDE], 'no muta la base');
});

test('diffRetouch guarda solo lo que cambió y aplicarlo reproduce la edición', () => {
  const base = image(3, 1, [[0, 0, VERDE], [1, 0, VERDE]]);
  const edited = image(3, 1, [[0, 0, VERDE], [2, 0, NEGRO]]);
  const layer = diffRetouch(base, edited);
  assert.deepEqual([...layer.rgba.slice(0, 4)], [0, 0, 0, 0]);
  assert.deepEqual([...layer.rgba.slice(4, 8)], [255, 0, 255, 255]);
  assert.deepEqual([...applyRetouch(base, layer).rgba], [...edited.rgba]);
});

test('la capa solo admite la paleta, el magenta y alfa binario', () => {
  const layer = image(3, 1, [[0, 0, [1, 2, 3, 255]], [1, 0, [0x5b, 0x8d, 0x70, 128]], [2, 0, [255, 0, 255, 255]]]);
  const errors = checkRetouchLayer(layer, { name: 'r', palette: loadPalette() });
  assert.deepEqual(errors, ['r: color #010203 fuera de la paleta en (0,0)', 'r: alfa 128 en (1,0); solo 0 o 255']);
});

test('flujo completo: exportar, editar, guardar, construir y validar', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'retouch-'));
  const out = mkdtempSync(path.join(tmpdir(), 'kit-out-'));
  try {
    retouchCommand(['valentina', 'idle'], root);
    const editFile = path.join(root, 'valentina', 'idle.edit.png');
    const edit = readPng(editFile);
    // Oscurece un píxel del torso (24,30) del cuadro 0 con un color de la paleta.
    edit.rgba.set([0x3d, 0x6a, 0x55, 255], (30 * edit.width + 24) * 4);
    writePng(editFile, edit.width, edit.height, edit.rgba);
    assert.match(retouchCommand(['valentina', 'idle', '--guardar'], root), /1 píxeles/);
    const { files, manifest } = buildOutputs({ retouchRoot: root });
    assert.deepEqual(manifest.characters.valentina.retouched, ['idle']);
    writeOutputs(files, out);
    assert.deepEqual(runCheck({ outDir: out, retouchRoot: root }), { errors: [], warnings: [] });
    // Si la base cambia debajo del retoque, el validador avisa (no falla).
    writeFileSync(path.join(root, 'valentina', 'idle.json'), '{ "baseSha256": "otra" }\n');
    const { errors, warnings } = runCheck({ outDir: out, retouchRoot: root });
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, ['retoque valentina/idle: la base cambió debajo del retoque; revisa la lámina y vuelve a guardarlo con npm run kit:retoque']);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('kit:retoque no pisa una edición en curso y rechaza banderas desconocidas', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'retouch-'));
  try {
    retouchCommand(['valentina', 'idle'], root);
    const editFile = path.join(root, 'valentina', 'idle.edit.png');
    const edit = readPng(editFile);
    edit.rgba.set([0x3d, 0x6a, 0x55, 255], (30 * edit.width + 24) * 4);
    writePng(editFile, edit.width, edit.height, edit.rgba);
    // Volver a exportar (p. ej. npm se tragó --guardar por faltar «--») no borra el trabajo.
    assert.throws(() => retouchCommand(['valentina', 'idle'], root), /ya existe .*idle\.edit\.png/);
    assert.deepEqual([...readPng(editFile).rgba.slice((30 * edit.width + 24) * 4, (30 * edit.width + 24) * 4 + 4)], [0x3d, 0x6a, 0x55, 255]);
    assert.throws(() => retouchCommand(['valentina', 'idle', '--guarda'], root), /argumento desconocido «--guarda»/);
    assert.match(retouchCommand(['valentina', 'idle', '--forzar'], root), /edita/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
