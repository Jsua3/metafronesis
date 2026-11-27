import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMPLEXIONS } from '../../character-kit/mannequins/index.mjs';
import { FRAME, decodeRle } from '../../src/app/features/character/kit/kit-engine.ts';
import { buildBundle } from './bundle.mjs';
import { statureOf } from './derive-complexion.mjs';

const rowsOf = (enc, labels) => {
  const s = decodeRle(enc.labels);
  const rows = [];
  for (let i = 0; i < s.length; i++) if (labels.includes(s[i])) rows.push(Math.floor(i / FRAME.width));
  return [Math.min(...rows), Math.max(...rows)];
};

test('la complexión D es la B con la cabeza más arriba y los pies más abajo', () => {
  const bundle = buildBundle();
  const { lift, drop } = statureOf(COMPLEXIONS.d);
  assert.ok(lift > 0 && drop > 0);
  const b = bundle.complexions.b.down.idle[0];
  const d = bundle.complexions.d.down.idle[0];
  const [bTop] = rowsOf(b, 'H');
  const [dTop] = rowsOf(d, 'H');
  assert.equal(dTop, bTop - lift);
  assert.equal(rowsOf(d, 'oO')[1], rowsOf(b, 'oO')[1] + drop);
  assert.equal(d.motion.upper, b.motion.upper - lift);
  assert.equal(d.motion.bob, b.motion.bob - lift);
});

test('las complexiones dibujadas no se salen del contrato de altura', () => {
  for (const id of ['a', 'b', 'c']) assert.deepEqual(statureOf(COMPLEXIONS[id]), { lift: 0, drop: 0 });
});
