import { readFileSync } from 'fs';
import { join } from 'path';

import { blend, contrastRatio } from './contrast.util';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** `oklch(from <hex> l c h)` con l y c fijos: conserva el tono del color de partida (OKLab de Björn Ottosson). */
function oklchDesdeTono(hex: string, l: number, c: number): string {
  const lineal = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map(i => lineal(parseInt(hex.slice(i, i + 2), 16) / 255));
  const [lm, mm, sm] = [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  ].map(Math.cbrt);
  const tono = Math.atan2(0.0259040371 * lm + 0.7827717662 * mm - 0.808675766 * sm, 1.9779984951 * lm - 2.428592205 * mm + 0.4505937099 * sm);
  const [A, B] = [c * Math.cos(tono), c * Math.sin(tono)];
  const [l3, m3, s3] = [l + 0.3963377774 * A + 0.2158037573 * B, l - 0.1055613458 * A - 0.0638541728 * B, l - 0.0894841775 * A - 1.291485548 * B]
    .map(v => v ** 3);
  return '#' + [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ].map(v => Math.min(1, Math.max(0, v)))
    .map(v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))
    .map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('contraste: avisos', () => {
  const toast = source('../app/shared/ui/toast/ui-toast-host.scss');

  // F6-1: el anfitrión de avisos vive en la capa superior, fuera de `.game-container`: hereda los tokens del portal
  // (tarjeta blanca y anillo #004876) también dentro del juego, así que el anillo claro del juego no le aplica.
  it('los avisos van sobre la tarjeta blanca del portal también en el juego: su anillo supera 3:1', () => {
    expect(toast).toMatch(/\.ui-toast \{[^}]*background: var\(--ds-surface-1\);/);
    expect(contrast('#004876', '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(contrast('#C9B3FF', '#FFFFFF')).toBeLessThan(3);
  });

  it('el foco del botón de cerrar sale del anillo global: el anfitrión no declara contornos propios', () => {
    expect(toast).not.toMatch(/outline\s*:/);
  });
});

describe('contraste: portada', () => {
  const data = source('../app/features/public/landing.component.ts');
  const scss = source('../app/features/public/landing.component.scss');
  const html = source('../app/features/public/landing.component.html');
  const accents = ['#6D28D9', '#115E59', '#9A3412', '#1D4ED8'];

  it('no quedan acentos claros que fallan AA (F4-1: ya no hay acentos por tarjeta, solo tokens)', () => {
    for (const color of ['#7c3aed', '#14b8a6', '#f97316', '#3b82f6', ...accents]) {
      expect(data).not.toContain(`'${color}'`);
    }
    expect(data).not.toMatch(/\baccent:/);
  });

  it('los acentos pasan AA como texto y como fondo de texto blanco', () => {
    for (const accent of accents) {
      expect(contrast(accent, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('el titular no usa degradado: su palabra destacada es el violeta sólido de marca en cada modo (rediseño 2026-11-20)', () => {
    // Un texto con background-clip: text desaparece con colores forzados (§2.3 del plan visual). La tinta de acento es
    // --l-acento-tinta: oscuro = primary-hover de la piel juego (#C9B3FF); claro = accent-sim de la piel portal (#5B3FD1).
    expect(scss).not.toContain('background-clip');
    expect(scss).toMatch(/\.landing-accent \{\s*color: var\(--l-acento-tinta\);/);
    // Los tokens viven en los materiales compartidos (styles/components/_materiales.scss, B0) y `.publico` los incluye.
    const publico = source('./components/_publico.scss');
    const materiales = source('./components/_materiales.scss');
    expect(materiales).toMatch(/--l-acento-tinta: var\(--ds-primary-hover\);/);
    expect(materiales).toMatch(/@mixin materiales-claro \{\s*color-scheme: light;\s*--l-acento-tinta: var\(--ds-accent-sim\);/);
    expect(publico).toMatch(/@include m\.materiales;/);
    expect(publico).toMatch(/\.publico\[data-skin='portal'\] \{\s*@include m\.materiales-claro;/);
    expect(contrast('#C9B3FF', '#0E1322')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#C9B3FF', '#151B2E')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#5B3FD1', '#F5F7FA')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#5B3FD1', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('la cabecera es la barra pública (velo de la barra, no un degradado que se desvanece) y «Ingresar» está en ella', () => {
    // F3-4: «Ingresar» vive en app-public-bar. Rediseño 2026-11-20 (pedido del usuario): el módulo de cuenta ENTERO es el
    // enlace violeta (.cta-modulo), sin ficha dentro; su estructura la prueba public-bar.component.spec.ts.
    expect(scss).not.toContain('rgba(12, 18, 34, 0.72) 70%, transparent 100%');
    expect(html).toContain('<app-public-bar [anchors]="anchors" />');
    expect(source('../app/shared/layout/public-bar.component.ts')).toContain('<a class="modulo modulo-cuenta cta-modulo ds-motion" routerLink="/login">');
  });

  it('el módulo «Ingresar» de la barra: su tinta sobre el violeta de marca al 88 % pasa 4,5:1 sobre el peor fondo de cada piel', () => {
    // Tokens en _glass-bar.scss §10: fondo = --l-acento (accent-sim de la piel), tinta = --ds-on-primary de la piel, el
    // violeta con presencia del 88 % (el vidrio se transparenta). El peor fondo: el más claro para la tinta blanca (piel
    // portal) y el más oscuro para la tinta oscura (piel juego). Al posarse el violeta se aleja del fondo: sube el contraste.
    const barra = source('./components/_glass-bar.scss');
    expect(barra).toMatch(/--cta-fondo: var\(--l-acento, var\(--ds-accent-sim\)\);/);
    expect(barra).toMatch(/--cta-tinta: var\(--ds-on-primary\);/);
    expect(barra).toMatch(/--cta-presencia: 88%;/);
    const colores = source('./tokens/_color.scss');
    const [portal, juego] = colores.split('$game:');
    const token = (mapa: string, nombre: string) => mapa.match(new RegExp(`\\n\\s*${nombre}: (#[0-9A-Fa-f]{6}),`))![1];
    const violetaClaro = blend(token(portal, 'accent-sim'), 0.88, '#FFFFFF');
    // Respaldo de la piel juego sin sintaxis de color relativo: la lavanda con su tinta oscura.
    const violetaOscuro = blend(token(juego, 'accent-sim'), 0.88, '#000000');
    expect(contrastRatio(token(portal, 'on-primary'), violetaClaro)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token(juego, 'on-primary'), violetaOscuro)).toBeGreaterThanOrEqual(4.5);
  });

  it('en la piel oscura el módulo «Ingresar» es el mismo morado profundo con tinta blanca, y pasa AA sobre cualquier fondo', () => {
    // Revisión 2026-11-20: la lavanda con texto oscuro se leía como «lila claro». La piel juego toma el tono de su
    // --l-acento y fija la luz y el croma en oklch (0,52 / 0,2). Se recalcula aquí ese color y se mide la tinta blanca
    // al 88 % sobre blanco (el peor fondo para el blanco) y sobre negro.
    const barra = source('./components/_glass-bar.scss');
    expect(barra).toMatch(/@supports \(color: oklch\(from red l c h\)\) \{\s*\.publico\[data-skin='game'\] \.barra-publica \{\s*--cta-fondo: oklch\(from var\(--l-acento, var\(--ds-accent-sim\)\) 0\.52 0\.2 h\);\s*--cta-tinta: white;\s*--cta-oscuro: var\(--ds-surface-page\);/);
    const lavanda = source('./tokens/_color.scss').split('$game:')[1].match(/\n\s*accent-sim: (#[0-9A-Fa-f]{6}),/)![1];
    const morado = oklchDesdeTono(lavanda, 0.52, 0.2);
    expect(contrastRatio('#FFFFFF', morado)).toBeGreaterThanOrEqual(5.5);
    expect(contrastRatio('#FFFFFF', blend(morado, 0.88, '#FFFFFF'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', blend(morado, 0.88, '#000000'))).toBeGreaterThanOrEqual(4.5);
  });

  it('el foco es claro en las zonas oscuras y no hay variables inexistentes', () => {
    // Revisión de F1 (C1): el token que mueve el anillo es --ds-focus (+ halo), no el alias --psy-focus.
    // F3-4: la cabecera oscura dejó paso a la barra de vidrio clara (anillo global). F4-1: el único tramo oscuro es el
    // héroe, en la piel juego, que trae su propio anillo (#C9B3FF): ya no hace falta el parche --ds-focus-on-dark.
    // Rediseño 2026-11-20: la piel (y con ella el anillo) la pone el tema en el contenedor de la página: juego (#C9B3FF)
    // en oscuro, portal (#004876) en claro.
    expect(html).toContain('<div class="landing publico" [attr.data-skin]="tema.piel()">');
    expect(contrast('#004876', '#F5F7FA')).toBeGreaterThanOrEqual(3);
    expect(scss).not.toContain('--ds-focus-on-dark');
    expect(scss).not.toContain('.landing-nav');
    expect(scss).not.toContain('--siep-primary-glow');
    expect(contrast('#C9B3FF', '#0E1322')).toBeGreaterThanOrEqual(3);
    expect(contrast('#C9B3FF', '#151B2E')).toBeGreaterThanOrEqual(3);
  });
});

describe('contraste: login', () => {
  const scss = source('../app/features/login/login.component.scss');
  const html = source('../app/features/login/login.component.html');

  // Rediseño Metafrónesis 2026-11-20: toda la página sigue al tema (claro = piel portal, oscuro = piel juego). Se mide en
  // los DOS modos sobre el peor fondo: la tarjeta (superficie al 94 % + la luz de arriba) encima del resplandor de marca
  // de la página (acento al 20 %, _publico.scss); la pista del control segmentado es texto-1 al 7 % sobre la tarjeta.
  const MODOS = {
    oscuro: { pagina: '#0E1322', superficie: '#151B2E', texto1: '#E8ECF8', texto2: '#A9B3CC', acento: '#B69CFF', tinta: '#C9B3FF', foco: '#C9B3FF', borde: '#6070A0', luz: 0.05 },
    claro: { pagina: '#F5F7FA', superficie: '#FFFFFF', texto1: '#14202E', texto2: '#4A5A6A', acento: '#5B3FD1', tinta: '#5B3FD1', foco: '#004876', borde: '#6F8296', luz: 0.035 },
  };
  type Modo = typeof MODOS.oscuro;
  const tarjeta = (m: Modo) => blend(m.texto1, m.luz, blend(m.superficie, 0.94, blend(m.acento, 0.2, m.pagina)));

  it('el foco se adapta al modo: el tema pone la piel en el contenedor y cada piel trae su anillo (rediseño Metafrónesis 2026-11-20)', () => {
    // Antes (F4-2): tarjeta en la piel portal (#004876) y panel fijo en la piel juego (data-skin="game", #C9B3FF), sin
    // parches de --ds-focus por zona. Ahora la piel es la del tema, en el contenedor de la página (REGLA-010), y el anillo
    // de cada piel llega a 3:1 sobre el peor fondo de su modo.
    expect(scss).not.toContain('--ds-focus');
    expect(html).toContain('<div class="acceso publico" [attr.data-skin]="tema.piel()">');
    expect(html).not.toContain('data-skin="game"');
    for (const m of Object.values(MODOS)) expect(contrast(m.foco, tarjeta(m))).toBeGreaterThanOrEqual(3);
    expect(contrast('#004876', '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(contrast('#C9B3FF', '#0E1322')).toBeGreaterThanOrEqual(3);
  });

  it('el checkbox conserva su contorno de foco (nada lo apaga; lo pinta el anillo global)', () => {
    // Antes el acceso quitaba los contornos y una regla propia los devolvía; F4-2 ya no los quita. Rediseño 2026-11-20:
    // la casilla dice lo que hace («Recordar mi correo»: guarda el correo, no la sesión).
    expect(scss).not.toMatch(/outline:\s*(none|0)\b/);
    expect(html).toContain('<label ui-check><input type="checkbox" formControlName="remember" /> Recordar mi correo</label>');
    expect(source('./base/_focus.scss')).toMatch(/:focus-visible \{\s*@include ds-focus-ring;/);
    expect(source('./mixins/_focus.scss')).toMatch(/@mixin ds-focus-ring[^{]*\{[^}]*outline:/);
  });

  it('en los dos modos: texto secundario y enlaces ≥ 4,5:1, y el perfil elegido y el borde del campo ≥ 3:1 (rediseño Metafrónesis 2026-11-20)', () => {
    for (const m of Object.values(MODOS)) {
      const fondo = tarjeta(m);
      const pista = blend(m.texto1, 0.07, fondo);
      expect(contrast(m.texto2, fondo)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(m.tinta, fondo)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(m.texto2, pista)).toBeGreaterThanOrEqual(4.5);
      // El borde fuerte del campo, contra la tarjeta (fuera) y contra su relleno (dentro): H-28 y WCAG 1.4.11.
      expect(contrast(m.borde, fondo)).toBeGreaterThanOrEqual(3);
      expect(contrast(m.borde, blend(m.texto1, 0.04, m.superficie))).toBeGreaterThanOrEqual(3);
    }
    // El filo del pulgar del control segmentado: texto secundario en oscuro (el borde fuerte daría 2,5:1) y borde fuerte
    // en claro; así el estado elegido no depende solo de la sombra ni del peso de la letra.
    expect(scss).toMatch(/\.acceso \{[^}]*--acceso-pulgar-filo: var\(--ds-text-2\);/);
    expect(scss).toMatch(/\.acceso\[data-skin='portal'\] \{[^}]*--acceso-pulgar-filo: var\(--ds-border-strong\);/);
    expect(scss).toMatch(/\.acceso__roles::before \{\s*background: var\(--acceso-pulgar\);\s*box-shadow:\s*inset 0 0 0 1px var\(--acceso-pulgar-filo\)/);
    expect(contrast(MODOS.oscuro.texto2, blend(MODOS.oscuro.texto1, 0.07, tarjeta(MODOS.oscuro)))).toBeGreaterThanOrEqual(3);
    expect(contrast(MODOS.claro.borde, blend(MODOS.claro.texto1, 0.07, tarjeta(MODOS.claro)))).toBeGreaterThanOrEqual(3);
  });
});

describe('contraste: portal', () => {

  // Pasada final (base): una ventana a la piel game dentro del portal claro (la vista previa de Mi personaje) heredaba
  // los `--l-*` ya resueltos en claro, y el segmentado pintaba su opción elegida en una pastilla blanca con el texto
  // claro de la piel game (#E8ECF8 sobre #FFFFFF). Ahora el portal los vuelve a declarar dentro de la piel game.
  it('dentro de una piel game del portal los materiales resuelven contra la piel oscura', () => {
    const portal = source('./components/_portal.scss');
    const regla = portal.match(/\.portal \[data-skin='game'\] \{([^}]*)\}/)?.[1] ?? '';
    expect(regla).toContain('--l-superficie: var(--ds-surface-1);');
    expect(regla).toContain('--l-filo-fuerte: color-mix(in oklab, var(--ds-text-1) 17%, transparent);');
    expect(regla).toContain('--l-relleno: color-mix(in oklab, var(--ds-text-1) 5%, transparent);');
    // La opción elegida del segmentado: texto de la piel game sobre la superficie de la piel game.
    expect(contrastRatio('#E8ECF8', '#151B2E')).toBeGreaterThanOrEqual(4.5);
    expect(portal).toMatch(/\.portal,\s*\.portal \[data-skin='game'\] \{\s*@include m\.materiales-reducidos;/);
  });
});

describe('contraste: navegación lateral', () => {
  // F3-3: el menú lateral morado desapareció (VD-1). La barra de vidrio es clara: hereda el anillo global y su
  // texto usa los tokens propios de la barra. El velo es el 72 % del fondo de la página sobre lo que pase debajo.
  const shell = source('../app/shared/layout/shell.component.ts');
  const barTokens = source('./tokens/_glass-bar.scss');
  const page = '#F5F7FA';
  const veilOver = (under: string) => blend(page, 0.72, under);
  const underneath = [page, '#FFFFFF', '#004876', '#14202E']; // fondo, tarjeta, primario y el texto más oscuro

  it('la barra no redefine el foco: vale el anillo global azul marino de la piel portal', () => {
    expect(shell).not.toMatch(/--ds-focus\s*:/);
  });

  it('el anillo global (#004876) supera 3:1 sobre el velo de la barra con cualquier contenido debajo', () => {
    underneath.forEach(under => expect(contrastRatio('#004876', veilOver(under)), under).toBeGreaterThanOrEqual(3));
  });

  it('el texto tenue de la barra supera 4,5:1 sobre el velo encima del fondo y de las superficies claras', () => {
    const tenue = barTokens.match(/--asb-cromo-tinta-tenue:\s*(#[0-9A-Fa-f]{6});/)?.[1] ?? '';
    expect(tenue).toBe('#3D4B59');
    [page, '#FFFFFF', '#E6F0F7'].forEach(under => expect(contrastRatio(tenue, veilOver(under)), under).toBeGreaterThanOrEqual(4.5));
  });
});

describe('contraste: acento violeta del portal', () => {
  const color = source('./tokens/_color.scss');
  const acento = /\$portal-acento: \(([^)]*)\)/.exec(color)?.[1] ?? '';
  const token = (name: string): string => new RegExp(`${name}: (#[0-9A-Fa-f]{6})`).exec(acento)?.[1] ?? '';
  const portal = /\$portal: \(([^)]*)\)/.exec(color)?.[1] ?? '';
  const claro = (name: string): string => new RegExp(`\n  ${name}: (#[0-9A-Fa-f]{6})`).exec(portal)?.[1] ?? '';
  const superficies = ['surface-page', 'surface-1', 'surface-2'].map(claro);

  it('define los cinco tokens del acento y no toca los demás', () => {
    for (const name of ['primary', 'primary-hover', 'primary-active', 'primary-subtle', 'focus']) expect(token(name)).not.toBe('');
    expect(acento).not.toContain('on-primary');
    expect(superficies.every(hex => hex !== '')).toBe(true);
  });

  it('el primario y su hover llegan a AA (4,5:1) como texto y enlace sobre las tres superficies claras', () => {
    for (const bg of superficies) {
      expect(contrastRatio(token('primary'), bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(token('primary-hover'), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('el texto de los botones primarios (blanco) llega a AA en reposo, hover y pulsado', () => {
    for (const name of ['primary', 'primary-hover', 'primary-active']) {
      expect(contrastRatio(claro('on-primary'), token(name))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('el anillo de foco supera 3:1 sobre las superficies y sobre su halo (WCAG 1.4.11)', () => {
    for (const bg of [...superficies, claro('focus-halo')]) expect(contrastRatio(token('focus'), bg)).toBeGreaterThanOrEqual(3);
  });

  it('el tinte de selección admite el primario y la tinta como texto', () => {
    expect(contrastRatio(token('primary'), token('primary-subtle'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(claro('text-1'), token('primary-subtle'))).toBeGreaterThanOrEqual(4.5);
  });

  // REGLA-010: en :root solo la piel del portal con su azul petróleo; el violeta vive en el contenedor.
  it('se emite en .portal y .publico claros, fuera de colores forzados, y no en :root', () => {
    const skin = source('./skins/_portal.scss');
    expect(skin).toMatch(/@media not \(forced-colors: active\) \{\s*\.portal\[data-skin='portal'\],\s*\.publico\[data-skin='portal'\] \{\s*@include color\.emit\(color\.\$portal-acento\);/);
    expect(skin).toMatch(/:root,\s*\[data-skin='portal'\] \{[^}]*color\.\$portal\)/);
    expect(claro('primary')).toBe('#004876');
  });
});

// E0 (EDITOR.md §4.7, 2026-11-21): el editor de casos sigue el tema. Su piel (`skins/_autoria.scss`) son alias de los
// tokens del portal, así que sus pares se miden con los valores de las DOS pieles: la clara (`$portal` con el acento
// violeta) y la oscura (`$game`). Si alguno no llegara, el editor volvería al claro fijo (una línea en shell.component.ts).
describe('contraste: editor de casos en las dos pieles', () => {
  const color = source('./tokens/_color.scss');
  const piel = source('./skins/_autoria.scss');
  const mapa = (nombre: string) => new RegExp(`\\$${nombre}: \\(([^)]*)\\)`).exec(color)?.[1] ?? '';
  const valor = (bloque: string, nombre: string) => new RegExp(`\\n  ${nombre}: (#[0-9A-Fa-f]{6})`).exec(bloque)?.[1] ?? '';
  const acento = mapa('portal-acento');
  const claro = (n: string) => valor(`\n${acento}`, n) || valor(mapa('portal'), n);
  const oscuro = (n: string) => valor(mapa('game'), n);
  const PIELES = { claro, oscuro };

  it('cada variable del editor es un alias de un token (no un color escrito a mano), salvo la ciruela de «Con riesgo»', () => {
    for (const [variable, token] of [
      ['--tinta', 'var(--ds-text-1)'], ['--texto-secundario', 'var(--ds-text-2)'], ['--primario', 'var(--ds-primary)'],
      ['--sobre-primario', 'var(--ds-on-primary)'], ['--borde-control', 'var(--ds-border-strong)'], ['--superficie', 'var(--l-superficie)'],
      ['--peligro', 'var(--ds-danger)'], ['--adecuada', 'var(--ds-success)'], ['--aviso-texto', 'var(--ds-warning-text)'],
      ['--guia', 'var(--ds-info)'], ['--foco', 'var(--ds-focus)'],
    ]) expect(piel).toContain(`${variable}: ${token};`);
    expect(piel).not.toContain('data-skin="portal"');
  });

  it('texto y enlaces llegan a 4,5:1 sobre la superficie, la superficie hundida y la página, en las dos pieles', () => {
    for (const t of Object.values(PIELES)) {
      for (const fondo of ['surface-1', 'surface-2', 'surface-page'].map(t)) {
        for (const tinta of ['text-1', 'text-2', 'primary'].map(t)) expect(contrastRatio(tinta, fondo)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('botones primarios, tintes de selección y avisos llegan a 4,5:1; bordes de control y anillo de la guía, a 3:1', () => {
    for (const t of Object.values(PIELES)) {
      expect(contrastRatio(t('on-primary'), t('primary'))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t('on-primary'), t('primary-hover'))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t('primary'), t('primary-subtle'))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t('warning-text'), t('warning-bg'))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t('danger'), t('danger-bg'))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t('success'), t('success-bg'))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t('info'), t('info-bg'))).toBeGreaterThanOrEqual(4.5);
      // La insignia de «Pendientes»: la superficie sobre el ámbar del aviso.
      expect(contrastRatio(t('surface-1'), t('warning-text'))).toBeGreaterThanOrEqual(4.5);
      // La palabra «Guía» sobre su anillo: --sobre-primario sobre --guia.
      expect(contrastRatio(t('on-primary'), t('info'))).toBeGreaterThanOrEqual(4.5);
      for (const fondo of ['surface-1', 'surface-page'].map(t)) {
        expect(contrastRatio(t('border-strong'), fondo)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(t('info'), fondo)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(t('focus'), fondo)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('«Con riesgo» conserva su ciruela con un valor por piel: texto ≥ 4,5:1 sobre su tinte y la superficie; borde ≥ 3:1', () => {
    const ciruela = (bloque: string) => ['--riesgo', '--riesgo-tinte', '--riesgo-borde']
      .map(v => new RegExp(`${v}: (#[0-9a-fA-F]{6});`).exec(bloque)?.[1] ?? '');
    const [base, oscura] = piel.split("[data-skin='game'] app-autoria-shell");
    for (const [[texto, tinte, borde], superficie] of [[ciruela(base), claro('surface-1')], [ciruela(oscura), oscuro('surface-1')]] as const) {
      expect(contrastRatio(texto, tinte)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(texto, superficie)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(borde, superficie)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(borde, tinte)).toBeGreaterThanOrEqual(3);
    }
  });
});
