import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// S2-4 (plan 03, ADR-S3, RNF-002): index.html NO lleva código en línea, así que la política de contenido (CSP) puede
// prescindir de 'unsafe-inline' en los scripts. Los estilos que Angular inyecta al arrancar llevan el nonce que el
// servidor (shared/spa.py) escribe en ngCspNonce de <app-root>: el marcador debe ser el MISMO que el del servidor.
const SRC = join(__dirname, '..');
const rawHtml = readFileSync(join(SRC, 'index.html'), 'utf-8');
const angularJson = JSON.parse(readFileSync(join(SRC, '..', 'angular.json'), 'utf-8'));

/** Marcador que el servidor sustituye por el nonce de cada petición (shared/spa.py::NONCE_MARKER). */
const NONCE_MARKER = '__SIEP_CSP_NONCE__';

/** Sin los comentarios: lo que dicen no cuenta como marcado (ni una etiqueta nombrada en un comentario es una etiqueta). */
const withoutComments = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, '');

/** Todo lo que una CSP sin 'unsafe-inline' bloquearía en un HTML: scripts y estilos en línea, manejadores y atributos de estilo. */
function inlineCodeFindings(html: string): string[] {
  const text = withoutComments(html);
  const findings: string[] = [];
  for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=\s*"[^"]+"/i.test(match[1]) || match[2].trim() !== '') findings.push('script en línea');
  }
  if (/<style\b/i.test(text)) findings.push('estilo en línea');
  for (const tag of text.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    if (/(^|\s)on[a-z]+\s*=/i.test(tag[2])) findings.push(`manejador de eventos en <${tag[1]}>`);
    if (/(^|\s)style\s*=/i.test(tag[2])) findings.push(`atributo style en <${tag[1]}>`);
  }
  return findings;
}

describe('index.html: sin código en línea (S2-4)', () => {
  it('no tiene scripts ni estilos en línea, ni manejadores de eventos, ni atributos style (tampoco dentro de <noscript>)', () => {
    expect(inlineCodeFindings(rawHtml)).toEqual([]);
  });

  it('control negativo: el detector sí ve cada forma de código en línea', () => {
    expect(inlineCodeFindings('<script>alert(1)</script>')).toEqual(['script en línea']);
    expect(inlineCodeFindings('<script type="module"></script>')).toEqual(['script en línea']);
    expect(inlineCodeFindings('<head><style>a{}</style></head>')).toEqual(['estilo en línea']);
    expect(inlineCodeFindings('<noscript><style>a{}</style></noscript>')).toEqual(['estilo en línea']);
    expect(inlineCodeFindings('<button onclick="location.reload()">x</button>')).toEqual(['manejador de eventos en <button>']);
    expect(inlineCodeFindings('<p style="color:red">x</p>')).toEqual(['atributo style en <p>']);
    // Lo permitido no cuenta: scripts y hojas externas, y un comentario que nombre las etiquetas.
    expect(inlineCodeFindings('<script src="/assets/boot.js" defer></script><link rel="stylesheet" href="/a.css">')).toEqual([]);
    expect(inlineCodeFindings('<!-- <script>x</script> <style> onclick="x" style="y" -->')).toEqual([]);
  });

  it('enlaza scripts y hojas externos que existen en src/assets', () => {
    const html = withoutComments(rawHtml);
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
    expect(scripts).toContain('/assets/boot.js');
    const referenced = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.(?:js|css))"/g)].map(match => match[1]);
    expect(referenced).toEqual(expect.arrayContaining(['boot.js', 'boot.css', 'boot-noscript.css']));
    for (const name of referenced) expect(existsSync(join(SRC, 'assets', name)), name).toBe(true);
  });

  it('<app-root> lleva ngCspNonce con el marcador que sustituye el servidor', () => {
    const html = withoutComments(rawHtml);
    expect(html).toMatch(new RegExp(`<app-root\\s+ngCspNonce="${NONCE_MARKER}"`));
    // El marcador aparece UNA sola vez en el archivo fuente (el build lo copia a los <script>/<style> que genere).
    expect(rawHtml.split(NONCE_MARKER)).toHaveLength(2);
  });

  it('los archivos externos del arranque tampoco usan nada que la CSP bloquee', () => {
    const script = readFileSync(join(SRC, 'assets', 'boot.js'), 'utf-8');
    expect(script).not.toMatch(/\beval\s*\(|new Function\s*\(|setTimeout\(\s*['"`]/);
    expect(script).not.toMatch(/\.setAttribute\(\s*['"]style['"]/);
    expect(script).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
  });
});

describe('angular.json: el build de producción no deja CSS crítico en línea (S2-4)', () => {
  const production = angularJson.projects['psychosim-admin-panel'].architect.build.configurations.production;

  it('apaga optimization.styles.inlineCritical y deja todo lo demás de la optimización como estaba', () => {
    // Con inlineCritical el build añade un <style> y un <script> en línea (el cambio de media del CSS diferido).
    expect(production.optimization.styles.inlineCritical).toBe(false);
    expect(production.optimization.scripts).toBe(true);
    expect(production.optimization.styles.minify).toBe(true);
    expect(production.optimization.fonts).toBe(true);
  });

  it('la configuración de desarrollo no se toca (sin optimización)', () => {
    const development = angularJson.projects['psychosim-admin-panel'].architect.build.configurations.development;
    expect(development.optimization).toBe(false);
  });
});
