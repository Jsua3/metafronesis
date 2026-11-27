import { readFileSync } from 'fs';
import { join } from 'path';

describe('select nativo global', () => {
  const styles = () => readFileSync(join(__dirname, 'components/_select.scss'), 'utf8');

  it('mantiene respaldo nativo y mejora control y lista solo cuando el navegador lo admite', () => {
    const css = styles();
    expect(css).toContain('appearance: none');
    expect(css).toContain('@supports (appearance: base-select)');
    expect(css).toContain('::picker(select)');
    expect(css).toContain('::picker-icon');
    expect(css).toContain('::checkmark');
    expect(css).toMatch(/option:checked/);
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('appearance: auto');
  });
});
