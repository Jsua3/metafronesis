import { readFileSync } from 'fs';
import { join } from 'path';

import { blend, contrastRatio } from './contrast.util';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

describe('bloque H: portada', () => {
  const scss = source('../app/features/public/landing.component.scss');

  it('el botón primario no baja de 4,5:1 en ninguna de las dos pieles (ya no hay degradado propio)', () => {
    // Antes: un degradado propio (#8b5cf6 → #7c3aed; el inicio daba 4,23:1). F4-1: los llamados a la acción son
    // ui-button, con el primario y su texto de cada piel: juego (héroe) y portal (cierre).
    expect(scss).not.toContain('#8b5cf6');
    expect(scss).not.toContain('landing-btn');
    expect(scss).not.toContain('linear-gradient');
    expect(contrastRatio('#0E1322', '#B69CFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', '#004876')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('bloque H: login (contraste)', () => {
  const scss = source('../app/features/login/login.component.scss');
  // --siep-muted es alias de --ds-text-2 (F1-1); el valor sale del mapa de la piel portal.
  const alias = source('./_aliases.scss').match(/--siep-muted:\s*var\(--ds-([a-z0-9-]+)\);/)?.[1] ?? '';
  const muted = source('./tokens/_color.scss').match(new RegExp(`\\n\\s*${alias}:\\s*(#[0-9A-Fa-f]{6}),`))?.[1] ?? '';

  it('el divisor y el estado de Google usan el texto secundario del lenguaje (≥ 4,5:1 sobre blanco)', () => {
    // Antes: rgba(120,120,140,.85) = 3,31:1 y rgba(120,120,140,.95) = 3,92:1. F4-2: tokens --ds-* directos
    // (--siep-muted era alias de --ds-text-2).
    expect(alias).toBe('text-2');
    expect(muted).toBe('#4A5A6A');
    expect(scss).toMatch(/\.acceso__divider \{[^}]*color: var\(--ds-text-2\);/);
    expect(scss).toMatch(/\.acceso__google-status \{[^}]*color: var\(--ds-text-2\);/);
    expect(contrastRatio(muted, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('el placeholder tiene color propio y llega a 4,5:1, y el borde del campo a 3:1 (H-28)', () => {
    // Sin regla, Chrome pinta #757575: 4,19:1 sobre #f3f4f6. F4-2: los campos son ui-field + uiControl, que fija el
    // placeholder en --ds-text-2 sobre --ds-surface-1 y el borde en --ds-border-strong.
    const field = source('../app/shared/ui/field/ui-field.scss');
    const html = source('../app/features/login/login.component.html');
    expect(field).toMatch(/&::placeholder \{\s*color: var\(--ds-text-2\);\s*opacity: 1;/);
    expect(field).toContain('border: 1px solid var(--ds-border-strong);');
    expect((html.match(/<input uiControl /g) ?? []).length).toBe(6); // 2 del acceso, 3 de la solicitud y 1 del olvido de contraseña
    expect(contrastRatio(muted, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#6F8296', '#FFFFFF')).toBeGreaterThanOrEqual(3);
  });

  it('el texto pequeño del panel del simulador llega a 4,5:1 en los dos modos (rediseño Metafrónesis 2026-11-20)', () => {
    // Antes: rgba(255,255,255,.82) = 3,85:1 sobre #5c6bc0 (panel índigo, retirado); F4-2 lo fijó en la piel juego
    // (data-skin="game"). Rediseño 2026-11-20: el panel sigue el tema de la página, así que se mide en claro y en
    // oscuro sobre su vidrio (--l-vidrio-alto: superficie-2 al 78 % en oscuro, superficie-1 al 90 % en claro) encima
    // del resplandor de marca (acento al 20 %), con la luz de arriba (texto-1 al 7 %) y sobre las baldosas de los pilares.
    const html = source('../app/features/login/login.component.html');
    expect(html).toMatch(/<aside class="acceso__panel" aria-label="Sobre el simulador">/);
    expect(scss).toMatch(/\.acceso__panel p \{[^}]*color: var\(--ds-text-2\);/);
    expect(scss).toMatch(/\.acceso__pillars span \{[^}]*color: var\(--ds-text-2\);/);
    const panel = (vidrio: string, alfa: number, texto1: string, acento: string, pagina: string) =>
      blend(texto1, 0.07, blend(vidrio, alfa, blend(acento, 0.2, pagina)));
    const oscuro = panel('#1D2540', 0.78, '#E8ECF8', '#B69CFF', '#0E1322');
    const claro = panel('#FFFFFF', 0.9, '#14202E', '#5B3FD1', '#F5F7FA');
    expect(contrastRatio('#A9B3CC', oscuro)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#A9B3CC', blend('#E8ECF8', 0.05, oscuro))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#C9B3FF', blend('#E8ECF8', 0.05, oscuro))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(muted, claro)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(muted, blend('#14202E', 0.035, claro))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#5B3FD1', blend('#14202E', 0.035, claro))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#A9B3CC', '#0E1322')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('bloque H: 404 pública (rediseño Metafrónesis 2026-11-20)', () => {
  const ts = source('../app/features/public/not-found.component.ts');
  const estado = source('../app/shared/layout/pagina-estado/pagina-estado.component.ts');

  it('sigue al tema en su contenedor y su texto secundario y su acción llegan a 4,5:1 en los dos modos', () => {
    // B3 pasó la 404 a la plantilla común de estados (`app-pagina-estado`): ya no hay tarjeta de vidrio ni enlace
    // subrayado; el texto va directo sobre la página (con el resplandor de marca, acento al 20 %) y la salida es un
    // `ui-button`, que tiene su propio contrato de contraste.
    expect(ts).toContain('<div class="perdida publico" [attr.data-skin]="tema.piel()">');
    expect(ts).toContain('<app-pagina-estado tipo="no-encontrada"');
    expect(ts).toMatch(/<a ui-button routerLink="\/">Volver a la portada<\/a>/);
    expect(estado).toMatch(/p \{[^}]*color: var\(--ds-text-2\);/);
    const pagina = (acento: string, fondo: string) => blend(acento, 0.2, fondo);
    const oscuro = pagina('#B69CFF', '#0E1322');
    const claro = pagina('#5B3FD1', '#F5F7FA');
    expect(contrastRatio('#A9B3CC', oscuro)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#E8ECF8', oscuro)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#C9B3FF', oscuro)).toBeGreaterThanOrEqual(3); // anillo de foco de la piel juego
    expect(contrastRatio('#4A5A6A', claro)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#14202E', claro)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#004876', claro)).toBeGreaterThanOrEqual(3); // anillo de foco de la piel portal
  });
});

describe('bloque H: foco visible en Grupos', () => {
  const grupos = source('../app/features/grupos/grupo-list.component.ts');
  const groupsHtml = source('../app/features/grupos/grupo-list.component.html');
  const groupsScss = source('../app/features/grupos/grupo-list.component.scss');

  it('el buscador de Grupos es un campo de la biblioteca: el anillo es el global y la pantalla no apaga contornos', () => {
    // Antes el input conservaba `outline: 0` y un `.search-box:focus-within` dibujaba el anillo en su contenedor.
    // Desde F7-2 el buscador es un `ui-field` con `uiControl`: el foco lo pinta el anillo global.
    expect(grupos).not.toContain('.search-box');
    expect(groupsHtml).toContain('<input uiControl type="search"');
    expect(groupsScss).not.toMatch(/outline\s*:/);
    expect(source('./base/_focus.scss')).toMatch(/:focus-visible \{\s*@include ds-focus-ring;/);
    // --ds-focus = #004876 sobre las superficies del portal
    for (const surface of ['#F2F2F2', '#FFFFFF']) {
      expect(contrastRatio('#004876', surface)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('bloque H: el módulo «Ingresar» de la barra pública', () => {
  const barra = source('./components/_glass-bar.scss');
  const bloque = (selector: string) => {
    const desde = barra.indexOf(`${selector} {`);
    return desde < 0 ? '' : barra.slice(desde, barra.indexOf('\n}', desde));
  };

  it('mide 44 px de alto como mínimo y su área de reacción extra no lo tapa al lector ni al teclado', () => {
    expect(bloque('.cromo.barra-publica .cta-modulo')).toContain('min-height: var(--ds-target-min);');
    expect(bloque('.cromo.barra-publica .cta-modulo > .cta-modulo__alcance')).toContain('display: none;');
  });

  it('se amplía con :focus-visible igual que con el cursor, y el cursor solo cuenta con un puntero fino', () => {
    expect(barra).toMatch(/\.modulo\.cta-modulo:focus-visible \{\s*@include cta-amplio;/);
    expect(barra).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{[^@]*\.modulo\.cta-modulo:hover \{\s*@include cta-amplio;/);
  });

  it('con movimiento reducido no escala ni empuja la flecha, y no toca las duraciones', () => {
    const reducido = barra.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\.barra-publica \{([^}]*)\}/)?.[1] ?? '';
    expect(reducido).toContain('--cta-escala: 1;');
    expect(reducido).toContain('--cta-escala-pulsada: 1;');
    expect(reducido).toContain('--cta-empuje-flecha: 0rem;');
    expect(reducido).not.toContain('duracion');
  });

  it('con colores forzados el rótulo se ve: LinkText sobre Canvas en todos sus estados, con borde LinkText', () => {
    // Revisión 2026-11-20: el sistema repintaba el rótulo y su capa con el mismo color (texto invisible en Alto
    // contraste). El módulo toma las riendas y sus tokens de capa valen Canvas también al posarse, con foco y al pulsar.
    const forzado = barra.match(/@media \(forced-colors: active\) \{\s*\.cromo\.barra-publica \.modulo\.cta-modulo \{([^}]*)\}/)?.[1] ?? '';
    expect(forzado).toContain('forced-color-adjust: none;');
    expect(forzado).toContain('color: LinkText;');
    for (const capa of ['--cta-velo: Canvas;', '--cta-velo-fuerte: Canvas;', '--cta-fondo-fuerte: Canvas;', '--cta-canto: LinkText;']) {
      expect(forzado).toContain(capa);
    }
  });

  it('en la píldora es el remate morado de su extremo derecho (no una cápsula suelta), sin asomar por fuera', () => {
    const inicial = barra.match(/\.cromo\.barra-publica\[data-estado='inicial'\] \.cta-modulo \{([^}]*)\}/)?.[1] ?? '';
    expect(inicial).toContain('margin-block: -0.5rem;');
    expect(inicial).toContain('margin-inline-end: -0.75rem;');
    expect(inicial).toContain('--cta-escala: 1;');
    expect(bloque('  .cromo.barra-publica .cta-modulo')).toContain('align-self: stretch;');
  });
});
