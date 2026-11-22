import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(join(__dirname, 'landing.component.html'), 'utf-8');

describe('portada: navegación pública y semántica de la maqueta', () => {
  // F3-4: el menú móvil propio de la portada (botón «Menú de navegación» + lista desplegable) lo sustituye la
  // barra de vidrio compartida (app-public-bar); su accesibilidad se prueba en DOM en public-bar.component.spec.ts.
  it('la cabecera es la barra pública compartida, con las anclas de esta página', () => {
    expect(html).toContain('<app-public-bar [anchors]="anchors" />');
    expect(html).not.toContain('landing-nav');
  });

  // F4-1: la maqueta ya no finge controles (antes, botones deshabilitados ocultos al lector): las decisiones son una
  // lista de ejemplo nombrada por su rótulo visible. El comportamiento en DOM, en landing.component.spec.ts.
  it('la maqueta de decisiones no tiene controles falsos: es una lista de ejemplo con nombre', () => {
    expect(html).not.toMatch(/\bdisabled\b/);
    expect(html).toContain('<p class="landing-preview__decisions-label" id="preview-decisions">Ejemplo de decisiones</p>');
    expect(html).toContain('<ul class="landing-preview__decisions" aria-labelledby="preview-decisions">');
  });
});
