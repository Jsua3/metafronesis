import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { APP_BRAND } from './brand.config';
import { SIEP_DEFAULT_TITLE } from '../title/siep-title.strategy';

const src = join(__dirname, '../../..');
const read = (path: string) => readFileSync(join(src, path), 'utf8');

describe('P3: una sola marca en la interfaz', () => {
  it('la marca compartida y el título inicial y dinámico dicen Metafrónesis', () => {
    expect(APP_BRAND.shortName).toBe('Metafrónesis');
    expect(APP_BRAND.formalName).toContain('Metafrónesis');
    expect(APP_BRAND.description).toContain('Metafrónesis');
    expect(SIEP_DEFAULT_TITLE).toBe('Metafrónesis | Sistema de Entrenamiento Psicosocial');
    expect(read('index.html')).toContain(`<title>${SIEP_DEFAULT_TITLE}</title>`);
    expect(read('assets/favicon-siep.svg')).toContain('aria-label="Metafrónesis"');
  });

  // Se inspeccionan plantillas completas, incluidas las inline: los códigos de reglas, comentarios y API no son textos UI.
  function templates(dir: string): { file: string; template: string }[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) return templates(file);
      if (!/\.(html|ts)$/.test(file) || /\.spec\.ts$/.test(file)) return [];
      const source = readFileSync(file, 'utf8').replace(/<!--[^]*?-->/g, '');
      const parts = file.endsWith('.html') ? [source] : [...source.matchAll(/template:\s*`([^]*?)`/g)].map(match => match[1]);
      return parts.map(template => ({ file, template }));
    });
  }

  it('ninguna plantilla del frontend deja la marca anterior visible o en una etiqueta accesible', () => {
    const obsolete = templates(join(src, 'app')).filter(({ template }) => /\bSIEP\b/.test(template));
    expect(obsolete.map(({ file }) => file)).toEqual([]);
  });

  it.each([
    'app/shared/ui/scope-notice/ui-scope-notice.ts',
    'app/features/account/reset-password.component.ts',
  ])('los mensajes de %s usan la marca compartida', file => {
    const source = read(file).replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(source).toContain('APP_BRAND.shortName');
    expect(source).not.toMatch(/\bSIEP\b/);
  });
});
