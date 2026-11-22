import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { METRICS, collectBlocks, countMetrics, compareToBaseline, scanSourceTree } from './ui-lint-lib.mjs';

/** Cuenta una sola métrica sobre archivos en memoria. */
function count(metric, files) {
  return countMetrics(collectBlocks(files)).counts[metric];
}
const scss = (text, path = 'src/app/x/x.component.scss') => [{ path, text }];
const component = (styles, template = '<p>x</p>', path = 'src/app/x/x.component.ts') => [{
  path,
  text: `@Component({\n  selector: 'app-x',\n  template: \`${template}\`,\n  styles: [\`${styles}\`],\n})\nexport class X {}\n`,
}];

test('expone las métricas del plan visual (§4 F0-2)', () => {
  for (const metric of ['colorLiterals', 'transitionAll', 'easeIn', 'scale0', 'infiniteAnimation', 'hoverUnguarded', 'important',
    'zIndexLiteral', 'fontSizeLiteral', 'backdropFilter', 'clickableNoActive', 'inlineStyleAttr', 'bodyGameMode', 'unaccentedCopy']) {
    assert.ok(METRICS.includes(metric), metric);
  }
});

test('colorLiterals: hex y rgb/hsl en declaraciones; no en comentarios, url() ni tokens de piel', () => {
  assert.equal(count('colorLiterals', scss('.a { color: #fff; background: rgba(0,0,0,.5); border-color: hsl(10 20% 30%); }')), 3);
  assert.equal(count('colorLiterals', scss('.a { color: var(--ds-text-1); } // #fff en comentario\n/* #000 */')), 0);
  assert.equal(count('colorLiterals', scss('.a { filter: url(#sombra); }')), 0);
  assert.equal(count('colorLiterals', scss(':root { --x: #004876; }')), 1, 'token fuera de tokens/ cuenta');
  assert.equal(count('colorLiterals', scss(':root { --x: #004876; }', 'src/styles/tokens/_color.scss')), 0);
  assert.equal(count('colorLiterals', scss('$azul: #004876;\n.a { color: $azul; }', 'src/styles/_variables.scss')), 1);
  assert.equal(count('colorLiterals', component('.a { color: #123456; }')), 1, 'estilos en línea del componente');
});

test('transitionAll, easeIn y scale0', () => {
  assert.equal(count('transitionAll', scss('.a { transition: all .2s; } .b { transition: opacity .2s, transform .2s; }')), 1);
  assert.equal(count('easeIn', scss('.a { transition: opacity .2s ease-in; } .b { transition: opacity .2s ease-in-out; }')), 1);
  assert.equal(count('easeIn', scss(':root { --e: ease-in; } .a { transition-timing-function: var(--e); }')), 1, 'resuelve var()');
  assert.equal(count('scale0', scss('.a { transform: scale(0); } .b { transform: scale(0.97); } .c { scale: 0; }')), 2);
});

test('infiniteAnimation: cuenta los bucles infinitos que no son un indicador de carga (esqueleto, spinner, progreso)', () => {
  assert.equal(count('infiniteAnimation', scss('.a { animation: blink .6s step-end infinite; }')), 1);
  assert.equal(count('infiniteAnimation', scss('.a { animation: ui-spinner-turn .8s linear infinite; } .b { animation: ui-skeleton-shimmer 1.4s linear infinite; } .c { animation: ui-progress-slide 1.4s ease infinite; } .d { animation: siep-boot-slide 1100ms linear infinite; }')), 0);
  assert.equal(count('infiniteAnimation', scss('.a { animation: pulse 1s ease 3; } .b { animation: pulse 1s ease both; }')), 0);
  assert.equal(count('infiniteAnimation', scss('.a { animation-name: sheen; animation-iteration-count: infinite; }')), 1);
  assert.equal(count('infiniteAnimation', scss('.a { animation-name: ui-spinner-turn; animation-iteration-count: infinite; }')), 0);
});

test('hoverUnguarded: solo cuenta :hover fuera de @media (hover: hover)', () => {
  assert.equal(count('hoverUnguarded', scss('.a:hover { color: red; }')), 1);
  assert.equal(count('hoverUnguarded', scss('@media (hover: hover) and (pointer: fine) { .a:hover { color: red; } }')), 0);
  assert.equal(count('hoverUnguarded', scss('@media (hover: hover) { @media (min-width: 640px) { .a:hover { color: red; } } }')), 0);
});

test('important, zIndexLiteral, fontSizeLiteral y backdropFilter', () => {
  assert.equal(count('important', scss('.a { color: red !important; margin: 0; }')), 1);
  assert.equal(count('zIndexLiteral', scss('.a { z-index: 40; } .b { z-index: var(--ds-z-cabecera); } .c { z-index: 0; }')), 1);
  assert.equal(count('fontSizeLiteral', scss('.a { font-size: 14px; } .b { font-size: var(--ds-type-body); } .c { font-size: inherit; }')), 1);
  assert.equal(count('backdropFilter', scss('.a { backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); } .b { backdrop-filter: none; }')), 2);
});

test('clickableNoActive: botones y enlaces sin :active en su ámbito; Material no cuenta', () => {
  assert.equal(count('clickableNoActive', component('.btn { color: red; }', '<button class="btn">A</button>')), 1);
  assert.equal(count('clickableNoActive', component('.btn:active { transform: scale(.97); }', '<button class="btn">A</button>')), 0);
  assert.equal(count('clickableNoActive', component('', '<button mat-button>A</button><a href="/x" role="button" class="k">B</a>')), 1);
  const globalActive = [{ path: 'src/styles/styles.scss', text: '.psy-button:active { transform: scale(.97); }' }];
  assert.equal(count('clickableNoActive', [...globalActive, ...component('', '<a class="psy-button" href="/">A</a>')]), 0, 'la regla global de styles.scss vale');
  // F3-1: los parciales de src/styles que importa styles.scss también son globales (la barra de vidrio).
  const partialActive = [{ path: 'src/styles/components/_glass-bar.scss', text: ':where(.cromo) .nav-enlace:active { opacity: .55; }' }];
  assert.equal(count('clickableNoActive', [...partialActive, ...component('', '<a class="nav-enlace" href="/">A</a>')]), 0, 'un parcial global de src/styles vale');
  const otherComponent = [{ path: 'src/app/y/y.component.scss', text: '.nav-enlace:active { opacity: .55; }' }];
  assert.equal(count('clickableNoActive', [...otherComponent, ...component('', '<a class="nav-enlace" href="/">A</a>')]), 1, 'el :active de OTRO componente no vale');
  // F2-1: los componentes de shared/ui traen su propio :active (como Material).
  assert.equal(count('clickableNoActive', component('', '<button ui-button>A</button><button ui-icon-button icon="close" label="Cerrar"></button><a ui-link href="/x">B</a><a class="z" ui-button variant="ghost" href="/">C</a>')), 0);
  assert.equal(count('clickableNoActive', component('', '<button data-ui-button-like>A</button>')), 1, 'solo los atributos exactos de la biblioteca');
});

test('inlineStyleAttr y bodyGameMode', () => {
  assert.equal(count('inlineStyleAttr', component('', '<div style="color: red">x</div><div [style.color]="c">y</div>')), 1);
  assert.equal(count('bodyGameMode', scss('body.game-mode .eyebrow { color: red; } .game-container .x { color: blue; }', 'src/styles/styles.scss')), 1);
});

test('unaccentedCopy: faltas de tilde en texto visible, no en claves ni código', () => {
  const tpl = '<h1>Edicion de casos</h1><input placeholder="Titulo del caso"><p>{{ item.descripcion }}</p>';
  assert.equal(count('unaccentedCopy', component('', tpl)), 2);
  const ts = [{ path: 'src/app/x/x.service.ts', text: "const key = 'hospital-accion-etica';\nthis.error.set('Revisa que el codigo no exista');\nconsole.warn('sin conexion con el servidor');\n" }];
  assert.equal(count('unaccentedCopy', ts), 1, 'solo la frase visible; ni la clave ni el log');
  assert.equal(count('unaccentedCopy', component('', '<p>Edición de casos y sesiones</p>')), 0, 'plurales correctos sin tilde no cuentan');
});

test('unaccentedCopy: ignora bloques de control con paréntesis anidados, comentarios, ligaduras de iconos, claves y rutas', () => {
  const tpl = [
    '@for (brecha of brechas(); track brecha.titulo) { <li>{{ brecha.titulo }}</li> }',
    '@if (report()!.simulacion; as sim) { <p>ok</p> }',
    '<!-- Decision form -->',
    '<mat-icon>menu_book</mat-icon>',
    '<mat-icon aria-hidden="true">menu</mat-icon>',
    '<input placeholder="historia-clinica">',
  ].join('\n');
  assert.equal(count('unaccentedCopy', component('', tpl)), 0);
  assert.equal(count('unaccentedCopy', component('', '<mat-icon>menu</mat-icon><span>Abrir menu</span>')), 1, 'el texto de al lado sí cuenta');
  const ts = [{ path: 'src/app/core/api/x.api.ts', text: 'const url = `/api/admin/cases/${id}/clone-version`;\n' }];
  assert.equal(count('unaccentedCopy', ts), 0);
  const selectors = [{
    path: 'src/app/x/x.component.ts',
    text: "host.querySelector<HTMLElement>('.modulo-inferior:not([hidden]) .pestana');\nel.closest('.menu .pestana');\nel.matches('nav .pestana');\nthis.aviso.set('Abre el menu de ayuda');\n",
  }];
  assert.equal(count('unaccentedCopy', selectors), 1, 'los selectores de querySelector/closest/matches no son texto; la frase sí');
});

test('los specs y utilidades de prueba no cuentan', () => {
  assert.equal(count('colorLiterals', [{ path: 'src/app/x/x.component.spec.ts', text: "styles: [`.a { color: #fff; }`]" }]), 0);
});

test('countMetrics devuelve el detalle con ruta y línea', () => {
  const result = countMetrics(collectBlocks(scss('.a {\n  color: #fff;\n}')));
  assert.equal(result.details.colorLiterals[0].at, 'src/app/x/x.component.scss:2');
});

test('compareToBaseline: detecta subidas y bajadas; una métrica sin baseline se informa', () => {
  const baseline = { version: 1, counts: { important: 5, transitionAll: 2 } };
  const verdict = compareToBaseline({ important: 6, transitionAll: 1, easeIn: 0 }, baseline);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.rises, [{ metric: 'important', before: 5, now: 6 }]);
  assert.deepEqual(verdict.drops, [{ metric: 'transitionAll', before: 2, now: 1 }]);
  assert.deepEqual(verdict.missing, ['easeIn']);
  assert.equal(compareToBaseline({ important: 5, transitionAll: 2 }, baseline).ok, true);
});

test('scanSourceTree recorre un árbol real y omite specs', () => {
  const root = mkdtempSync(join(tmpdir(), 'ui-lint-'));
  try {
    mkdirSync(join(root, 'src', 'app', 'x'), { recursive: true });
    mkdirSync(join(root, 'src', 'styles'), { recursive: true });
    writeFileSync(join(root, 'src', 'styles', 'styles.scss'), '.a { transition: all .2s; }');
    writeFileSync(join(root, 'src', 'app', 'x', 'x.component.ts'), "@Component({ styles: [`.b { color: #000 !important; }`] }) class X {}");
    writeFileSync(join(root, 'src', 'app', 'x', 'x.component.spec.ts'), "styles: [`.c { transition: all 1s; }`]");
    const { counts } = scanSourceTree(join(root, 'src'));
    assert.equal(counts.transitionAll, 1);
    assert.equal(counts.important, 1);
    assert.equal(counts.colorLiterals, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('la biblioteca de mixins no cuenta como uso; cada @include de ds-glass cuenta como un vidrio', () => {
  const library = [{ path: 'src/styles/mixins/_glass.scss', text: '@mixin ds-glass { &::before { z-index: -1; backdrop-filter: var(--ds-glass-blur); color: #fff; } }' }];
  assert.equal(count('backdropFilter', library), 0);
  assert.equal(count('zIndexLiteral', library), 0);
  assert.equal(count('colorLiterals', library), 0);
  const usage = [{ path: 'src/app/shared/ui/x/x.component.scss', text: "@use 'mixins' as m;\n.bar { @include m.ds-glass; }\n.menu { @include ds-glass; }" }];
  assert.equal(count('backdropFilter', usage), 2);
});
