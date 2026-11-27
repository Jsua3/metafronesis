import { readFileSync } from 'fs';
import { join } from 'path';

describe('cabecera adaptable', () => {
  it('compacta el título y conserva la descripción completa en el DOM', () => {
    const css = readFileSync(join(__dirname, 'ui-page-header.scss'), 'utf8');
    expect(css).toContain('font-size: 1.5rem');
    expect(css).toContain('-webkit-line-clamp: 2');
    expect(css).toContain('(max-height: 499px)');
  });
});
