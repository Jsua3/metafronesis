import { readFileSync } from 'fs';
import { join } from 'path';

const screen = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');
const panel = readFileSync(join(__dirname, 'rehearsal-panel.component.ts'), 'utf-8');

/**
 * El panel de autora va en la fila 1 de la zona principal. Sin una columna propia, el autocolocado de la rejilla lo pone en
 * la primera columna y manda el mundo a una segunda fila sin alto: el lienzo queda en blanco (lo destapó el e2e @ensayo).
 */
describe('simulation-play: rejilla del ensayo', () => {
  it('con el ensayo la zona principal reserva una columna para el panel, también con la conversación a la derecha', () => {
    expect(screen).toMatch(/\.game-container\[data-rehearsal\] \.main-zone \{\s*grid-template-columns: minmax\(0, 1fr\) clamp\(/);
    expect(screen).toMatch(/\.game-container\[data-rehearsal\]\[data-mode='dialogue-right'\] \.main-zone \{\s*grid-template-columns: minmax\(0, 1fr\) clamp\([^;]*\) clamp\(/);
  });

  it('con el ensayo, el HUD, el plano y el pie dejan libre la columna del panel (en teléfono el panel se superpone)', () => {
    expect(screen).toMatch(/\.game-container\[data-rehearsal\] \.top-bar,\s*\.game-container\[data-rehearsal\] \.bottom-zone \{ margin-right: calc\(clamp\(280px, 24vw, 340px\) \+ 10px\); \}/);
    expect(screen).toMatch(/@media \(max-width: 760px\) \{[^}]*\}\s*\.game-container\[data-rehearsal\] \.top-bar,\s*\.game-container\[data-rehearsal\] \.bottom-zone \{ margin-right: 0; \}/);
  });

  it('los títulos del panel heredan el color del panel (el h3 global es azul oscuro: 1,57:1 sobre el fondo del panel, Axe color-contrast)', () => {
    expect(panel).toMatch(/h2 \{[^}]*color: inherit;/);
    expect(panel).toMatch(/h3 \{[^}]*color: inherit;/);
  });

  it('el panel ocupa la última columna de la fila 1; en pantallas estrechas se superpone al mundo en vez de abrir otra fila', () => {
    expect(panel).toMatch(/:host \{[^}]*grid-row: 1;[^}]*grid-column: -2 \/ -1;/);
    expect(screen).toMatch(/@media \(max-width: 760px\) \{\s*\.game-container\[data-rehearsal\] \.main-zone,\s*\.game-container\[data-rehearsal\]\[data-mode='dialogue-right'\] \.main-zone \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(panel).toMatch(/@media \(max-width: 760px\) \{\s*:host \{ grid-column: 1; z-index: 60; \}/);
  });
});
