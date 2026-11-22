import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compileScss, propsFor } from './sass-test-utils.mjs';

/**
 * Tokens del lenguaje visual (plan visual §2.3, F1-1): una sola fuente de valores en src/styles/tokens y
 * src/styles/skins, emitida como propiedades personalizadas. Se prueba la SALIDA compilada.
 */
const ROOT = ':root';

const PORTAL_COLORS = {
  '--ds-surface-page': '#F5F7FA', '--ds-surface-1': '#FFFFFF', '--ds-surface-2': '#EEF2F6',
  '--ds-border': '#D5DDE6', '--ds-border-strong': '#6F8296',
  '--ds-text-1': '#14202E', '--ds-text-2': '#4A5A6A', '--ds-text-3': '#7A8794',
  '--ds-primary': '#004876', '--ds-primary-hover': '#003B63', '--ds-primary-active': '#002F50',
  '--ds-primary-subtle': '#E6F0F7', '--ds-on-primary': '#FFFFFF',
  '--ds-accent-sim': '#5B3FD1', '--ds-danger': '#A12C3B', '--ds-danger-hover': '#8A2532', '--ds-success': '#1E7A4F',
  '--ds-warning-text': '#7A4F00', '--ds-warning-bg': '#FFF4D6', '--ds-info': '#0B5A8A',
  '--ds-success-bg': '#E6F4EC', '--ds-danger-bg': '#FBE9EB', '--ds-info-bg': '#E5F0F8',
  '--ds-focus': '#004876', '--ds-focus-halo': '#FFFFFF',
};

function rootTokens() {
  return propsFor(compileScss("@use 'skins';").decls, ROOT);
}

test('la piel portal (:root) define los colores de §2.3 con sus valores exactos', () => {
  const props = rootTokens();
  for (const [name, value] of Object.entries(PORTAL_COLORS)) {
    assert.equal(props.get(name)?.toUpperCase(), value, name);
  }
});

test('escalas de espacio (rem), radios y capas', () => {
  const props = rootTokens();
  const space = ['0.25rem', '0.5rem', '0.75rem', '1rem', '1.5rem', '2rem', '3rem', '4rem'];
  space.forEach((value, i) => assert.equal(props.get(`--ds-space-${i + 1}`), value, `--ds-space-${i + 1}`));
  for (const [name, value] of Object.entries({ sm: '6px', md: '10px', lg: '16px', xl: '24px', pill: '999px' })) {
    assert.equal(props.get(`--ds-radius-${name}`), value, `--ds-radius-${name}`);
  }
  const z = { base: '0', elevado: '10', pegajoso: '20', cabecera: '40', desplegable: '60', cubierta: '80', modal: '100', aviso: '120', maximo: '1000' };
  for (const [name, value] of Object.entries(z)) assert.equal(props.get(`--ds-z-${name}`), value, `--ds-z-${name}`);
});

test('elevación en cuatro niveles; e0 es solo borde (sin sombra)', () => {
  const props = rootTokens();
  assert.equal(props.get('--ds-shadow-e0'), 'none');
  for (const level of ['e1', 'e2', 'e3']) assert.ok(props.get(`--ds-shadow-${level}`), `--ds-shadow-${level}`);
  // VD-3: nada de sombras duras «Npx Npx 0».
  for (const level of ['e1', 'e2', 'e3']) assert.doesNotMatch(props.get(`--ds-shadow-${level}`), /\d+px \d+px 0(?![.\d])/);
});

test('los espacios de nombres heredados resuelven por alias a los tokens nuevos', () => {
  const { decls } = compileScss("@use 'skins'; @use 'aliases';");
  const props = propsFor(decls, ROOT);
  const expected = {
    '--siep-blue': 'var(--ds-primary)', '--psy-blue-deep': 'var(--ds-primary)',
    '--siep-bg': 'var(--ds-surface-page)', '--psy-surface': 'var(--ds-surface-1)',
    '--psy-ink': 'var(--ds-text-1)', '--psy-muted': 'var(--ds-text-2)', '--psy-border': 'var(--ds-border)',
    '--psy-focus': 'var(--ds-focus)', '--psy-radius': 'var(--ds-radius-lg)', '--psy-space-4': 'var(--ds-space-4)',
    '--psy-shadow-card': 'var(--ds-shadow-e1)', '--psy-z-nav': 'var(--ds-z-cubierta)',
  };
  for (const [name, value] of Object.entries(expected)) assert.equal(props.get(name), value, name);
});

// ── F1-2: pieles portal y juego, contraste derivado de los tokens, contraste forzado y reducido ─────────────
import { contrastRatio } from '../../src/styles/contrast.util.ts';

const GAME = "[data-skin='game']";
const GAME_COLORS = {
  '--ds-surface-page': '#0E1322', '--ds-surface-1': '#151B2E', '--ds-surface-2': '#1D2540',
  '--ds-border': '#3A456B', '--ds-border-strong': '#6070A0',
  '--ds-text-1': '#E8ECF8', '--ds-text-2': '#A9B3CC', '--ds-text-3': '#6E7894',
  '--ds-primary': '#B69CFF', '--ds-primary-hover': '#C9B3FF', '--ds-primary-active': '#A58AF5',
  '--ds-primary-subtle': '#1D2540', '--ds-on-primary': '#0E1322',
  '--ds-accent-sim': '#B69CFF', '--ds-danger': '#FF8A93', '--ds-danger-hover': '#FFA3AA', '--ds-success': '#7DE0A8',
  '--ds-warning-text': '#F2C46D', '--ds-warning-bg': '#2B2410', '--ds-info': '#7FB7E6',
  '--ds-success-bg': '#13291F', '--ds-danger-bg': '#2E1519', '--ds-info-bg': '#12243A',
  '--ds-focus': '#C9B3FF', '--ds-focus-halo': '#0E1322',
};

function skinTokens(selector, media = null) {
  return propsFor(compileScss("@use 'skins';").decls, selector, media);
}

test('la piel juego redefine todos los colores en [data-skin="game"] y declara color-scheme oscuro', () => {
  const game = skinTokens(GAME);
  for (const [name, value] of Object.entries(GAME_COLORS)) assert.equal(game.get(name)?.toUpperCase(), value, name);
  assert.equal(game.get('color-scheme'), 'dark');
  assert.equal(skinTokens(ROOT).get('color-scheme'), 'light');
});

// req: RNF-04, RNF-004 (contraste derivado de los tokens, en las dos pieles)
for (const [skin, selector] of [['portal', ROOT], ['juego', GAME]]) {
  test(`contraste de la piel ${skin}: texto ≥ 4,5:1 y componentes y foco ≥ 3:1 sobre sus superficies`, () => {
    const t = skinTokens(selector);
    const surfaces = ['--ds-surface-page', '--ds-surface-1', '--ds-surface-2'].map(name => t.get(name));
    const atLeast = (fg, bg, min, label) => assert.ok(contrastRatio(fg, bg) >= min, `${label}: ${contrastRatio(fg, bg).toFixed(2)} < ${min}`);
    for (const bg of surfaces) {
      atLeast(t.get('--ds-text-1'), bg, 4.5, `text-1 sobre ${bg}`);
      atLeast(t.get('--ds-text-2'), bg, 4.5, `text-2 sobre ${bg}`);
      atLeast(t.get('--ds-border-strong'), bg, 3, `border-strong sobre ${bg}`);
      atLeast(t.get('--ds-focus'), bg, 3, `focus sobre ${bg}`);
    }
    const s1 = t.get('--ds-surface-1');
    for (const name of ['--ds-primary', '--ds-danger', '--ds-success', '--ds-info', '--ds-accent-sim']) atLeast(t.get(name), s1, 4.5, `${name} sobre surface-1`);
    atLeast(t.get('--ds-on-primary'), t.get('--ds-primary'), 4.5, 'on-primary sobre primary');
    // F2-1: el botón de peligro lleva el texto de on-primary en reposo y en hover.
    atLeast(t.get('--ds-on-primary'), t.get('--ds-danger'), 4.5, 'on-primary sobre danger');
    atLeast(t.get('--ds-on-primary'), t.get('--ds-danger-hover'), 4.5, 'on-primary sobre danger-hover');
    atLeast(t.get('--ds-warning-text'), t.get('--ds-warning-bg'), 4.5, 'warning-text sobre warning-bg');
    // F2-3: insignias y avisos tonales (texto del tono sobre su fondo).
    for (const tone of ['success', 'danger', 'info']) atLeast(t.get(`--ds-${tone}`), t.get(`--ds-${tone}-bg`), 4.5, `${tone} sobre ${tone}-bg`);
  });
}

test('contraste forzado: superficies Canvas, texto CanvasText, enlace LinkText y foco Highlight', () => {
  const forced = skinTokens('[data-skin]', 'forced-colors: active');
  assert.equal(forced.get('--ds-surface-1'), 'Canvas');
  assert.equal(forced.get('--ds-text-1'), 'CanvasText');
  assert.equal(forced.get('--ds-primary'), 'LinkText');
  assert.equal(forced.get('--ds-focus'), 'Highlight');
  assert.equal(forced.get('--ds-shadow-e1'), 'none');
  assert.equal(propsFor(compileScss("@use 'skins';").decls, ROOT, 'forced-colors: active').get('--ds-focus'), 'Highlight');
});

// req: RNF-04, RNF-004, BLOQUE-H (foco visible con contraste forzado, WCAG 2.4.7)
test('contraste forzado: todo token de anillo de foco vale Highlight (uno que valga Canvas desaparece sobre el fondo)', () => {
  const decls = compileScss("@use 'skins';").decls;
  const rings = [...propsFor(decls, ROOT).keys()].filter(name => name.startsWith('--ds-focus') && !name.endsWith('-halo'));
  assert.ok(rings.includes('--ds-focus-on-primary'), 'falta el foco para superficies de color primario');
  const forced = propsFor(decls, ROOT, 'forced-colors: active');
  for (const name of rings) assert.equal(forced.get(name), 'Highlight', name);
});

test('más contraste sube el borde y transparencia reducida quita velo y desenfoque', () => {
  assert.equal(skinTokens('[data-skin]', 'prefers-contrast: more').get('--ds-border'), 'var(--ds-border-strong)');
  const reduced = skinTokens('[data-skin]', 'prefers-reduced-transparency: reduce');
  assert.equal(reduced.get('--ds-veil'), 'var(--ds-surface-1)');
  assert.equal(reduced.get('--ds-glass-blur'), 'none');
});

// ── F1-3: escala tipográfica por tokens (rem; nunca menos de 12 px) ──────────────────────────────────────────
// req: RNF-04 (textos legibles: ningún token de tamaño < 0,75 rem)
test('escala tipográfica de §2.3 en rem, con interlineado, tracking y peso por rol', () => {
  const t = rootTokens();
  const scale = {
    display: ['3.25rem', '3.5rem', '-0.03em', '800'],
    h1: ['2.25rem', '2.625rem', '-0.02em', '800'],
    h2: ['1.75rem', '2.125rem', '-0.015em', '800'],
    h3: ['1.375rem', '1.75rem', '-0.01em', '600'],
    lead: ['1.125rem', '1.75rem', '0', '400'],
    body: ['1rem', '1.5rem', '0', '400'],
    'body-s': ['0.875rem', '1.25rem', '0.005em', '400'],
    caption: ['0.75rem', '1rem', '0.01em', '600'],
    mono: ['0.8125rem', '1.25rem', '0', '400'],
  };
  for (const [role, [size, line, track, weight]] of Object.entries(scale)) {
    assert.deepEqual(
      ['size', 'line', 'track', 'weight'].map(part => t.get(`--ds-type-${role}-${part}`)),
      [size, line, track, weight], role);
    assert.ok(Number.parseFloat(size) >= 0.75, `${role} < 0,75 rem`);
  }
  assert.match(t.get('--ds-font-sans'), /^'Poppins'/);
  assert.match(t.get('--ds-font-mono'), /^'JetBrains Mono'/);
});

test('los alias heredados solo viven en :root: las clases del portal dentro del juego conservan sus valores hasta F6', () => {
  // Declararlos también en [data-skin] pintó el «Continuar» heredado (.psy-button--primary, texto blanco) en
  // lavanda dentro del juego: 1,9:1 (e2e @quality). Las clases heredadas pasan a la piel juego en F6-1/F6-4,
  // junto con su texto (--ds-on-primary).
  const { decls } = compileScss("@use 'skins'; @use 'aliases';");
  assert.equal(propsFor(decls, ROOT).get('--psy-ink'), 'var(--ds-text-1)');
  assert.equal(propsFor(decls, '[data-skin]').has('--psy-ink'), false);
});

// ── B0 (rediseño del portal, 2026-11-21): el violeta como único color de acción, los materiales compartidos y el fondo ──
import { compileStylesFile } from './sass-test-utils.mjs';

const ACENTO = {
  '--ds-primary': '#5B3FD1', '--ds-primary-hover': '#4A30B8', '--ds-primary-active': '#3D2799',
  '--ds-primary-subtle': '#EEEAFC', '--ds-focus': '#4A30B8',
};
const SIN_FORZADOS = 'not (forced-colors: active)';
const PORTAL_CLARO = ".portal[data-skin='portal']";
const PUBLICO_CLARO = ".publico[data-skin='portal']";

// req: RNF-04, REGLA-010 (el acento va en el contenedor, no en :root)
for (const selector of [PORTAL_CLARO, PUBLICO_CLARO]) {
  test(`acento violeta: ${selector} redefine el primario, su hover, su pulsado, su tinte y el foco`, () => {
    const props = skinTokens(selector, SIN_FORZADOS);
    for (const [name, value] of Object.entries(ACENTO)) assert.equal(props.get(name)?.toUpperCase(), value, name);
    // Con colores forzados no se emite: ganaría (dos clases) a `[data-skin]` de _contrast.scss y dejaría el violeta.
    assert.equal(skinTokens(selector).size, 0, 'nada fuera de @media not (forced-colors)');
  });
}

test('acento violeta: :root conserva el azul petróleo (REGLA-010) y la piel juego no cambia', () => {
  const root = rootTokens();
  assert.equal(root.get('--ds-primary')?.toUpperCase(), '#004876');
  assert.equal(root.get('--ds-focus')?.toUpperCase(), '#004876');
  assert.equal(skinTokens(GAME).get('--ds-primary')?.toUpperCase(), '#B69CFF');
  // El petróleo sigue vivo como información.
  assert.equal(root.get('--ds-info')?.toUpperCase(), '#0B5A8A');
});

// req: RNF-04, RNF-004 (los pares nuevos, medidos sobre las superficies de la piel clara)
test('acento violeta: contraste de los pares nuevos sobre las superficies claras', () => {
  const root = rootTokens();
  const surfaces = ['--ds-surface-page', '--ds-surface-1', '--ds-surface-2'].map(name => root.get(name));
  const at = (fg, bg, min, label) => assert.ok(contrastRatio(fg, bg) >= min, `${label}: ${contrastRatio(fg, bg).toFixed(2)} < ${min}`);
  for (const bg of surfaces) {
    at(ACENTO['--ds-primary'], bg, 4.5, `primary sobre ${bg}`);
    at(ACENTO['--ds-primary-hover'], bg, 4.5, `primary-hover sobre ${bg}`);
    at(ACENTO['--ds-focus'], bg, 3, `focus sobre ${bg}`);
  }
  const onPrimary = root.get('--ds-on-primary');
  for (const name of ['--ds-primary', '--ds-primary-hover', '--ds-primary-active']) at(onPrimary, ACENTO[name], 4.5, `on-primary sobre ${name}`);
  at(ACENTO['--ds-primary'], ACENTO['--ds-primary-subtle'], 4.5, 'primary sobre su tinte');
  at(root.get('--ds-text-1'), ACENTO['--ds-primary-subtle'], 4.5, 'text-1 sobre el tinte');
  at(ACENTO['--ds-focus'], root.get('--ds-focus-halo'), 3, 'focus sobre su halo');
});

const hoja = compileStylesFile('styles.scss');
const enHoja = (selector, media = null) => propsFor(hoja.decls, selector, media);

// Los materiales de la portada (`--l-*`) tal como estaban en `.publico` antes de moverlos a _materiales.scss.
const MATERIALES_BASE = {
  '--l-acento': 'var(--ds-accent-sim)',
  '--l-acento-tinta': 'var(--ds-primary-hover)',
  '--l-filo': 'color-mix(in oklab, var(--ds-text-1) 10%, transparent)',
  '--l-filo-fuerte': 'color-mix(in oklab, var(--ds-text-1) 17%, transparent)',
  '--l-brillo': 'color-mix(in oklab, var(--ds-text-1) 9%, transparent)',
  '--l-vidrio': 'color-mix(in oklab, var(--ds-surface-1) 72%, transparent)',
  '--l-vidrio-alto': 'color-mix(in oklab, var(--ds-surface-2) 78%, transparent)',
  '--l-relleno': 'color-mix(in oklab, var(--ds-text-1) 5%, transparent)',
  '--l-tinte': 'color-mix(in oklab, var(--l-acento) 16%, transparent)',
  '--l-tinte-filo': 'color-mix(in oklab, var(--l-acento) 34%, transparent)',
  '--l-trama': 'color-mix(in oklab, var(--ds-text-1) 4.5%, transparent)',
  '--l-sombra': '0 1px 1px color-mix(in oklab, black 22%, transparent), 0 12px 32px -14px color-mix(in oklab, black 60%, transparent)',
  '--l-sombra-alta': '0 2px 6px color-mix(in oklab, black 22%, transparent), 0 30px 70px -24px color-mix(in oklab, black 70%, transparent)',
  '--l-radio': '1.5rem', '--l-radio-chico': '0.875rem', '--l-curva': 'var(--ds-ease-drawer)',
  '--marca-cian': '#1dbce7', '--marca-azul': '#1576d6', '--l-entrada': 'var(--ds-dur-glass)',
};
const MATERIALES_CLARO = {
  '--l-acento-tinta': 'var(--ds-accent-sim)',
  '--l-filo': 'color-mix(in oklab, var(--ds-text-1) 9%, transparent)',
  '--l-filo-fuerte': 'color-mix(in oklab, var(--ds-text-1) 15%, transparent)',
  '--l-brillo': 'color-mix(in oklab, white 90%, transparent)',
  '--l-vidrio': 'color-mix(in oklab, var(--ds-surface-1) 80%, transparent)',
  '--l-vidrio-alto': 'color-mix(in oklab, var(--ds-surface-1) 90%, transparent)',
  '--l-relleno': 'color-mix(in oklab, var(--ds-text-1) 3.5%, transparent)',
  '--l-tinte': 'color-mix(in oklab, var(--l-acento) 10%, transparent)',
  '--l-tinte-filo': 'color-mix(in oklab, var(--l-acento) 26%, transparent)',
  '--l-trama': 'color-mix(in oklab, var(--ds-text-1) 6%, transparent)',
  '--l-sombra': '0 1px 2px color-mix(in oklab, var(--ds-text-1) 6%, transparent), 0 12px 32px -16px color-mix(in oklab, var(--ds-text-1) 22%, transparent)',
  '--l-sombra-alta': '0 2px 6px color-mix(in oklab, var(--ds-text-1) 7%, transparent), 0 30px 70px -28px color-mix(in oklab, var(--ds-text-1) 30%, transparent)',
};

test('materiales: ningún --l-* de la portada cambia de valor al moverse a _materiales.scss', () => {
  const base = enHoja('.publico');
  for (const [name, value] of Object.entries(MATERIALES_BASE)) assert.equal(base.get(name), value, `.publico ${name}`);
  const claro = enHoja(PUBLICO_CLARO);
  for (const [name, value] of Object.entries(MATERIALES_CLARO)) assert.equal(claro.get(name), value, `${PUBLICO_CLARO} ${name}`);
  assert.equal(claro.get('color-scheme'), 'light');
  assert.equal(base.get('color-scheme'), 'dark');
});

test('materiales: .portal emite los mismos materiales que .publico, en las dos pieles', () => {
  const portal = enHoja('.portal');
  for (const [name, value] of Object.entries(MATERIALES_BASE)) assert.equal(portal.get(name), value, `.portal ${name}`);
  const claro = enHoja(PORTAL_CLARO);
  for (const [name, value] of Object.entries(MATERIALES_CLARO)) assert.equal(claro.get(name), value, `${PORTAL_CLARO} ${name}`);
  assert.equal(claro.get('color-scheme'), 'light');
});

test('materiales: los tokens de las pantallas de trabajo, derivados de --ds-* (sombra de trabajo distinta por piel)', () => {
  const portal = enHoja('.portal');
  const esperado = {
    '--l-superficie': 'var(--ds-surface-1)', '--l-superficie-hundida': 'var(--ds-surface-2)',
    '--l-fila-encima': 'color-mix(in oklab, var(--ds-text-1) 4%, transparent)',
    '--l-fila-elegida': 'color-mix(in oklab, var(--l-acento) 10%, transparent)',
    '--l-radio-tarjeta': '1.25rem', '--l-radio-control': '0.75rem',
    '--l-ancho-lectura': '42rem', '--l-ancho-pagina': '75rem', '--l-ancho-amplio': '90rem',
    '--l-canal': 'clamp(1rem, 3vw, 2.25rem)', '--l-alto-barra': 'calc(5.5rem + env(safe-area-inset-top, 0px))', '--l-pixel': '2px',
  };
  for (const [name, value] of Object.entries(esperado)) assert.equal(portal.get(name), value, name);
  // Oscuro: un filo de luz arriba (una sombra no se ve sobre fondo oscuro). Claro: sombra suave tintada con la tinta.
  assert.match(portal.get('--l-sombra-trabajo'), /^inset 0 1px 0 color-mix\(in oklab, white 6%/);
  assert.match(enHoja(PORTAL_CLARO).get('--l-sombra-trabajo'), /^0 1px 2px color-mix\(in oklab, var\(--ds-text-1\) 5%.*0 8px 24px -18px/);
  // En móvil la barra fija es la banda baja, no el alto de escritorio.
  assert.match(enHoja('.portal', 'max-width: 63.999rem').get('--l-alto-barra'), /var\(--asb-alto-modulo-superior\)/);
});

test('materiales: transparencia reducida y más contraste vuelven sólido el vidrio también en .portal', () => {
  const reducido = enHoja('.portal', 'prefers-reduced-transparency: reduce');
  assert.equal(reducido.get('--l-vidrio'), 'var(--ds-surface-1)');
  assert.equal(reducido.get('--l-vidrio-alto'), 'var(--ds-surface-2)');
  assert.equal(reducido.get('--l-filo'), 'var(--ds-border-strong)');
});

// req: REGLA-010 (nada del portal ni de los materiales en :root, html ni body)
test('REGLA-010: ni :root, ni html, ni body declaran materiales --l-* ni el acento; el fondo de body es un token', () => {
  const globales = hoja.decls.filter(d => ['html', 'body'].includes(d.selector.trim())
    || (d.selector.trim() === ':root' && d.ats.length === 0));
  for (const d of globales) {
    assert.doesNotMatch(d.prop, /^--l-|^--marca-/, `${d.selector} { ${d.prop} }`);
  }
  assert.equal(enHoja('body').get('background'), 'var(--ds-surface-page)');
  assert.doesNotMatch(hoja.css, /body\s*\{[^}]*(#FAFAFA|#ECECEC)/i);
});

test('portal: fondo con luz ambiental detrás del contenido y títulos en tinta de la piel', () => {
  const portal = enHoja('.portal');
  assert.equal(portal.get('min-height'), '100dvh');
  assert.equal(portal.get('isolation'), 'isolate');
  assert.equal(portal.get('background'), 'var(--ds-surface-page)');
  const luz = enHoja('.portal::before');
  assert.equal(luz.get('position'), 'fixed');
  assert.equal(luz.get('z-index'), 'calc(var(--ds-z-base) - 1)');
  assert.match(luz.get('background'), /radial-gradient.*radial-gradient/);
  assert.equal(enHoja('.portal :is(h1, h2, h3)').get('color'), 'var(--ds-text-1)');
  // Escala del portal (DISENO §2.4): el h2 deja de gritar.
  assert.equal(portal.get('--ds-type-h2-size'), '1.375rem');
  assert.equal(portal.get('--ds-type-h2-weight'), '600');
});

test('portal: primitivas de maquetación (.p-pagina, .p-rejilla, .p-dividida, .p-pegajosa)', () => {
  const pagina = enHoja('.p-pagina');
  assert.equal(pagina.get('max-inline-size'), 'var(--l-ancho-pagina)');
  assert.equal(pagina.get('margin-inline'), 'auto');
  assert.equal(pagina.get('padding-inline'), 'var(--l-canal)');
  assert.equal(enHoja('.p-pagina--amplia').get('max-inline-size'), 'var(--l-ancho-amplio)');
  assert.equal(enHoja('.p-pagina--lectura').get('max-inline-size'), 'var(--l-ancho-lectura)');
  assert.match(enHoja('.p-rejilla').get('grid-template-columns'), /^repeat\(auto-fill, minmax\(min\(100%, var\(--p-min, 20rem\)\), 1fr\)\)$/);
  assert.equal(enHoja('.p-rejilla--18').get('--p-min'), '18rem');
  assert.equal(enHoja('.p-rejilla--24').get('--p-min'), '24rem');
  // Una columna por debajo de 64rem; dos (o tres) desde ahí.
  assert.equal(enHoja('.p-dividida').get('grid-template-columns'), 'minmax(0, 1fr)');
  assert.match(enHoja('.p-dividida', 'min-width: 64rem').get('grid-template-columns'), /var\(--p-lateral, 22rem\)/);
  assert.match(enHoja('.p-dividida--tres', 'min-width: 64rem').get('grid-template-columns'), /var\(--p-bandeja, 18rem\).*var\(--p-lateral, 26rem\)/);
  const pegajosa = enHoja('.p-pegajosa', 'min-width: 64rem');
  assert.equal(pegajosa.get('position'), 'sticky');
  assert.equal(pegajosa.get('top'), 'calc(var(--l-alto-barra) + var(--ds-space-4))');
  // En una sola columna no pega: taparía el contenido.
  assert.equal(enHoja('.p-pegajosa').has('position'), false);
});

test('portal: la barra fija no tapa el foco (scroll-padding) en escritorio y en móvil', () => {
  assert.match(enHoja('html:has(app-shell.portal)').get('scroll-padding-top'), /^calc\(5\.5rem \+ env\(safe-area-inset-top, 0px\) \+ 1rem\)$/);
  const movil = enHoja('html:has(app-shell.portal)', 'max-width: 63.999rem');
  assert.match(movil.get('scroll-padding-top'), /var\(--asb-alto-modulo-superior\)/);
  assert.match(movil.get('scroll-padding-bottom'), /var\(--asb-alto-modulo-inferior\)/);
});

test('barra de vidrio: los alias del cromo se adaptan a .publico y a .portal con la misma regla', () => {
  const cromo = enHoja(':is(.publico, .portal) .cromo');
  assert.equal(cromo.get('--asb-linea'), 'var(--l-filo-fuerte)');
  assert.equal(cromo.get('--asb-filo'), 'var(--l-brillo)');
  assert.equal(enHoja('.publico .cromo').size, 0, 'el selector viejo ya no existe');
});

test('Material: el primario violeta se vuelve a atar en el portal y la portada claros', () => {
  for (const selector of [PORTAL_CLARO, PUBLICO_CLARO]) {
    assert.equal(enHoja(selector).get('--mat-sys-primary'), 'var(--ds-primary)', selector);
  }
});
