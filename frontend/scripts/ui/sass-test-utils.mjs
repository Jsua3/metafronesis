// Compila Sass del proyecto para probar la SALIDA (plan visual F1): tokens, pieles, foco, movimiento y mixins.
// Las rutas de carga son las de angular.json (src/styles) más node_modules (@angular/material).
import * as sass from 'sass';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCss } from './ui-lint-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const STYLES_DIR = join(here, '..', '..', 'src', 'styles');
const NODE_MODULES = join(here, '..', '..', 'node_modules');

/** Compila un fragmento y devuelve el CSS y sus declaraciones (selector, at-rules que la envuelven, propiedad, valor). */
export function compileScss(source) {
  const { css } = sass.compileString(source, {
    loadPaths: [STYLES_DIR, NODE_MODULES],
    style: 'expanded',
    quietDeps: true,
    silenceDeprecations: ['import'],
  });
  const { decls, rules } = parseCss({ text: css, startLine: 1 });
  return { css, decls, rules };
}

/** Compila un archivo de src/styles (p. ej. 'styles.scss'). */
export function compileStylesFile(relativePath) {
  const { css } = sass.compile(join(STYLES_DIR, relativePath), {
    loadPaths: [STYLES_DIR, NODE_MODULES],
    style: 'expanded',
    quietDeps: true,
    silenceDeprecations: ['import'],
  });
  const { decls, rules } = parseCss({ text: css, startLine: 1 });
  return { css, decls, rules };
}

// Sass quita las comillas de los selectores de atributo: [data-skin='game'] sale como [data-skin=game].
const norm = text => text.replace(/\s+/g, ' ').replace(/(\[[\w-]+=)(['"])([^'"\]]*)\2\]/g, '$1$3]').trim();

/** Valores declarados bajo un selector (uno de los de su lista) y, si se pide, dentro de un @media que contenga `media`. */
/** Parte una lista de selectores por sus comas de primer nivel (no las de `:not(a, b)` ni `:where(…)`). */
function splitSelectors(list) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of list) {
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth--;
    if (char === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += char;
  }
  parts.push(current);
  return parts;
}

export function propsFor(decls, selector, media = null) {
  const out = new Map();
  for (const d of decls) {
    const selectors = splitSelectors(d.selector).map(norm);
    if (!selectors.includes(norm(selector))) continue;
    const inMedia = media === null ? d.ats.length === 0 : d.ats.some(at => norm(at).includes(norm(media)));
    if (!inMedia) continue;
    out.set(d.prop, norm(d.value));
  }
  return out;
}
