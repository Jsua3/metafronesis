import { readFileSync } from 'fs';
import { join } from 'path';

import { contrastRatio, rgbToHex } from './contrast.util';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

// ── color-mix(in oklab, …) calculado, no aproximado: la mezcla de CSS es en OKLab, no en sRGB ────────────────────────
type Terna = [number, number, number];
const aLineal = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const deLineal = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function hexAOklab(hex: string): Terna {
  const [r, g, b] = [1, 3, 5].map(i => aLineal(parseInt(hex.slice(i, i + 2), 16) / 255));
  const [l, m, s] = [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  ].map(Math.cbrt);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabAHex([L, A, B]: Terna): string {
  const [l, m, s] = [L + 0.3963377774 * A + 0.2158037573 * B, L - 0.1055613458 * A - 0.0638541728 * B, L - 0.0894841775 * A - 1.291485548 * B]
    .map(v => v ** 3);
  const lineal = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgbToHex(lineal.map(v => 255 * deLineal(Math.min(1, Math.max(0, v)))) as Terna);
}

/** `color-mix(in oklab, <a> <porcentaje>%, <b>)` con dos colores opacos. */
function mezclaOklab(a: string, porcentaje: number, b: string): string {
  const [x, y] = [hexAOklab(a), hexAOklab(b)];
  const t = porcentaje / 100;
  return oklabAHex(x.map((v, i) => v * t + y[i] * (1 - t)) as Terna);
}

// ── Valores de los tokens, leídos de la fuente (no copiados) ────────────────────────────────────────────────────────
const color = source('./tokens/_color.scss');
const materiales = source('./components/_materiales.scss');

/** El valor hexadecimal de `<nombre>:` dentro del mapa `$<mapa>: ( … );` de `_color.scss`. */
function token(mapa: string, nombre: string): string {
  const bloque = color.match(new RegExp(`\\$${mapa}: \\(([\\s\\S]*?)\\n\\);`));
  const valor = bloque?.[1].match(new RegExp(`^\\s*${nombre}: (#[0-9A-Fa-f]{6}),`, 'm'));
  if (!valor) throw new Error(`Sin ${nombre} en $${mapa}`);
  return valor[1];
}

/** El porcentaje de acento de `--l-etiqueta-fondo` en el mixin dado (`materiales` o `materiales-claro`). */
function porcentajeDeFondo(mixin: 'materiales' | 'materiales-claro'): number {
  const inicio = materiales.indexOf(`@mixin ${mixin} {`);
  const bloque = materiales.slice(inicio, materiales.indexOf('\n}', inicio));
  const hallado = bloque.match(/--l-etiqueta-fondo: color-mix\(in oklab, var\(--l-acento\) (\d+)%, var\(--ds-surface-1\)\);/);
  if (!hallado) throw new Error(`Sin --l-etiqueta-fondo en ${mixin}`);
  return Number(hallado[1]);
}

/** Las dos pieles con los valores que de verdad resuelve cada una (el portal claro lleva además el acento violeta). */
const PIELES = {
  portal: {
    acento: token('portal', 'accent-sim'),
    superficie: token('portal', 'surface-1'),
    tinta: token('portal-acento', 'primary-hover'),
    porcentaje: () => porcentajeDeFondo('materiales-claro'),
    foco: token('portal-acento', 'focus'),
    halo: token('portal', 'focus-halo'),
  },
  game: {
    acento: token('game', 'accent-sim'),
    superficie: token('game', 'surface-1'),
    tinta: token('game', 'primary-hover'),
    porcentaje: () => porcentajeDeFondo('materiales'),
    foco: token('game', 'focus'),
    halo: token('game', 'focus-halo'),
  },
} as const;

// req: RNF-004 (contraste ≥ 4,5:1 en texto normal; WCAG 1.4.3 y 1.4.11)
describe('contraste: etiqueta (antetítulo en píldora)', () => {
  for (const [nombre, piel] of Object.entries(PIELES)) {
    it(`piel ${nombre}: la tinta sobre su fondo opaco pasa AA con holgura (texto de 12 px)`, () => {
      const fondo = mezclaOklab(piel.acento, piel.porcentaje(), piel.superficie);
      // 4,5:1 es el mínimo de WCAG; se exige 6:1 para que la antialias, el zoom y un redondeo no lo rocen.
      expect(contrastRatio(piel.tinta, fondo)).toBeGreaterThanOrEqual(6);
    });
  }

  it('el fondo no es translúcido: no depende de lo que haya detrás (luz ambiental, doodles, ilustraciones)', () => {
    expect(materiales).not.toMatch(/--l-etiqueta-fondo:[^;]*transparent/);
    // Antes el fondo era `--l-tinte` (acento al 10 % sobre transparente) con la tinta de marca (#5B3FD1): sobre la luz
    // violeta del portal, arriba a la izquierda, bajaba a ≈ 4,8:1 y axe lo medía con la animación de entrada.
    const luz = mezclaOklab(PIELES.portal.acento, 9, '#F5F7FA');
    const antes = mezclaOklab(PIELES.portal.acento, 10, luz);
    expect(contrastRatio(PIELES.portal.acento, antes)).toBeLessThan(5.5);
  });

  it('el anillo de la píldora (filo) es decorativo: el texto no lo necesita para superar AA', () => {
    for (const piel of Object.values(PIELES)) {
      const fondo = mezclaOklab(piel.acento, piel.porcentaje(), piel.superficie);
      expect(contrastRatio(piel.tinta, fondo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('las tres etiquetas con firma (cabecera, portal y portada) leen los dos tokens, sin pintar con --l-tinte', () => {
    const cabecera = source('../app/shared/ui/page-header/ui-page-header.scss');
    const eyebrow = cabecera.match(/\.ui-page-header__eyebrow \{[^}]*\}/)![0];
    expect(eyebrow).toMatch(/background: var\(--l-etiqueta-fondo, /);
    expect(eyebrow).toMatch(/color: var\(--l-etiqueta-tinta, /);
    expect(eyebrow).not.toMatch(/--l-acento-tinta|background: var\(--l-tinte/);

    const portal = source('./components/_portal.scss');
    const etiquetaPortal = portal.match(/\.portal \.p-etiqueta \{[^}]*\}/)![0];
    expect(etiquetaPortal).toMatch(/background: var\(--l-etiqueta-fondo\);/);
    expect(etiquetaPortal).toMatch(/color: var\(--l-etiqueta-tinta\);/);

    const publico = source('./components/_publico.scss');
    const etiquetaPublica = publico.match(/\.publico :is\(\.pub-etiqueta[^{]*\{[^}]*\}/)![0];
    expect(etiquetaPublica).toMatch(/background: var\(--l-etiqueta-fondo\);/);
    expect(etiquetaPublica).toMatch(/color: var\(--l-etiqueta-tinta\);/);
  });

  it('una ventana oscura dentro del portal claro vuelve a emitir los tokens: se calculan donde se declaran', () => {
    const portal = source('./components/_portal.scss');
    const ventana = portal.match(/\.portal \[data-skin='game'\] \{[^}]*\}/)![0];
    expect(ventana).toMatch(/--l-etiqueta-tinta: var\(--ds-primary-hover\);/);
    expect(ventana).toMatch(/--l-etiqueta-fondo: color-mix\(in oklab, var\(--l-acento\) 16%, var\(--ds-surface-1\)\);/);
  });

  it('el fondo que cae fuera del portal (galería, editor) también supera AA con los valores por defecto', () => {
    // `var(--l-etiqueta-fondo, var(--ds-primary-subtle))` y `var(--l-etiqueta-tinta, var(--ds-primary))`.
    expect(contrastRatio(token('portal', 'primary'), token('portal', 'primary-subtle'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token('game', 'primary'), token('game', 'primary-subtle'))).toBeGreaterThanOrEqual(4.5);
  });
});

// req: RNF-004 (foco visible; WCAG 2.4.7, 2.4.11 y 1.4.11)
describe('foco visible: doble contorno', () => {
  const mixin = source('./mixins/_focus.scss');

  it('el anillo es el contorno del foco y el halo lo rodea por dentro (2 px) y por fuera (7 px, bajo el contorno)', () => {
    const regla = mixin.match(/@mixin ds-focus-ring \{[^}]*\}/)![0];
    expect(regla).toMatch(/outline: 3px solid var\(--ds-focus\);/);
    expect(regla).toMatch(/outline-offset: 2px;/);
    expect(regla).toMatch(/0 0 0 2px var\(--ds-focus-halo\),\s*0 0 0 7px var\(--ds-focus-halo\);/);
  });

  it('un solo estilo global lo aplica a todo lo enfocable', () => {
    expect(source('./base/_focus.scss')).toMatch(/:focus-visible \{\s*@include ds-focus-ring;/);
  });

  for (const [nombre, piel] of Object.entries(PIELES)) {
    it(`piel ${nombre}: el anillo y el halo contrastan entre sí ≥ 3:1, así siempre queda un borde visible sobre cualquier fondo`, () => {
      expect(contrastRatio(piel.foco, piel.halo)).toBeGreaterThanOrEqual(3);
      // Y el anillo se distingue de la superficie sobre la que está, como mínimo para 1.4.11.
      expect(contrastRatio(piel.foco, piel.superficie)).toBeGreaterThanOrEqual(3);
    });
  }
});

// req: RNF-004 (WCAG 2.4.1: saltar bloques)
describe('«Saltar al contenido»: estilo y destino', () => {
  const estilos = source('./styles.scss');
  const regla = estilos.match(/\.psy-skip-link:focus,\s*\.skip-link:focus \{[^}]*\}/)![0];

  it('al recibir el foco sube a la vista con doble contorno visible sobre el fondo de la píldora', () => {
    expect(regla).toMatch(/top: 16px;/);
    expect(regla).toMatch(/outline: 3px solid #fff;/);
    expect(regla).toMatch(/0 0 0 7px var\(--psy-blue-deep\)/);
    // Blanco sobre el primario del portal: texto de la píldora y anillo.
    expect(contrastRatio('#FFFFFF', token('portal', 'primary'))).toBeGreaterThanOrEqual(7);
  });

  it('los destinos existen en el acceso y en la portada: <main id="main-content" tabindex="-1">', () => {
    for (const html of ['../app/features/login/login.component.html', '../app/features/public/landing.component.html']) {
      expect(source(html)).toMatch(/<main[^>]*id="main-content"[^>]*tabindex="-1"/);
    }
  });

  it('el portal pone el destino en su <main> cuando hay barra', () => {
    expect(source('../app/shared/layout/shell.component.ts')).toMatch(
      /\[attr\.id\]="conBarra\(\) \? 'main-content' : null" \[attr\.tabindex\]="conBarra\(\) \? -1 : null"/,
    );
  });

  it('el encabezado que recibe el foco por programa no dibuja un recuadro (se lee, no se ve)', () => {
    expect(estilos).toMatch(/h1\[tabindex="-1"\]:focus \{\s*outline: none;\s*box-shadow: none;/);
  });
});

// req: RNF-004 (WCAG 1.4.1: el color no es la única señal)
describe('estados con algo más que color', () => {
  it('el error de un campo lleva un símbolo delante y «Error:» para el lector de pantalla', () => {
    const campo = source('../app/shared/ui/field/ui-field.scss');
    const error = campo.match(/\.ui-field__message--error \{[\s\S]*?\n\}/)![0];
    expect(error).toMatch(/&::before \{\s*content: '\\26A0\\FE0E\\00A0';\s*content: '\\26A0\\FE0E\\00A0' \/ 'Error: ';/);
  });
});
