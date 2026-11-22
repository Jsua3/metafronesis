import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileScss, propsFor } from './sass-test-utils.mjs';

/**
 * Movimiento de los componentes de carga de shared/ui (plan visual §2.7, F2-4): los únicos bucles infinitos del DOM
 * son el esqueleto y el progreso, y con «movimiento reducido» quedan quietos. Se prueba el CSS COMPILADO de cada
 * componente (jsdom no aplica media queries ni animaciones).
 */
const UI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'app', 'shared', 'ui');
const compileComponent = path => compileScss(readFileSync(join(UI, path), 'utf8')).decls;
const REDUCE = 'prefers-reduced-motion: reduce';

test('ui-skeleton: brillo continuo de 1,4 s lineal; estático con movimiento reducido', () => {
  const decls = compileComponent('skeleton/ui-skeleton.scss');
  assert.match(propsFor(decls, '.ui-skeleton__bone').get('animation'), /^ui-skeleton-shimmer 1\.4s linear infinite$/);
  assert.equal(propsFor(decls, '.ui-skeleton__bone', REDUCE).get('animation'), 'none');
});

test('ui-spinner: gira y con movimiento reducido queda como anillo quieto', () => {
  const decls = compileComponent('spinner/ui-spinner.scss');
  assert.match(propsFor(decls, ':host').get('animation'), /infinite/);
  assert.equal(propsFor(decls, ':host', REDUCE).get('animation'), 'none');
});

test('ui-progress: la barra avanza por transform (sin animar el ancho) y la indeterminada se aquieta', () => {
  const decls = compileComponent('progress/ui-progress.scss');
  const fill = propsFor(decls, '.ui-progress__fill');
  assert.equal(fill.has('width'), false);
  assert.match(fill.get('transform'), /scaleX\(var\(--_ratio\)\)/);
  assert.equal(propsFor(decls, ':host(.ui-progress--indeterminate) .ui-progress__fill', REDUCE).get('animation'), 'none');
});

test('ui-route-progress: línea de 2 px que, con movimiento reducido, no se desliza', () => {
  const decls = compileComponent('route-progress/ui-route-progress.scss');
  assert.equal(propsFor(decls, ':host').get('block-size'), '2px');
  assert.equal(propsFor(decls, '.ui-route-progress__bar', REDUCE).get('animation'), 'none');
});
