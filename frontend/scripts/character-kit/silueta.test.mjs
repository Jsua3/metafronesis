import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FRAME, VIEW_ROWS, cloneFrame, composeCharacter, createFrame } from '../../src/app/features/character/kit/kit-engine.ts';
import { buildBundle } from './bundle.mjs';
import { recipeVariants } from './build.mjs';
import { CUARTOS, GIRO, apoyo, checkApoyo, checkGiro, diferenciaDeSilueta, vecinas } from './silueta.mjs';

const bundle = buildBundle();
const compose = recipe => composeCharacter(bundle, recipe, { keepDressed: true });

/** Copia del personaje con el cuadro 0 de reposo de una vista cambiado. */
function withIdle(composed, view, frame) {
  const idle = { ...composed.dressed.idle, [view]: [frame, ...composed.dressed.idle[view].slice(1)] };
  return { ...composed, dressed: { ...composed.dressed, idle } };
}

/** Cuadro desplazado (dx, dy) píxeles. */
function shifted(frame, dx, dy) {
  const out = createFrame(frame.width, frame.height);
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= frame.width || ny >= frame.height) continue;
      out.part[ny * frame.width + nx] = frame.part[y * frame.width + x];
    }
  }
  return out;
}

test('diferenciaDeSilueta: 0 si coinciden, 1 si no comparten nada, y simétrica', () => {
  const a = createFrame(4, 4);
  const b = createFrame(4, 4);
  a.part[0] = 'H';
  a.part[1] = 'H';
  b.part[1] = 'T';
  b.part[2] = 'T';
  assert.equal(diferenciaDeSilueta(a, cloneFrame(a)), 0);
  assert.equal(diferenciaDeSilueta(a, b), 2 / 3);
  assert.equal(diferenciaDeSilueta(b, a), 2 / 3);
  const c = createFrame(4, 4);
  c.part[15] = 'o';
  assert.equal(diferenciaDeSilueta(a, c), 1);
  assert.equal(diferenciaDeSilueta(createFrame(4, 4), createFrame(4, 4)), 0);
});

test('la vuelta tiene 8 pasos entre vecinas y 4 cuartos con su diagonal en medio', () => {
  assert.equal(vecinas().length, 8);
  assert.deepEqual(vecinas()[7], ['down-right', 'down']);
  for (const [a, diagonal, b] of CUARTOS) {
    const i = VIEW_ROWS.indexOf(diagonal);
    assert.deepEqual([VIEW_ROWS[(i + 7) % 8], VIEW_ROWS[(i + 1) % 8]].sort(), [a, b].sort());
  }
});

test('las 33 recetas y sus variantes giran de forma gradual y sin mover el punto de apoyo', () => {
  const recipes = Object.values(bundle.recipes);
  assert.equal(recipes.length, 33);
  const todos = recipes.flatMap(r => [[r.id, r], ...recipeVariants(bundle, r).map(([v, vr]) => [`${r.id}/${v}`, vr])]);
  for (const [id, recipe] of todos) {
    const composed = compose(recipe);
    assert.deepEqual(checkGiro(composed, id), [], id);
    assert.deepEqual(checkApoyo(composed, id), [], id);
  }
});

test('el punto de apoyo: pies en la misma fila en las 8 vistas y alrededor del pivote', () => {
  const composed = compose(bundle.recipes.valentina);
  for (const view of VIEW_ROWS) {
    const p = apoyo(composed.dressed.idle[view][0]);
    assert.equal(p.base, 66, view);
    assert.ok(Math.abs(p.centro - FRAME.pivotX) <= 2, `${view}: centro ${p.centro}`);
  }
});

test('checkGiro detecta una diagonal que no queda entre sus vecinas (el perfil puesto en su lugar)', () => {
  const composed = compose(bundle.recipes.valentina);
  const trucado = withIdle(composed, 'down-left', composed.dressed.idle.left[0]);
  const errors = checkGiro(trucado, 'v');
  assert.ok(errors.some(e => e.includes('down-left no queda entre down y left')), errors.join('\n'));
});

test('checkGiro detecta un salto de silueta entre vecinas', () => {
  const composed = compose(bundle.recipes.valentina);
  const trucado = withIdle(composed, 'up-left', shifted(composed.dressed.idle['up-left'][0], 8, 0));
  const errors = checkGiro(trucado, 'v');
  assert.ok(errors.some(e => e.includes('la silueta salta') && e.includes('up-left')), errors.join('\n'));
  assert.ok(GIRO.maxVecinas < 0.5);
});

test('checkApoyo detecta el cuadro que se corre de lado o que pisa otra fila', () => {
  const composed = compose(bundle.recipes.valentina);
  const lado = checkApoyo(withIdle(composed, 'down-left', shifted(composed.dressed.idle['down-left'][0], 3, 0)), 'v');
  assert.ok(lado.some(e => e.includes('el centro de los pies se corre')), lado.join('\n'));
  const fila = checkApoyo(withIdle(composed, 'up-left', shifted(composed.dressed.idle['up-left'][0], 0, 1)), 'v');
  assert.ok(fila.some(e => e.includes('up-left pisa en y=67')), fila.join('\n'));
});
