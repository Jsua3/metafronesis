import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileStylesFile } from './sass-test-utils.mjs';

/** Pruebas sobre la hoja global COMPILADA (plan visual F1-3 a F1-6). Se compila una vez. */
const { css } = compileStylesFile('styles.scss');

test('tipografía: solo Poppins 400/600/800 y JetBrains Mono 400/700; sin Montserrat', () => {
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const family = /font-family:\s*["']?([^"';]+)["']?;/.exec(body)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(body)?.[1];
    return `${family}:${weight}`;
  }).filter(face => !face.startsWith('Material Symbols'));
  assert.deepEqual(faces.sort(), ['JetBrains Mono:400', 'JetBrains Mono:700', 'Poppins:400', 'Poppins:600', 'Poppins:800']);
  assert.doesNotMatch(css, /Montserrat/);
});

// ── F1-4: tema de Material con mat.theme atado a los tokens (ANG-10) ──────────────────────────────────────────
import { parseCss } from './ui-lint-lib.mjs';

const parsed = parseCss({ text: css, startLine: 1 });

test('Material: tokens de sistema (--mat-sys-*) atados a --ds-* y sin los miles de tokens por componente', () => {
  const componentTokens = parsed.decls.filter(d => d.prop.startsWith('--mat-') && !d.prop.startsWith('--mat-sys-'));
  assert.ok(componentTokens.length <= 30, `tokens por componente emitidos: ${componentTokens.length}`);
  const sys = new Map(parsed.decls.filter(d => d.prop.startsWith('--mat-sys-')).map(d => [`${d.selector}|${d.prop}`, d.value]));
  assert.equal(sys.get('html|--mat-sys-primary'), 'var(--ds-primary)');
  assert.equal(sys.get('html|--mat-sys-surface'), 'var(--ds-surface-1)');
  assert.equal(sys.get('[data-skin=game]|--mat-sys-primary'), 'var(--ds-primary)', 'la piel juego vuelve a atar Material a sus tokens');
});

test('Material sigue la piel juego también en pistas, fondos, errores, tarjetas y tablas (revisión de F1, I2)', () => {
  const game = new Map(parsed.decls.filter(d => d.selector === '[data-skin=game]').map(d => [d.prop, d.value]));
  assert.equal(game.get('--mat-sys-surface-variant'), 'var(--ds-surface-2)', 'pista de mat-progress-bar');
  assert.equal(game.get('--mat-sys-background'), 'var(--ds-surface-page)');
  assert.equal(game.get('--mat-sys-on-background'), 'var(--ds-text-1)');
  assert.equal(game.get('--mat-sys-on-error'), 'var(--ds-on-primary)');
  assert.equal(game.get('--mat-card-outlined-container-color'), 'var(--ds-surface-1)');
  assert.equal(game.get('--mat-table-header-headline-color'), 'var(--ds-text-1)');
});

test('Material: tarjetas y tablas sin !important', () => {
  const forced = parsed.decls.filter(d => /mat-mdc-(card|header-cell|row)/.test(d.selector) && /!important/.test(d.value));
  assert.deepEqual(forced.map(d => `${d.selector} { ${d.prop} }`), []);
});

// ── F1-5: un solo anillo de foco y objetivos táctiles base ────────────────────────────────────────────────────
// req: RNF-04, RNF-004 (foco visible ≥ 3:1; WCAG 2.4.7 y 2.4.11)
test('foco: una sola regla raíz :focus-visible de 3 px con halo y sin border-radius', () => {
  const rootRules = parsed.rules.filter(r => r.selector.trim() === ':focus-visible' && r.ats.length === 0);
  assert.equal(rootRules.length, 1, 'reglas :focus-visible raíz');
  const ring = new Map(parsed.decls.filter(d => d.selector.trim() === ':focus-visible' && d.ats.length === 0).map(d => [d.prop, d.value]));
  assert.equal(ring.get('outline'), '3px solid var(--ds-focus)');
  assert.equal(ring.get('outline-offset'), '2px');
  assert.equal(ring.get('box-shadow'), '0 0 0 2px var(--ds-focus-halo)');
  assert.equal(ring.has('border-radius'), false, 'el radio de 2 px recortaba las píldoras');
});

test('objetivos táctiles: 44 px y mínimo estricto de 24 px (WCAG 2.5.8) como tokens', () => {
  const root = new Map(parsed.decls.filter(d => d.selector.trim() === ':root' && d.ats.length === 0).map(d => [d.prop, d.value]));
  assert.equal(root.get('--ds-target-min'), '2.75rem');
  assert.equal(root.get('--ds-target-min-strict'), '1.5rem');
});

// ── F1-6: tokens de movimiento y «movimiento reducido» ─────────────────────────────────────────────────────────
const rootProps = (media = null) => new Map(parsed.decls
  .filter(d => d.selector.split(',').map(part => part.trim()).includes(':root')
    && (media === null ? d.ats.length === 0 : d.ats.some(at => at.includes(media))))
  .map(d => [d.prop, d.value]));

test('movimiento: duraciones y curvas separadas con los valores de §2.3', () => {
  const t = rootProps();
  const durations = { press: '100ms', fast: '160ms', base: '200ms', slow: '300ms', glass: '620ms', move: '200ms', fade: '160ms', umbral: '420ms', revelar: '300ms' };
  for (const [name, value] of Object.entries(durations)) assert.equal(t.get(`--ds-dur-${name}`), value, `--ds-dur-${name}`);
  assert.equal(t.get('--ds-ease-out'), 'cubic-bezier(0.23, 1, 0.32, 1)');
  assert.equal(t.get('--ds-ease-in-out'), 'cubic-bezier(0.77, 0, 0.175, 1)');
  assert.equal(t.get('--ds-ease-drawer'), 'cubic-bezier(0.32, 0.72, 0, 1)');
  for (const [prop, value] of t) {
    if (prop.startsWith('--ds-dur-')) assert.match(value, /^\d+(\.\d+)?ms$/, `${prop} solo duración`);
    if (prop.startsWith('--ds-ease-')) assert.match(value, /^cubic-bezier\([^)]*\)$/, `${prop} solo curva`);
  }
  assert.ok(![...t.values()].some(value => /(?<![\w-])ease-in(?![\w-])/.test(value)), 'nunca ease-in');
});

test('movimiento: los resortes de la barra de vidrio usan linear() donde existe y ease-out donde no', () => {
  const plain = rootProps();
  assert.equal(plain.get('--ds-spring-soft'), 'var(--ds-ease-out)');
  const supported = new Map(parsed.decls.filter(d => d.selector.trim() === ':root' && d.ats.some(at => at.includes('linear('))).map(d => [d.prop, d.value]));
  assert.match(supported.get('--ds-spring-soft'), /^linear\(0, 0\.050 4%/);
  assert.match(supported.get('--ds-spring-live'), /^linear\(0, 0\.086 4%/);
});

test('movimiento reducido: la geometría se anula por tokens y la opacidad conserva su fundido corto', () => {
  const reduced = rootProps('prefers-reduced-motion: reduce');
  // Revisión de F1 (I1): todas las duraciones colapsan salvo el fundido de opacidad.
  for (const name of ['press', 'fast', 'base', 'slow', 'move', 'glass', 'umbral', 'revelar']) assert.equal(reduced.get(`--ds-dur-${name}`), '0.01ms', name);
  assert.equal(reduced.has('--ds-dur-fade'), false, 'el fundido de opacidad sigue (≤ 160 ms)');
});

test('movimiento reducido: la red de seguridad para lo que no usa tokens excluye .ds-motion', () => {
  const net = parsed.decls.filter(d => d.ats.some(at => at.includes('prefers-reduced-motion: reduce')) && d.prop === 'animation-iteration-count');
  assert.equal(net.length, 1);
  // Revisión de F1 (I1): solo el elemento .ds-motion queda fuera; su contenido proyectado sigue cubierto.
  assert.match(net[0].selector, /:where\(:not\(\.ds-motion\)\)/);
  assert.doesNotMatch(net[0].selector, /\.ds-motion \*/);
  const props = new Map(parsed.decls.filter(d => d.selector === net[0].selector).map(d => [d.prop, d.value]));
  assert.equal(props.get('animation-duration'), '1ms !important');
  assert.equal(props.get('transition-duration'), '1ms !important');
  assert.equal(props.get('scroll-behavior'), 'auto !important');
});

test('los alias de movimiento heredados apuntan a los tokens', () => {
  const t = rootProps();
  assert.equal(t.get('--psy-ease-out'), 'var(--ds-ease-out)');
  assert.equal(t.get('--psy-motion-fast'), 'var(--ds-dur-fast) var(--ds-ease-out)');
  assert.equal(t.get('--psy-motion-ui'), 'var(--ds-dur-slow) var(--ds-ease-out)');
});

test('el foco programático de main no deja halo (revisión de F1)', () => {
  const props = new Map(parsed.decls.filter(d => d.selector.includes('#main-content:focus')).map(d => [d.prop, d.value]));
  assert.equal(props.get('outline'), 'none');
  assert.equal(props.get('box-shadow'), 'none');
});

test('las filas de ui-table conservan su hover (F7-1: la fila de la biblioteca, solo con puntero fino)', () => {
  // Antes `.attempts-table .mat-mdc-row:hover` en el SCSS del dashboard; desde F7-1 las tablas usan `tr[uiRow]` de la
  // biblioteca, cuyo hover vive en `ui-table.scss` y no depende de ninguna regla local. B5a quitó la tabla de intentos
  // del Inicio (ahora es la bandeja «Por revisar»): el consumidor que se comprueba es la tabla de Usuarios.
  const table = parseCss({ text: compileStylesFile('../app/shared/ui/table/ui-table.scss').css, startLine: 1 });
  const hover = table.decls.find(d => d.selector.trim() === '.ui-table__row:hover');
  assert.ok(hover, 'regla de hover de la fila');
  assert.ok(hover.ats.some(at => at.includes('(hover: hover) and (pointer: fine)')), 'solo con puntero fino');
  assert.equal(hover.value, 'var(--ds-surface-2)');
  const html = readFileSync(new URL('../../src/app/features/admin/users.component.html', import.meta.url), 'utf8');
  assert.match(html, /<tr uiRow[\s>]/, 'las filas de Usuarios son filas de ui-table');
});

// ── F2-1: utilidad global .ds-sr-only (la usan los componentes de shared/ui y sus consumidores) ───────────────
test('la hoja global expone .ds-sr-only con el mixin del lenguaje visual', () => {
  const rule = parsed.decls.filter(d => d.selector === '.ds-sr-only');
  const props = new Map(rule.map(d => [d.prop, d.value]));
  assert.equal(props.get('position'), 'absolute');
  assert.equal(props.get('clip-path'), 'inset(50%)');
});
