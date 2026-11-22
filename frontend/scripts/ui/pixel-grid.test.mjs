import { test } from 'node:test';
import assert from 'node:assert/strict';

import { backgroundOf, spriteRuns } from './pixel-grid.mjs';

/** Imagen de una fila con los colores dados (uno por píxel). */
function row(colors) {
  const data = Buffer.alloc(colors.length * 4);
  colors.forEach((c, i) => { data[i * 4] = (c >> 16) & 255; data[i * 4 + 1] = (c >> 8) & 255; data[i * 4 + 2] = c & 255; data[i * 4 + 3] = 255; });
  return { width: colors.length, height: 1, data };
}

test('backgroundOf toma el color más repetido entre cuadros', () => {
  const frames = [row([1, 1, 9]), row([1, 5, 9]), row([1, 5, 9])];
  assert.deepEqual(Array.from(backgroundOf(frames, 0, 0, 3, 1)), [1, 5, 9]);
});

test('spriteRuns cuenta solo tramos interiores del sprite y marca los que no son múltiplo del zoom', () => {
  const background = Int32Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  // fondo | 2 px de 7 | 2 px de 8 | 3 px de 7 | fondo…
  const aligned = row([0, 7, 7, 8, 8, 7, 7, 0, 0, 0]);
  const misaligned = row([0, 7, 7, 8, 8, 8, 7, 0, 0, 0]);
  assert.deepEqual(spriteRuns(aligned, background, 0, 0, 10, 1, 2), { runs: 3, irregular: 0, ratio: 0 });
  const result = spriteRuns(misaligned, background, 0, 0, 10, 1, 2);
  assert.equal(result.runs, 3);
  assert.equal(result.irregular, 2);
});
