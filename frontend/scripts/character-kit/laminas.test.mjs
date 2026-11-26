import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildBundle } from './bundle.mjs';
import { buildLamina, parseArgs } from './laminas.mjs';
import { readPng, writePng } from './kit-png.mjs';
import { retouchCommand } from './retoque.mjs';

const images = html => (html.match(/<img /g) ?? []).length;

test('parseArgs entiende modos, escala y salida', () => {
  assert.deepEqual(parseArgs(['--piezas', 'hair:afro', '--escala', '3', '--salida', 'x.png']), { piezas: 'hair:afro', escala: 3, salida: 'x.png' });
  assert.deepEqual(parseArgs(['--elenco']), { elenco: true });
});

test('ficha de receta: 8 vistas, 6 retratos, 32 cuadros de reposo y 48 de caminata', () => {
  const { name, html } = buildLamina({ receta: 'valentina' });
  assert.equal(name, 'receta-valentina');
  assert.equal(images(html), 8 + 6 + 32 + 48);
  assert.match(html, /image-rendering: pixelated/);
});

test('lámina de piezas: una fila por complexión con vistas, caminata de perfil y retrato', () => {
  const { name, html } = buildLamina({ piezas: 'hair:bob-flequillo' });
  assert.equal(name, 'piezas-hair-bob-flequillo');
  const complexions = Object.keys(buildBundle().complexions).length;
  assert.equal(images(html), complexions * (8 + 6 + 1));
});

test('las escalas de las imágenes son enteras', () => {
  const { html } = buildLamina({ elenco: true });
  for (const [, w, h] of html.matchAll(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/g)) {
    assert.ok(Number.isInteger(Number(w)) && Number.isInteger(Number(h)), `${w}×${h}`);
  }
});

test('modo desconocido o pieza inexistente fallan con un mensaje claro', () => {
  assert.throws(() => buildLamina({}), /uso: laminas.mjs/);
  assert.throws(() => buildLamina({ piezas: 'hair:no-existe' }), /pieza desconocida: hair:no-existe/);
});

test('el elenco muestra también la versión con bata de cada jugable, como se publica', () => {
  const bundle = buildBundle();
  const { html } = buildLamina({ elenco: true });
  const jugables = Object.values(bundle.recipes).filter(r => r.kind === 'jugable').length;
  assert.equal((html.match(/class="row ground"/g) ?? []).length, Object.keys(bundle.recipes).length + jugables);
  assert.match(html, /Valentina · bata \(jugable\)/);
});

test('las filas no se parten: cada fila de cuadros queda en una sola línea', () => {
  const { html } = buildLamina({ piezas: 'hair:bob-flequillo' });
  assert.match(html, /\.row \{[^}]*flex-wrap: nowrap/);
});

test('las fichas y el elenco muestran los retoques guardados, y lo dicen', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'retouch-'));
  try {
    retouchCommand(['valentina', 'idle'], root);
    const editFile = path.join(root, 'valentina', 'idle.edit.png');
    const edit = readPng(editFile);
    edit.rgba.set([0x3d, 0x6a, 0x55, 255], (30 * edit.width + 24) * 4);
    writePng(editFile, edit.width, edit.height, edit.rgba);
    retouchCommand(['valentina', 'idle', '--guardar'], root);
    const sin = buildLamina({ receta: 'valentina' }).html;
    const con = buildLamina({ receta: 'valentina', retouchRoot: root }).html;
    assert.notEqual(con, sin);
    assert.match(con, /retocado: idle/);
    assert.doesNotMatch(sin, /retocado/);
    assert.match(buildLamina({ elenco: true, retouchRoot: root }).html, /retocado: idle/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
