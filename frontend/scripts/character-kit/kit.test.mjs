import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  FRAME,
  MIRROR_OF,
  TONE,
  VIEW_ROWS,
  applyRecipeVariant,
  composeCharacter,
  computeTones,
  createFrame,
  decodeRle,
  encodeRle,
  overlaysFor,
  parseGrid,
  targetRows,
} from '../../src/app/features/character/kit/kit-engine.ts';
import { buildBundle, compilePiece, loadRecipes, stringifyBundle } from './bundle.mjs';
import { geometry } from './measure.mjs';
import { sampleRecipe } from './muestras.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const golden = JSON.parse(readFileSync(new URL('./fixtures/valentina-prueba.json', import.meta.url), 'utf8'));
/** Valentina con la ropa de la prueba aprobada (76e6171), antes del uniforme: base fija de las pruebas del motor. */
const TRIAL = golden.recipe;
const MAGENTA = '#ff00ff';

/** Color `#rrggbb` del píxel (x, y) del cuadro (col, row) de una hoja. */
function pixel(image, col, row, x, y, fw = FRAME.width, fh = FRAME.height) {
  const i = ((row * fh + y) * image.width + col * fw + x) * 4;
  return `#${[0, 1, 2].map(k => image.rgba[i + k].toString(16).padStart(2, '0')).join('')}`;
}

/** Copia del paquete con piezas extra (ya compiladas) y una receta derivada de la Valentina de la prueba. */
function withPieces(extraPieces, patch = {}) {
  const bundle = buildBundle();
  for (const piece of extraPieces) bundle.pieces[`${piece.kind}:${piece.id}`] = compilePiece(piece);
  const base = TRIAL;
  const recipe = {
    ...base,
    ...patch,
    pieces: { ...base.pieces, ...(patch.pieces ?? {}) },
    colors: { ...base.colors, ...(patch.colors ?? {}) },
  };
  return { bundle, recipe };
}

/** Las 4 filas de antes (abajo, izquierda, derecha, arriba) en su orden de entonces: lo aprobado no cambia con las diagonales. */
function legacyRows(image) {
  const rowBytes = image.width * FRAME.height * 4;
  const out = new Uint8Array(rowBytes * 4);
  ['down', 'left', 'right', 'up'].forEach((view, k) => {
    const row = VIEW_ROWS.indexOf(view);
    out.set(image.rgba.subarray(row * rowBytes, (row + 1) * rowBytes), k * rowBytes);
  });
  return out;
}

test('Valentina sale idéntica a lo aprobado: hojas de la prueba (76e6171) y retrato 32×32 (con el volumen del retrato, 2026-11-15)', () => {
  const bundle = buildBundle();
  const out = composeCharacter(bundle, TRIAL);
  assert.equal(sha(legacyRows(out.idle)), golden.idle);
  assert.equal(sha(legacyRows(out.walk)), golden.walk);
  assert.equal(sha(out.portraits.neutral.rgba), golden['portrait-neutral']);
});

test('el paquete sobrevive a JSON sin cambiar un píxel', () => {
  const bundle = buildBundle();
  const viaJson = JSON.parse(JSON.stringify(bundle));
  const a = composeCharacter(bundle, bundle.recipes.valentina);
  const b = composeCharacter(viaJson, viaJson.recipes.valentina);
  assert.equal(sha(b.walk.rgba), sha(a.walk.rgba));
  assert.equal(sha(b.portraits.neutral.rgba), sha(a.portraits.neutral.rgba));
});

test('componer dos veces da los mismos bytes', () => {
  const bundle = buildBundle();
  const a = composeCharacter(bundle, bundle.recipes.valentina);
  const b = composeCharacter(bundle, bundle.recipes.valentina);
  assert.deepEqual(b.idle.rgba, a.idle.rgba);
});

test('RLE: ida y vuelta; rechaza dígitos y basura', () => {
  const text = '....HHH\nHH..\n.';
  assert.equal(encodeRle(text), '4.3H1\n2H2.1\n1.');
  assert.equal(decodeRle(encodeRle(text)), text);
  assert.throws(() => encodeRle('a1'), /dígito/);
  assert.throws(() => decodeRle('3H?'), /RLE inválido/);
});

test('parseGrid quita la indentación común, los \\r y las líneas vacías del borde', () => {
  assert.deepEqual(parseGrid('\r\n    ab\r\n     c\r\n'), ['ab', ' c']);
  assert.deepEqual(parseGrid('\n  x.\n  .yy\n'), ['x..', '.yy']);
});

test('luz: un bloque de 3×3 se ilumina arriba-izquierda y se sombrea abajo-derecha', () => {
  const frame = createFrame(5, 5);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) { frame.part[y * 5 + x] = 'X'; frame.mat[y * 5 + x] = 'm'; }
  const tones = computeTones(frame);
  const row = y => [1, 2, 3].map(x => tones[y * 5 + x]);
  assert.deepEqual(row(1), [TONE.HI, TONE.HI, TONE.SHADE]);
  assert.deepEqual(row(2), [TONE.HI, TONE.BASE, TONE.SHADE]);
  assert.deepEqual(row(3), [TONE.SHADE, TONE.SHADE, TONE.SHADE]);
});

test('targetRows: la cabeza sigue a upper, el torso se parte en la cintura y la pelvis sigue a bob', () => {
  const frame = createFrame(4, 4);
  assert.deepEqual(targetRows(frame, 'H', 10), [10]);
  frame.motion = { upper: -1, bob: 0, waistY: 33 };
  assert.deepEqual(targetRows(frame, 'H', 10), [9]);
  assert.deepEqual(targetRows(frame, 'T', 20), [19]);
  assert.deepEqual(targetRows(frame, 'T', 33), [32, 33]);
  assert.deepEqual(targetRows(frame, 'T', 35), [35]);
  assert.deepEqual(targetRows(frame, 'P', 40), [40]);
});

test('las vistas derechas no son el espejo exacto de sus izquierdas: la luz se recalcula después del espejo', () => {
  const bundle = buildBundle();
  const { walk } = composeCharacter(bundle, bundle.recipes.valentina);
  for (const [right, left] of Object.entries(MIRROR_OF)) {
    const leftRow = VIEW_ROWS.indexOf(left);
    const rightRow = VIEW_ROWS.indexOf(right);
    for (let col = 0; col < 6; col++) {
      for (const axis of [FRAME.width - 1, FRAME.width]) {
        let same = true;
        for (let y = 0; y < FRAME.height && same; y++) {
          for (let x = 0; x < FRAME.width && same; x++) {
            const mx = axis - x;
            if (mx < 0 || mx >= FRAME.width) continue;
            if (pixel(walk, col, leftRow, x, y) !== pixel(walk, col, rightRow, mx, y)) same = false;
          }
        }
        assert.equal(same, false, `${right}: cuadro ${col}, eje ${axis}`);
      }
    }
  }
});

test('ocho vistas: orden de las filas, tamaño de las hojas y espejos', () => {
  assert.deepEqual([...VIEW_ROWS], ['down', 'down-left', 'left', 'up-left', 'up', 'up-right', 'right', 'down-right']);
  assert.deepEqual({ ...MIRROR_OF }, { right: 'left', 'down-right': 'down-left', 'up-right': 'up-left' });
  const bundle = buildBundle();
  for (const views of Object.values(bundle.complexions)) assert.deepEqual(Object.keys(views).sort(), [...VIEW_ROWS].sort());
  const out = composeCharacter(bundle, bundle.recipes.valentina, { keepDressed: true });
  assert.deepEqual([out.idle.width, out.idle.height], [192, 576]);
  assert.deepEqual([out.walk.width, out.walk.height], [288, 576]);
  // Con piezas simétricas, la silueta de cada vista derecha sí es el espejo de su izquierda, alrededor del pivote.
  const sym = composeCharacter(bundle, sampleRecipe('hair:corto-liso', 'a'), { keepDressed: true });
  for (const [right, left] of Object.entries(MIRROR_OF)) {
    const a = sym.dressed.idle[left][0];
    const b = sym.dressed.idle[right][0];
    for (let y = 0; y < FRAME.height; y++) {
      for (let x = 0; x < FRAME.width; x++) {
        const mx = 2 * FRAME.pivotX - x;
        if (mx < 0 || mx >= FRAME.width) continue;
        assert.equal(b.part[y * FRAME.width + mx] !== null, a.part[y * FRAME.width + x] !== null, `${right} (${x},${y})`);
      }
    }
  }
});

test('overlaysFor: una diagonal derecha sin dibujo propio usa el espejo de su izquierda; con dibujo propio, el suyo', () => {
  const overlay = { anchor: 'T', at: [17, 23], mode: 'paint', legend: { a: { mat: 'top' } }, grid: 'a' };
  const ctx = { pivotX: FRAME.pivotX, complexion: 'a', sheet: 'idle', frame: 0 };
  const sym = compilePiece({ id: 'x', kind: 'top', views: { 'down-left': [overlay], 'up-left': [overlay] } });
  for (const view of ['down-right', 'up-right']) {
    const list = overlaysFor(sym, view, ctx);
    assert.equal(list.length, 1, view);
    assert.equal(list[0].mirrored, true, view);
  }
  assert.equal(overlaysFor(sym, 'down-left', ctx)[0].mirrored, false);
  const own = compilePiece({ id: 'y', kind: 'top', asymmetric: true, views: { left: [overlay], right: [overlay], 'down-left': [overlay], 'down-right': [overlay] } });
  assert.equal(overlaysFor(own, 'down-right', ctx)[0].mirrored, false);
});

test('filtros de superposición: complexions, sheets y frames', () => {
  const marca = (id, extra) => ({
    id, kind: 'accessory', views: {
      down: [{ anchor: 'T', at: [24, 30], mode: 'paint', legend: { m: { literal: MAGENTA } }, grid: 'm', ...extra }],
    },
  });
  const { bundle, recipe } = withPieces(
    [marca('solo-walk-0', { sheets: ['walk'], frames: [0] }), marca('solo-b', { complexions: ['b'] })],
    { pieces: { accessories: ['solo-walk-0', 'solo-b'] } },
  );
  const out = composeCharacter(bundle, recipe);
  // walk 0 tiene bob 1: la fila 30 del torso (encima de la cintura) baja a 31.
  assert.equal(pixel(out.walk, 0, 0, 24, 31), MAGENTA);
  assert.notEqual(pixel(out.walk, 1, 0, 24, 31), MAGENTA);
  assert.notEqual(pixel(out.walk, 1, 0, 24, 30), MAGENTA);
  assert.notEqual(pixel(out.idle, 0, 0, 24, 30), MAGENTA);
});

test('repaint borra los tonos fijos de otras piezas; paint los conserva', () => {
  const capa = (id, mode) => ({
    id, kind: 'layer', coverage: { T: 'layer' }, views: {
      down: [{ anchor: 'T', at: [17, 23], mode, legend: { L: { mat: 'layer' } }, grid: Array(15).fill('L'.repeat(15)).join('\n') }],
    },
  });
  const azul = ['#69a2c8', '#3d78a8', '#2c5884', '#203d61'];
  const run = (mode) => {
    const { bundle, recipe } = withPieces([capa(`capa-${mode}`, mode)], { pieces: { layer: `capa-${mode}` }, colors: { layer: 'azul' } });
    return composeCharacter(bundle, recipe).idle;
  };
  // (22,27) es el borde «x» de la abertura de la chaqueta: tono fijo 3.
  assert.equal(pixel(run('paint'), 0, 0, 22, 27), azul[3]);
  assert.notEqual(pixel(run('repaint'), 0, 0, 22, 27), azul[3]);
});

test('la capa (layer) se aplica después de la parte de arriba', () => {
  const bata = { id: 'bata-prueba', kind: 'layer', coverage: { T: 'layer', a: 'layer', b: 'layer', A: 'layer', B: 'layer' }, views: {} };
  const { bundle, recipe } = withPieces([bata], { pieces: { layer: 'bata-prueba' }, colors: { layer: 'blanco' } });
  const out = composeCharacter(bundle, recipe);
  const blanco = new Set(['#ffffff', '#f1f2f4', '#d5d9dd', '#a3abb5']);
  // (18,30): torso a la izquierda de la abertura, fuera de toda superposición de la chaqueta.
  assert.ok(blanco.has(pixel(out.idle, 0, 0, 18, 30)));
});

test('un rostro usa la expresión del estado en el retrato', () => {
  const { bundle, recipe: base } = withPieces([]);
  const faceKey = `face:${base.pieces.face}`;
  bundle.pieces[faceKey] = compilePiece({
    ...bundle.pieces[faceKey],
    views: {},
    portrait: [],
    expressions: { triste: [{ anchor: 'H', at: [16, 14], mode: 'paint', legend: { m: { literal: MAGENTA } }, grid: 'm' }] },
  });
  const out = composeCharacter(bundle, { ...base, portraits: ['neutral', 'triste'] });
  assert.equal(pixel(out.portraits.triste, 0, 0, 16, 14, 32, 32), MAGENTA);
  assert.notEqual(pixel(out.portraits.neutral, 0, 0, 16, 14, 32, 32), MAGENTA);
});

test('errores de receta con nombre y clave', () => {
  const bundle = buildBundle();
  const base = TRIAL;
  assert.throws(() => composeCharacter(bundle, { ...base, pieces: { ...base.pieces, top: 'no-existe' } }), /receta valentina: pieza desconocida top:no-existe/);
  assert.throws(() => composeCharacter(bundle, { ...base, colors: { ...base.colors, top: 'no-existe' } }), /rampa desconocida no-existe \(ranura top\)/);
  assert.throws(() => composeCharacter(bundle, { ...base, complexion: 'z' }), /complexión desconocida z/);
  const { accent, ...sinAcento } = base.colors;
  assert.ok(accent);
  assert.throws(() => composeCharacter(bundle, { ...base, colors: sinAcento }), /receta valentina: falta el color de la ranura «accent» \(la usa top:chaqueta-capucha\)/);
});

test('loadRecipes exige que el id coincida con el nombre del archivo', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'recetas-'));
  try {
    writeFileSync(path.join(dir, 'ana.json'), JSON.stringify({ id: 'otra' }));
    assert.throws(() => loadRecipes(dir), /receta ana.json: el id debe coincidir con el nombre del archivo/);
    writeFileSync(path.join(dir, 'ana.json'), JSON.stringify({ id: 'ana' }));
    writeFileSync(path.join(dir, '_borrador.json'), '{}');
    assert.deepEqual(Object.keys(loadRecipes(dir)), ['ana']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('compilePiece rechaza piezas mal formadas', () => {
  const overlay = { anchor: 'T', at: [17, 23], mode: 'paint', legend: { a: { mat: 'top' } }, grid: 'a' };
  const base = { id: 'x', kind: 'top', views: { down: [overlay] } };
  const conOverlay = patch => ({ ...base, views: { down: [{ ...overlay, ...patch }] } });
  assert.doesNotThrow(() => compilePiece(base));
  assert.throws(() => compilePiece({ ...base, kind: 'sombrero' }), /tipo desconocido/);
  assert.throws(() => compilePiece(conOverlay({ grid: 'ab' })), /símbolo «b» sin leyenda/);
  assert.throws(() => compilePiece(conOverlay({ grid: 'a1' })), /dígitos/);
  assert.throws(() => compilePiece(conOverlay({ mode: 'cover', legend: { a: { tone: 2 } } })), /necesita mat o literal/);
  assert.throws(() => compilePiece(conOverlay({ mode: 'pintar' })), /modo desconocido/);
  assert.throws(() => compilePiece(conOverlay({ sheets: ['run'] })), /hoja desconocida/);
  assert.throws(() => compilePiece({ ...base, asymmetric: true, views: { left: [overlay] } }), /asimétrica/);
  assert.throws(() => compilePiece({ ...base, asymmetric: true, views: { left: [overlay], right: [overlay], 'down-left': [overlay] } }), /asimétrica y le falta la vista down-right/);
  assert.throws(() => compilePiece({ ...base, asymmetric: true, views: { left: [overlay], right: [overlay], 'up-left': [overlay] } }), /asimétrica y le falta la vista up-right/);
  assert.throws(() => compilePiece({ ...base, views: { diagonal: [overlay] } }), /vista desconocida/);
  assert.throws(() => compilePiece({ ...base, expressions: { furiosa: [] } }), /estado de retrato desconocido/);
});

test('el paquete serializado es canónico y estable', () => {
  const a = stringifyBundle(buildBundle());
  assert.equal(stringifyBundle(buildBundle()), a);
  assert.ok(a.endsWith('\n'));
  assert.deepEqual(Object.keys(JSON.parse(a)), ['busts', 'catalog', 'complexions', 'literals', 'pieces', 'ramps', 'recipes', 'schemaVersion']);
});

test('la complexión B: misma altura y cabeza que A, hombros 25-27, perfil 1 px más profundo', () => {
  const bundle = buildBundle();
  const geo = c => geometry(composeCharacter(bundle, sampleRecipe('top:chaqueta-capucha', c)));
  const a = geo('a');
  const b = geo('b');
  for (const view of ['down', 'left', 'right', 'up']) assert.equal(b[view].opaqueHeight, a[view].opaqueHeight, view);
  for (const view of ['down', 'up']) assert.ok(b[view].shoulderWidth >= 25 && b[view].shoulderWidth <= 27, `${view}: ${b[view].shoulderWidth}`);
  for (const view of ['left', 'right']) assert.equal(b[view].torsoDepth, a[view].torsoDepth + 1, view);
});

test('el busto B tiene exactamente la cabeza del busto A', () => {
  const bundle = buildBundle();
  const head = new Set(['H', 'e', 'E']);
  const a = decodeRle(bundle.busts.a.grid);
  const b = decodeRle(bundle.busts.b.grid);
  for (let i = 0; i < a.length; i++) {
    if (head.has(a[i]) || head.has(b[i])) assert.equal(b[i], a[i], `celda ${i}`);
  }
});

test('los retratos miden 32×32: se muestran a ×3 en la caja de 96 px (decisión del 2026-10-03)', () => {
  const bundle = buildBundle();
  for (const complexion of ['a', 'b']) {
    const { portraits } = composeCharacter(bundle, { ...bundle.recipes.valentina, complexion });
    assert.equal(portraits.neutral.width, 32);
    assert.equal(portraits.neutral.height, 32);
  }
});

test('los rostros sereno y maduro traen expresiones de retrato distintas del neutral', () => {
  const bundle = buildBundle();
  for (const face of ['sereno', 'maduro']) {
    const { portraits } = composeCharacter(bundle, sampleRecipe(`face:${face}`, 'a'));
    const neutral = sha(portraits.neutral.rgba);
    const seen = new Set([neutral]);
    for (const state of ['preocupada', 'triste', 'alegre']) {
      const hash = sha(portraits[state].rgba);
      assert.ok(!seen.has(hash), `${face}: el retrato «${state}» repite otro estado`);
      seen.add(hash);
    }
  }
});

test('cover respeta la profundidad: no tapa lo que está delante (el brazo sobre un faldón)', () => {
  const faldon = {
    id: 'faldon-prueba', kind: 'accessory', views: {
      down: [{ anchor: 'P', at: [10, 40], mode: 'cover', legend: { L: { literal: MAGENTA } }, grid: 'L'.repeat(28) }],
    },
  };
  const { bundle, recipe } = withPieces([faldon], { pieces: { accessories: ['faldon-prueba'] } });
  const { idle } = composeCharacter(bundle, recipe);
  assert.equal(pixel(idle, 0, 0, 20, 40), MAGENTA, 'tapa la pelvis (misma profundidad)');
  assert.equal(pixel(idle, 0, 0, 12, 40), MAGENTA, 'crea celdas donde no había nada');
  assert.notEqual(pixel(idle, 0, 0, 15, 40), MAGENTA, 'no tapa el antebrazo, que está delante');
});

test('bordes: depth pinta varias filas desde el borde y edge «top» marca la fila de arriba', () => {
  const carbon = ['#6c6376', '#494255', '#302a3b', '#211e2b'];
  const calzado = (id, edges) => ({ id, kind: 'shoes', coverage: { o: 'shoes', O: 'shoes' }, edges, views: {} });
  const botin = calzado('botin-prueba', [{ labels: ['m', 'M'], edge: 'bottom', depth: 3, mat: 'shoes' }]);
  const brillo = calzado('brillo-prueba', [{ labels: ['o', 'O'], edge: 'top', tone: 0 }]);
  const run = id => {
    const { bundle, recipe } = withPieces([botin, brillo], { pieces: { shoes: id } });
    return composeCharacter(bundle, recipe).idle;
  };
  const conBotin = run('botin-prueba');
  // De frente, la espinilla izquierda termina en y = 62: las 3 últimas filas son caña del botín.
  for (const y of [60, 61, 62]) assert.ok(carbon.includes(pixel(conBotin, 0, 0, 21, y)), `y=${y}`);
  assert.ok(!carbon.includes(pixel(conBotin, 0, 0, 21, 59)), 'la fila 59 sigue siendo pantalón');
  // El empeine (fila de arriba del pie, y = 63) va en tono de luz.
  assert.equal(pixel(run('brillo-prueba'), 0, 0, 20, 63), carbon[0]);
  assert.throws(() => compilePiece({ ...botin, edges: [{ labels: ['o'], edge: 'left' }] }), /borde desconocido/);
});

test('applyRecipeVariant mezcla piezas y colores de la variante sin tocar la receta', () => {
  const bundle = buildBundle();
  const base = bundle.recipes.valentina;
  const conBata = applyRecipeVariant(base, { pieces: { layer: 'bata' }, colors: { layer: 'blanco' } });
  assert.equal(conBata.pieces.layer, 'bata');
  assert.equal(conBata.colors.layer, 'blanco');
  assert.equal(conBata.pieces.hair, base.pieces.hair);
  assert.equal(base.pieces.layer, undefined, 'la receta original no cambia');
});

// ── Seis estados de retrato (P4: cautelosa y en-crisis para la persona consultante) ──

const SIX_STATES = ['neutral', 'preocupada', 'triste', 'alegre', 'cautelosa', 'en-crisis'];

const differingPixels = (a, b) => {
  let n = 0;
  for (let p = 0; p < a.length; p += 4) {
    if (a[p] !== b[p] || a[p + 1] !== b[p + 1] || a[p + 2] !== b[p + 2] || a[p + 3] !== b[p + 3]) n++;
  }
  return n;
};

test('cada receta publica 6 retratos', () => {
  const bundle = buildBundle();
  for (const recipe of Object.values(bundle.recipes)) {
    assert.deepEqual([...(recipe.portraits ?? [])].sort(), [...SIX_STATES].sort(), recipe.id);
    const { portraits } = composeCharacter(bundle, recipe);
    assert.deepEqual(Object.keys(portraits).sort(), [...SIX_STATES].sort(), recipe.id);
  }
});

test('cautelosa y en-crisis difieren de las otras cuatro en al menos 12 píxeles', () => {
  // 12 px es lo que separa hoy a preocupada de triste; neutral y preocupada se distinguen por 8.
  const bundle = buildBundle();
  for (const face of ['sereno', 'maduro']) {
    const { portraits } = composeCharacter(bundle, sampleRecipe(`face:${face}`, 'a'));
    for (const nuevo of ['cautelosa', 'en-crisis']) {
      assert.ok(portraits[nuevo], `${face}: falta el retrato ${nuevo}`);
      for (const otro of SIX_STATES.filter(s => s !== nuevo)) {
        const n = differingPixels(portraits[nuevo].rgba, portraits[otro].rgba);
        assert.ok(n >= 12, `${face}: ${nuevo} y ${otro} solo difieren en ${n} píxeles`);
      }
    }
  }
});

test('emotionToPortrait cubre guarded y crisis', () => {
  const bundle = buildBundle();
  assert.equal(bundle.catalog.emotionToPortrait.guarded, 'cautelosa');
  assert.equal(bundle.catalog.emotionToPortrait.crisis, 'en-crisis');
});
