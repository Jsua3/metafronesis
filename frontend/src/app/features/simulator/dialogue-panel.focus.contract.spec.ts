import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Foco inicial del panel de diálogo. La cabecera fija trajo «Volver al mapa» como primer elemento
 * tabulable y la captura automática de cdkTrapFocus enfocaba ese botón: el primer Enter no avanzaba
 * el texto. El foco inicial debe ser el botón que hace avanzar (o el grupo de opciones), nunca la cabecera.
 * ts-jest no resuelve la captura de CDK en jsdom, así que el contrato se fija sobre la plantilla.
 */
const source = readFileSync(join(__dirname, 'dialogue-panel.component.ts'), 'utf-8');

describe('dialogue-panel: foco inicial', () => {
  it('marca como foco inicial cada botón de avance y el grupo de opciones', () => {
    const marked = source.match(/class="close-btn" ui-button variant="primary" cdkFocusInitial/g) ?? [];
    expect(marked).toHaveLength(3);
    expect(source).toMatch(/class="choices"[^>]*cdkFocusInitial/);
  });

  it('no marca la cabecera como foco inicial', () => {
    const head = source.slice(source.indexOf('<header class="panel-head">'), source.indexOf('</header>'));
    expect(head).not.toContain('cdkFocusInitial');
  });
});
