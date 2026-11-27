import { readFileSync } from 'fs';
import { join } from 'path';

describe('base táctil', () => {
  it('conserva la selección de texto y reserva el foco fuera de la navegación', () => {
    const css = readFileSync(join(__dirname, 'base/_tactil.scss'), 'utf8');
    expect(css).toContain('-webkit-text-size-adjust: 100%');
    expect(css).toContain('touch-action: manipulation');
    expect(css).toContain('scroll-padding');
    expect(css).toContain('@media (pointer: coarse)');
    expect(css).toContain('font-size: 16px');
    expect(css).not.toMatch(/\*\s*\{[^}]*user-select:\s*none/s);
  });
});
