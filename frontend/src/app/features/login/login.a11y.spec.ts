import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(join(__dirname, 'login.component.html'), 'utf-8');
const scss = readFileSync(join(__dirname, 'login.component.scss'), 'utf-8');

// F4-2: el doble panel deslizante (dos formularios en el DOM, el oculto inert) dejó paso a UN formulario a la vista;
// el comportamiento (foco al alternar, errores, etiquetas) se prueba en DOM en login.component.spec.ts. Aquí quedan
// los contratos de estructura de la plantilla, actualizados con la misma intención.
describe('login: accesibilidad de los paneles', () => {
  it('nunca hay dos formularios ni contenido oculto con inert: uno a la vista según el modo', () => {
    expect(html).not.toContain('[attr.inert]');
    expect(html).toContain('@if (!showRegister()) {');
    expect((html.match(/<form\b/g) ?? []).length).toBe(2); // uno por rama del @if
  });

  it('solo los formularios tienen h1 (uno por rama, que recibe el foco al alternar); el panel usa h2', () => {
    expect((html.match(/<h1\b/g) ?? []).length).toBe(2);
    expect((html.match(/<h1 #heading id="acceso-titulo" tabindex="-1">/g) ?? []).length).toBe(2);
    // Rediseño Metafrónesis 2026-11-20: los encabezados del panel no marcan género («Te damos la bienvenida»).
    expect(html).toContain('<h2>Te damos la bienvenida</h2>');
    expect(html).toContain('<h2>¿Primera vez en {{ brand.shortName }}?</h2>');
    expect(scss).toContain('.acceso__panel h2 {');
  });
});

describe('login: nombres accesibles y roles', () => {
  // F3-4: el enlace fijo propio dejó paso a la barra pública compartida (app-public-bar, modo «acceso»), cuyo
  // «Volver al inicio» se nombra por su texto visible (WCAG 2.5.3; probado en DOM en public-bar.component.spec.ts).
  it('la cabecera del acceso es la barra pública compartida, fuera del <main> y dentro del contenedor con la piel', () => {
    // Rediseño 2026-11-20: la barra y el <main> viven en el contenedor que lleva la piel del tema (REGLA-010).
    expect(html.indexOf('<div class="acceso publico" [attr.data-skin]="tema.piel()">')).toBeLessThan(html.indexOf('<app-public-bar'));
    expect(html.indexOf('<app-public-bar mode="acceso" />')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('<app-public-bar mode="acceso" />')).toBeLessThan(html.indexOf('<main'));
    expect(html).not.toContain('siep-login__back');
  });

  it('el selector de perfil es un grupo de botones, no un radiogroup sin radios', () => {
    expect(html).toContain('<div class="acceso__roles" role="group" aria-label="Seleccionar rol de acceso">');
    expect(html).not.toContain('radiogroup');
  });

  it('los tres campos del registro tienen etiqueta VISIBLE (ui-field), no solo placeholder (H-29)', () => {
    for (const label of ['Nombre', 'Apellido', 'Correo institucional']) {
      expect(html).toContain(`<ui-field label="${label}" required`);
    }
    expect(html).not.toMatch(/placeholder="(Nombre|Apellido)"/);
  });
});
