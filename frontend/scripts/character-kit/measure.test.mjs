import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { FRAME, OUTLINE, VIEW_ROWS, composeCharacter, decodeRle, encodeRle } from '../../src/app/features/character/kit/kit-engine.ts';
import { buildBundle } from './bundle.mjs';
import { checkCharacter, checkMirror, checkSharedHead, geometry } from './measure.mjs';

const palette = new Set(JSON.parse(readFileSync(new URL('../../character-kit/palette.v2.json', import.meta.url), 'utf8')).masterColors);
const bundle = buildBundle();
const valentina = () => composeCharacter(bundle, bundle.recipes.valentina, { keepDressed: true });
const check = (composed, extra = {}) => checkCharacter(composed, { name: 'v', palette, outline: OUTLINE, ...extra });

/** Copia de una hoja con el píxel (x, y) del cuadro (col, row) cambiado. */
function withPixel(image, col, row, x, y, rgba) {
  const copy = { ...image, rgba: image.rgba.slice() };
  copy.rgba.set(rgba, ((row * FRAME.height + y) * image.width + col * FRAME.width + x) * 4);
  return copy;
}

test('Valentina cumple todo el contrato', () => {
  assert.deepEqual(check(valentina()), []);
});

test('geometría de Valentina para el manifiesto', () => {
  const g = geometry(valentina());
  assert.deepEqual(Object.keys(g), [...VIEW_ROWS]);
  // Las cuatro vistas de siempre no cambian con las diagonales.
  assert.deepEqual({ down: g.down, left: g.left, right: g.right, up: g.up }, {
    down: { opaqueHeight: 64, headWidth: 21, shoulderWidth: 23 },
    left: { opaqueHeight: 64, headWidth: 20, torsoDepth: 14 },
    right: { opaqueHeight: 64, headWidth: 19, torsoDepth: 14 },
    up: { opaqueHeight: 64, headWidth: 21, shoulderWidth: 23 },
  });
  // Tres cuartos: misma altura y un ancho de hombros entre el fondo del perfil y los hombros de frente.
  for (const view of ['down-left', 'up-left', 'up-right', 'down-right']) {
    assert.equal(g[view].opaqueHeight, 64, view);
    assert.ok(g[view].shoulderWidth > g.left.torsoDepth && g[view].shoulderWidth < g.down.shoulderWidth, `${view}: hombros ${g[view].shoulderWidth}`);
  }
});

test('detecta un píxel opaco en el borde del cuadro', () => {
  const v = valentina();
  const errors = check({ ...v, idle: withPixel(v.idle, 0, 0, 0, 0, [0x15, 0x13, 0x1d, 255]) });
  assert.ok(errors.some(e => e.includes('píxel opaco en el borde (0,0)')), errors.join('\n'));
});

test('detecta alfa no binario y colores fuera de la paleta', () => {
  const v = valentina();
  const semi = check({ ...v, idle: withPixel(v.idle, 0, 0, 24, 30, [0x3d, 0x6a, 0x55, 128]) });
  assert.ok(semi.some(e => e.includes('alfa 128')), semi.join('\n'));
  const fuera = check({ ...v, idle: withPixel(v.idle, 0, 0, 24, 30, [1, 2, 3, 255]) });
  assert.ok(fuera.some(e => e.includes('color #010203 fuera de la paleta')), fuera.join('\n'));
});

test('detecta una pieza suelta (dos siluetas)', () => {
  const v = valentina();
  const errors = check({ ...v, idle: withPixel(v.idle, 0, 0, 3, 3, [0x15, 0x13, 0x1d, 255]) });
  assert.ok(errors.some(e => e.includes('2 componentes opacos')), errors.join('\n'));
});

test('detecta la derecha como espejo exacto de la izquierda', () => {
  const { walk } = valentina();
  const copy = { ...walk, rgba: walk.rgba.slice() };
  for (let col = 0; col < 6; col++) {
    for (let y = 0; y < FRAME.height; y++) {
      for (let x = 0; x < FRAME.width; x++) {
        const src = ((VIEW_ROWS.indexOf('left') * FRAME.height + y) * walk.width + col * FRAME.width + x) * 4;
        const dst = ((VIEW_ROWS.indexOf('right') * FRAME.height + y) * walk.width + col * FRAME.width + (FRAME.width - 1 - x)) * 4;
        copy.rgba.set(walk.rgba.subarray(src, src + 4), dst);
      }
    }
  }
  assert.equal(checkMirror(copy, 'v', 'walk').length, 6);
});

test('el pelo de volumen admite una cabeza de hasta 25 px', () => {
  const v = valentina();
  // Ensancha la cabeza de frente a 25 px (x 12-36) en las filas 6-19 del cuadro 0 de reposo.
  let idle = v.idle;
  for (let y = 6; y <= 19; y++) {
    for (let x = 12; x <= 36; x++) idle = withPixel(idle, 0, 0, x, y, [0x15, 0x13, 0x1d, 255]);
  }
  const ancho = { ...v, idle };
  const sinVolumen = check(ancho).filter(e => e.includes('idle down [0] cabeza'));
  const conVolumen = check(ancho, { volume: true }).filter(e => e.includes('idle down [0] cabeza'));
  assert.equal(sinVolumen.length, 1, sinVolumen.join('\n'));
  assert.deepEqual(conVolumen, []);
});

test('cráneo compartido: una complexión con otra cabeza falla', () => {
  assert.deepEqual(checkSharedHead(bundle), []);
  // Copia «b» idéntica a A salvo una celda de la cabeza.
  const otra = structuredClone(bundle);
  otra.complexions.b = structuredClone(otra.complexions.a);
  const enc = otra.complexions.b.down.idle[0];
  const cells = [...decodeRle(enc.labels)];
  cells[cells.indexOf('H')] = '.';
  otra.complexions.b.down.idle[0] = { ...enc, labels: encodeRle(cells.join('')) };
  const errors = checkSharedHead(otra);
  assert.equal(errors.length, 1, errors.join('\n'));
  assert.match(errors[0], /complexión b down\/idle \[0\]: la cabeza no coincide/);
});
