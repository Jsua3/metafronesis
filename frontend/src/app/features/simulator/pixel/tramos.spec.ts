import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { CONSULTA_AMPLIO, CONSULTA_COMPACTO, escalaDelRetrato, tramoDe } from './tramos';

const fichas = readFileSync(join(__dirname, '../../../../styles/tokens/_pixel.scss'), 'utf-8');
const hud = readFileSync(join(__dirname, '../simulation-hud.component.ts'), 'utf-8');

describe('tramos de la interfaz (U1, V7)', () => {
  it('cada tamaño de la matriz cae en su tramo (el área ya viene dividida por el zoom)', () => {
    expect(tramoDe(1280, 600)).toBe('compacto');
    expect(tramoDe(1024, 480)).toBe('compacto'); // 1280 × 600 al 125 %
    expect(tramoDe(390, 844)).toBe('compacto'); // teléfono
    expect(tramoDe(1366, 768)).toBe('medio');
    expect(tramoDe(1920, 950)).toBe('medio');
    expect(tramoDe(1920, 1080)).toBe('amplio');
    expect(tramoDe(1700, 1000)).toBe('amplio');
    expect(tramoDe(1536, 960)).toBe('medio'); // 1920 × 1200 al 125 %
  });

  it('el retrato del kit va a escala entera y mide lo mismo que --retrato en cada tramo', () => {
    expect(escalaDelRetrato(390, 844, false) * 32).toBe(64);
    expect(escalaDelRetrato(1024, 480, false) * 32).toBe(96);
    expect(escalaDelRetrato(1280, 600, false) * 32).toBe(128);
    expect(escalaDelRetrato(1366, 768, false) * 32).toBe(192);
    expect(escalaDelRetrato(1920, 1080, false) * 32).toBe(288);
    expect(escalaDelRetrato(1366, 768, true) * 32).toBe(96);
    expect(escalaDelRetrato(1920, 1080, true) * 32).toBe(192);
    expect(fichas).toContain('--dialogo-retrato: 128px;');
    expect(fichas).toContain('--dialogo-retrato: 288px;');
    expect(fichas).toContain('--dialogo-retrato-lado: 192px;');
  });

  it('las fichas y el HUD usan las mismas consultas que el código', () => {
    expect(fichas).toContain(`@media ${CONSULTA_COMPACTO} {`);
    expect(fichas).toContain(`@media ${CONSULTA_AMPLIO} {`);
    expect(hud).toContain(`@media ${CONSULTA_COMPACTO} {`);
  });

  it('en compacto la frase de la persona no se pierde: placa al pasar el cursor o al enfocar, y en el nombre accesible', () => {
    expect(hud).toMatch(/class="hud-persona"[^>]*role="group" \[attr\.aria-label\]="game\.persona\.label"\s*\[attr\.tabindex\]="compacto\(\) \? 0 : null"/);
    const compacto = hud.slice(hud.indexOf(`@media ${CONSULTA_COMPACTO} {`));
    expect(compacto).toMatch(/\.hud-persona-label \{[^}]*position: absolute;[^}]*visibility: hidden;/);
    expect(compacto).toContain('.hud-persona:hover .hud-persona-label, .hud-persona:focus-visible .hud-persona-label { visibility: visible; }');
    // La frase sigue en el DOM (no display: none): el lector la tiene en el nombre del grupo y la placa la muestra.
    expect(compacto.slice(0, compacto.indexOf('}\n    }'))).not.toMatch(/\.hud-persona-label \{ display: none; \}/);
  });
});
