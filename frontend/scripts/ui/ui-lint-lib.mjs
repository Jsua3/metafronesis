// Trinquete de la renovación visual (plan visual §3.2 punto 4 y F0-2): cuenta en `frontend/src` los
// patrones que el lenguaje nuevo prohíbe. Un contador solo puede bajar respecto de ui-lint.baseline.json.
// Sin dependencias: parser de CSS mínimo portado de la auditoría del 2026-10-11 (comentarios `//` de SCSS,
// `@media` anidados, plantillas y estilos en línea de los componentes).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const METRICS = [
  'colorLiterals', 'transitionAll', 'easeIn', 'scale0', 'infiniteAnimation', 'hoverUnguarded', 'important', 'zIndexLiteral',
  'fontSizeLiteral', 'backdropFilter', 'clickableNoActive', 'inlineStyleAttr', 'bodyGameMode', 'unaccentedCopy',
];

/** Un bucle infinito solo es admisible como INDICADOR DE CARGA (esqueleto, spinner, barra de progreso): F9-1. */
const LOADING_ANIMATION = /skeleton|shimmer|spinner|progress|boot/i;

/** Carpetas donde un color literal ES un token (las crea F1). */
const TOKEN_DIRS = ['src/styles/tokens/', 'src/styles/skins/'];
/** Biblioteca de mixins (F1-7): el único sitio autorizado para el vidrio y sus capas; el USO es cada @include. */
const LIBRARY_DIRS = ['src/styles/mixins/'];

const isExcluded = path => /\.spec\.ts$|\.testing\.ts$|\/testing\//.test(path);

// ---------- extracción de bloques ----------------------------------------------------------------

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function readLiteral(text, open) {
  const quote = text[open];
  let i = open + 1;
  for (; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === quote) break;
  }
  return [text.slice(open + 1, i), i];
}

/** Literales de `styles:` o `template:` de un componente, con su desplazamiento. */
function inlineBlocks(text, key) {
  const blocks = [];
  const re = new RegExp(`(^|[\\s{,])${key}:\\s*`, 'gm');
  let m;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length;
    if (text[i] === '[') i++;
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i++;
      const ch = text[i];
      if (ch !== '`' && ch !== "'" && ch !== '"') break;
      const [body, close] = readLiteral(text, i);
      blocks.push({ text: body, start: i + 1, end: close, startLine: lineAt(text, i + 1) });
      i = close + 1;
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text[i] === ',') { i++; continue; }
      break;
    }
  }
  return blocks;
}

/**
 * Agrupa los archivos (ruta relativa a `frontend`, con `/`) en bloques de CSS, plantillas y código.
 * Ámbito = ruta sin extensión: `x.component.html` y `x.component.scss` comparten el de `x.component.ts`.
 */
export function collectBlocks(files) {
  const css = [];
  const templates = [];
  const scripts = [];
  for (const { path, text } of files) {
    if (isExcluded(path)) continue;
    const scope = path.replace(/\.(scss|css|html|ts)$/, '');
    if (/\.(scss|css)$/.test(path)) {
      css.push({ file: path, text, startLine: 1, scope });
    } else if (path.endsWith('.html')) {
      if (path === 'src/index.html') {
        const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
        let m;
        while ((m = re.exec(text))) {
          css.push({ file: path, text: m[1], startLine: lineAt(text, text.indexOf(m[1], m.index)), scope });
        }
      }
      templates.push({ file: path, text, startLine: 1, scope });
    } else if (path.endsWith('.ts')) {
      const styleBlocks = inlineBlocks(text, 'styles');
      const templateBlocks = inlineBlocks(text, 'template');
      for (const b of styleBlocks) css.push({ file: path, text: b.text, startLine: b.startLine, scope });
      for (const b of templateBlocks) templates.push({ file: path, text: b.text, startLine: b.startLine, scope });
      scripts.push({ file: path, text, skip: [...styleBlocks, ...templateBlocks].map(b => [b.start, b.end]) });
    }
  }
  return { css, templates, scripts };
}

// ---------- parser de CSS --------------------------------------------------------------------------

function blankComments(css) {
  let out = '';
  let i = 0;
  let q = null;
  let paren = 0;
  while (i < css.length) {
    const c = css[i];
    const n = css[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === q) q = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") { q = c; out += c; i++; continue; }
    if (c === '(') paren++;
    if (c === ')') paren = Math.max(0, paren - 1);
    if (c === '/' && n === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? css.length : end + 2;
      out += css.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (c === '/' && n === '/' && paren === 0 && css[i - 1] !== ':') {
      const end = css.indexOf('\n', i);
      const stop = end < 0 ? css.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function splitTop(str, separator) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let q = null;
  for (const c of str) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === separator && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** Reglas, declaraciones y at-rules de un bloque, con línea absoluta y los `@media` que las envuelven. */
export function parseCss(block) {
  const text = blankComments(block.text);
  const rules = [];
  const decls = [];
  const stack = [];
  let buf = '';
  let bufStart = 0;
  let paren = 0;
  let q = null;
  const nl = [];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) nl.push(i);
  const lineOf = idx => {
    let lo = 0;
    let hi = nl.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < idx) lo = mid + 1; else hi = mid; }
    return block.startLine + lo;
  };
  const ats = entry => {
    const out = [];
    for (let e = entry; e; e = e.parent) if (e.kind === 'media' || e.kind === 'supports' || e.kind === 'at') out.unshift(e.prelude);
    return out;
  };
  const flushDecl = () => {
    const raw = buf.trim();
    const start = bufStart + (buf.length - buf.trimStart().length);
    buf = '';
    if (!raw) return;
    const top = stack[stack.length - 1];
    const colon = raw.indexOf(':');
    if (colon < 0) return;
    const prop = raw.slice(0, colon).trim();
    const value = raw.slice(colon + 1).trim();
    if (!/^\$?[-\w]+$/.test(prop)) return;
    if (!top && !prop.startsWith('$')) return;
    decls.push({
      prop, value, line: lineOf(start),
      selector: top ? top.prelude : '',
      ats: top ? ats(top) : [],
      ruleKind: top ? top.kind : 'root',
    });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      buf += c;
      if (c === '\\') { buf += text[i + 1] ?? ''; i++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") { if (!buf.trim()) bufStart = i; q = c; buf += c; continue; }
    if (c === '(') paren++;
    if (c === ')') paren = Math.max(0, paren - 1);
    if (paren > 0) { if (!buf.trim()) bufStart = i; buf += c; continue; }
    if (c === '{') {
      const prelude = buf.trim();
      const start = bufStart + (buf.length - buf.trimStart().length);
      const top = stack[stack.length - 1];
      let kind = 'rule';
      if (prelude.startsWith('@')) {
        const word = prelude.split(/[\s(]/)[0].toLowerCase();
        kind = /^@(-\w+-)?keyframes$/.test(word) ? 'keyframes' : word === '@media' ? 'media' : word === '@supports' ? 'supports' : 'at';
      } else if (top && top.kind === 'keyframes') {
        kind = 'step';
      }
      stack.push({ kind, prelude, line: lineOf(start), parent: top ?? null });
      buf = '';
      continue;
    }
    if (c === '}') {
      flushDecl();
      const entry = stack.pop();
      if (entry && entry.kind === 'rule') rules.push({ selector: entry.prelude, line: entry.line, ats: ats(entry.parent) });
      buf = '';
      continue;
    }
    if (c === ';') { flushDecl(); continue; }
    if (!buf.trim()) bufStart = i;
    buf += c;
  }
  return { rules, decls };
}

// ---------- plantillas ----------------------------------------------------------------------------

function scanTags(text) {
  const tags = [];
  const re = /<([a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length;
    let q = null;
    let attrs = '';
    for (; i < text.length; i++) {
      const c = text[i];
      if (q) { attrs += c; if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; attrs += c; continue; }
      if (c === '>') break;
      attrs += c;
    }
    tags.push({ name: m[1].toLowerCase(), attrs, index: m.index, end: i });
    re.lastIndex = i;
  }
  return tags;
}

const MAT_BUTTON = /\b(mat-button|mat-raised-button|mat-flat-button|mat-stroked-button|mat-icon-button|mat-fab|mat-mini-fab|mat-menu-item|matMenuItem|mat-list-item)\b/;
/** Componentes de shared/ui (F2): traen su propio :active (m.ds-press), como Material. */
const UI_CLICKABLE = /(?:^|\s)ui-(?:button|icon-button|link|card)(?=[\s=>/]|$)/;

// ---------- texto visible sin tilde ------------------------------------------------------------------

/** Faltas de tilde frecuentes (forma sin tilde). Se excluyen las palabras que también son correctas sin tilde (publica, practica, critica, valida, mas, aun, esta, solo…). */
const UNACCENTED = new Set(`
accion adecuacion analisis area areas atencion automatico automatica automaticamente basico basica basicos basicas busqueda
camara categoria categorias clinico clinica clinicos clinicas codigo codigos comun conexion conclusion condicion configuracion
contrasena creacion decision descripcion despues diagnostico dialogo dialogos dificil dificiles direccion edicion efimera
efimero electronico electronica especifico especifica estadistica estadisticas estres evaluacion exito facil faciles funcion
guia guias informacion interaccion intervencion introduccion linea lineas maximo maxima minimo minima metodo modulo numero
numeros opcion pagina paginas pestana pestanas posicion proposito psicologico psicologica psicologia publicacion rapido
rapida rapidamente reflexion retroalimentacion revision rubrica rubricas seccion seleccion sesion simulacion situacion
tambien telefono tecnico tecnica tecnicos tecnicas tension titulo titulos transicion ubicacion ultimo ultima ultimos ultimas
unico unica unicamente util utiles validacion version vinculo navegacion senal senales nino ninos nina ninas ano anos
companero companera companeros diseno espanol menu raton aqui todavia dia dias caracteristica caracteristicas pais raiz
autenticacion sincronizacion notificacion notificaciones duracion puntuacion calificacion asignacion participacion
visualizacion animacion orientacion exploracion observacion proteccion victima victimas fisico fisica juridico juridica
etico etica eticos eticas academico academica grafico graficos grafica historico historica pedagogico pedagogica teorico
teorica dinamico dinamica medico medica bitacora actuacion contencion psicologa psicologo articulo articulos
`.trim().split(/\s+/));

function unaccentedWords(text) {
  // Fuera: identificadores snake_case (ligaduras de Material Symbols) y claves kebab-case (ejemplos de claves técnicas).
  const visible = text.replace(/[\w-]*\w_\w[\w-]*/g, ' ').replace(/\b\w+(?:-\w+)+\b/g, ' ');
  return visible.split(/[^\p{L}]+/u).filter(word => word && UNACCENTED.has(word.toLowerCase()));
}

/** Quita `@if (…)`, `@for (…)`… con paréntesis anidados (`brechas()`), conservando las posiciones. */
function blankControlFlow(text) {
  let out = text;
  const re = /@(if|else if|for|switch|case|defer|let)\s*\(/g;
  let m;
  while ((m = re.exec(out))) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < out.length && depth > 0; i++) {
      if (out[i] === '(') depth++;
      else if (out[i] === ')') depth--;
    }
    out = out.slice(0, m.index) + ' '.repeat(i - m.index) + out.slice(i);
  }
  return out;
}

/** Texto visible de una plantilla: nodos de texto y atributos de texto estáticos, sin `{{ }}`, comentarios ni bloques de control. */
function visibleTemplateText(rawText) {
  const text = blankControlFlow(rawText.replace(/<!--[\s\S]*?-->/g, match => match.replace(/[^\n]/g, ' ')));
  const out = [];
  const tags = scanTags(text);
  let cursor = 0;
  const pushText = (from, to) => {
    const chunk = text.slice(from, to)
      .replace(/\{\{[\s\S]*?\}\}/g, ' ')
      .replace(/@(else|empty|placeholder|loading|default)\b/g, ' ');
    if (chunk.trim()) out.push({ text: chunk, index: from });
  };
  for (const tag of tags) {
    if (tag.index > cursor) pushText(cursor, tag.index);
    for (const m of tag.attrs.matchAll(/(?:^|\s)(title|aria-label|placeholder|alt|label)\s*=\s*"([^"]*)"/g)) {
      out.push({ text: m[2], index: tag.index });
    }
    cursor = tag.end + 1;
    // El contenido de <mat-icon> es el nombre de la ligadura («menu», «search»), nunca texto para leer.
    if (tag.name === 'style' || tag.name === 'script' || tag.name === 'mat-icon') {
      const close = text.indexOf(`</${tag.name}`, cursor);
      if (close > 0) cursor = close;
    }
  }
  if (cursor < text.length) pushText(cursor, text.length);
  // Cierres de etiqueta sueltos (`</p>`) quedan como texto: no traen palabras.
  return out;
}

/** Literales de cadena de un `.ts` con al menos un espacio (frases), fuera de estilos/plantillas, comentarios y `console.*`. */
function sentenceLiterals(script) {
  const { text, skip } = script;
  const out = [];
  const inSkip = idx => skip.some(([a, b]) => idx >= a - 1 && idx <= b);
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (c === '/' && n === '/') { const e = text.indexOf('\n', i); i = e < 0 ? text.length : e; continue; }
    if (c === '/' && n === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const [body, close] = readLiteral(text, i);
      if (!inSkip(i)) {
        const lineStart = text.lastIndexOf('\n', i) + 1;
        const before = text.slice(lineStart, i);
        const isLog = /console\.\w+\([^)]*$/.test(before);
        const isImport = /\b(import|from)\s*$/.test(before) || /^\s*import\b/.test(before);
        // Un selector CSS para el DOM («.modulo-inferior .pestana») no es texto para leer.
        const isSelector = /\b(?:querySelector(?:All)?|closest|matches)(?:<[^>]*>)?\(\s*$/.test(before);
        const visible = body.replace(/\$\{[^}]*\}/g, ' ');
        const isPath = /^\s*\//.test(visible);
        if (!isLog && !isImport && !isSelector && !isPath && /\s/.test(visible.trim()) && !/^[\w./-]+$/.test(visible.trim())) {
          out.push({ text: visible, index: i });
        }
      }
      i = close + 1;
      continue;
    }
    i++;
  }
  return out;
}

// ---------- métricas -----------------------------------------------------------------------------

const COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(/g;
const stripUrls = value => value.replace(/url\([^)]*\)/g, 'url()');

export function countMetrics({ css, templates, scripts }) {
  const details = Object.fromEntries(METRICS.map(metric => [metric, []]));
  const add = (metric, file, line, text) => details[metric].push({ at: `${file}:${line}`, text: String(text).replace(/\s+/g, ' ').trim().slice(0, 140) });

  const parsed = css.map(block => ({ block, ...parseCss(block) }));
  const customProps = new Map();
  for (const { decls } of parsed) for (const d of decls) if (d.prop.startsWith('--') && !customProps.has(d.prop)) customProps.set(d.prop, d.value);
  const resolveVars = (value, depth = 0) => depth > 4 ? value
    : value.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_, name) => customProps.has(name) ? resolveVars(customProps.get(name), depth + 1) : `var(${name})`);

  const activeByScope = new Map();
  for (const { block, decls, rules } of parsed) {
    if (LIBRARY_DIRS.some(dir => block.file.startsWith(dir))) continue;
    for (const m of block.text.matchAll(/@include\s+(?:[\w-]+\.)?ds-glass\b/g)) {
      add('backdropFilter', block.file, lineAt(block.text, m.index) + block.startLine - 1, m[0]);
    }
    const inTokens = TOKEN_DIRS.some(dir => block.file.startsWith(dir));
    for (const d of decls) {
      const where = `${d.prop}: ${d.value}`;
      const isDefinition = d.prop.startsWith('--') || d.prop.startsWith('$');
      if (!(isDefinition && inTokens)) {
        for (const _ of stripUrls(d.value).matchAll(COLOR_RE)) add('colorLiterals', block.file, d.line, where);
      }
      if (/^(transition|transition-property)$/.test(d.prop) && /(^|[\s,])all(?=[\s,;]|$)/.test(d.value)) add('transitionAll', block.file, d.line, where);
      if (/^(transition|animation|transition-timing-function|animation-timing-function)$/.test(d.prop)
        && /(?<![\w-])ease-in(?![\w-])/.test(resolveVars(d.value))) add('easeIn', block.file, d.line, where);
      if (/scale(?:3d)?\(\s*0(?:\.0+)?\s*[,)]/.test(d.value) || (d.prop === 'scale' && /^0(\.0+)?(\s|$)/.test(d.value))) add('scale0', block.file, d.line, where);
      if (d.prop === 'animation' && /(^|\s)infinite(?=\s|;|,|$)/.test(d.value) && !LOADING_ANIMATION.test(d.value)) add('infiniteAnimation', block.file, d.line, where);
      if (d.prop === 'animation-iteration-count' && /(^|\s)infinite(?=\s|;|,|$)/.test(d.value)
        && !decls.some(other => other.prop === 'animation-name' && LOADING_ANIMATION.test(other.value))) add('infiniteAnimation', block.file, d.line, where);
      if (/!\s*important/.test(d.value)) add('important', block.file, d.line, where);
      if (d.prop === 'z-index' && !/var\(/.test(d.value) && /^-?\d+/.test(d.value) && Number.parseInt(d.value, 10) !== 0) add('zIndexLiteral', block.file, d.line, where);
      if (d.prop === 'font-size' && !/var\(/.test(d.value) && !/^(inherit|initial|unset|100%|1em)(\s*!important)?$/.test(d.value)) add('fontSizeLiteral', block.file, d.line, where);
      if (/^(-webkit-)?backdrop-filter$/.test(d.prop) && !/^none\b/.test(d.value)) add('backdropFilter', block.file, d.line, where);
    }
    for (const r of rules) {
      if (/:hover\b/.test(r.selector) && !r.ats.some(a => /\(\s*hover\s*:\s*hover\s*\)/.test(a))) add('hoverUnguarded', block.file, r.line, r.selector);
      if (/body\.game-mode/.test(r.selector)) add('bodyGameMode', block.file, r.line, r.selector);
      if (/:active/.test(r.selector)) {
        const info = activeByScope.get(block.scope) ?? { classes: new Set(), tags: new Set(), attrs: new Set() };
        for (const sel of splitTop(r.selector, ',')) {
          let idx = -1;
          while ((idx = sel.indexOf(':active', idx + 1)) >= 0) {
            let start = idx;
            while (start > 0 && !/[\s>+~]/.test(sel[start - 1])) start--;
            const comp = sel.slice(start, idx);
            for (const m of comp.matchAll(/\.([\w-]+)/g)) info.classes.add(m[1]);
            const tag = comp.match(/^([a-z][\w-]*)/i);
            if (tag) info.tags.add(tag[1].toLowerCase());
            for (const m of comp.matchAll(/\[([\w-]+)/g)) info.attrs.add(m[1]);
          }
        }
        activeByScope.set(block.scope, info);
      }
    }
  }

  const empty = { classes: new Set(), tags: new Set(), attrs: new Set() };
  // Globales: styles.scss y todo parcial de src/styles que importa (p. ej. components/_glass-bar, F3-1).
  const globalActive = { classes: new Set(), tags: new Set(), attrs: new Set() };
  for (const [scope, info] of activeByScope) {
    if (!scope.startsWith('src/styles/')) continue;
    for (const key of ['classes', 'tags', 'attrs']) info[key].forEach(value => globalActive[key].add(value));
  }
  for (const block of templates) {
    for (const tag of scanTags(block.text)) {
      const line = block.startLine + (block.text.slice(0, tag.index).match(/\n/g) || []).length;
      if (/(?:^|\s)style\s*=\s*["']/.test(tag.attrs)) add('inlineStyleAttr', block.file, line, `<${tag.name} ${tag.attrs}>`);
      const roleButton = /\brole="button"/.test(tag.attrs);
      if (tag.name !== 'button' && tag.name !== 'a' && !roleButton) continue;
      if (MAT_BUTTON.test(tag.attrs) || UI_CLICKABLE.test(tag.attrs)) continue;
      const classAttr = (tag.attrs.match(/(?:^|\s)class="([^"]*)"/) || [])[1] || '';
      const classes = classAttr.split(/\s+/).filter(name => name && !name.includes('{{'));
      for (const m of tag.attrs.matchAll(/\[class\.([\w-]+)\]/g)) classes.push(m[1]);
      const tagKey = roleButton && tag.name !== 'button' && tag.name !== 'a' ? '' : tag.name;
      const covered = [activeByScope.get(block.scope) ?? empty, globalActive].some(info =>
        classes.some(name => info.classes.has(name)) || (tagKey && info.tags.has(tagKey)) || (roleButton && info.attrs.has('role')));
      if (!covered) add('clickableNoActive', block.file, line, `<${tag.name} class="${classes.join(' ')}">`);
    }
    for (const chunk of visibleTemplateText(block.text)) {
      const words = unaccentedWords(chunk.text);
      if (!words.length) continue;
      const line = block.startLine + (block.text.slice(0, chunk.index).match(/\n/g) || []).length;
      add('unaccentedCopy', block.file, line, `${words.join(', ')} ← ${chunk.text}`);
    }
  }
  for (const script of scripts) {
    for (const literal of sentenceLiterals(script)) {
      const words = unaccentedWords(literal.text);
      if (words.length) add('unaccentedCopy', script.file, lineAt(script.text, literal.index), `${words.join(', ')} ← ${literal.text}`);
    }
  }

  const counts = Object.fromEntries(METRICS.map(metric => [metric, details[metric].length]));
  return { counts, details };
}

// ---------- baseline y árbol ------------------------------------------------------------------------

export function compareToBaseline(counts, baseline) {
  const before = baseline?.counts ?? {};
  const rises = [];
  const drops = [];
  const missing = [];
  for (const metric of Object.keys(counts)) {
    if (!(metric in before)) { missing.push(metric); continue; }
    if (counts[metric] > before[metric]) rises.push({ metric, before: before[metric], now: counts[metric] });
    if (counts[metric] < before[metric]) drops.push({ metric, before: before[metric], now: counts[metric] });
  }
  return { ok: rises.length === 0 && missing.length === 0, rises, drops, missing };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(scss|css|html|ts)$/.test(name)) out.push(full);
  }
  return out;
}

/** Lee `<srcDir>` (la carpeta `src` de `frontend`) y cuenta. Las rutas se informan como `src/...`. */
export function scanSourceTree(srcDir) {
  const base = join(srcDir, '..');
  const files = walk(srcDir).map(full => ({
    path: relative(base, full).split(sep).join('/'),
    text: readFileSync(full, 'utf8'),
  }));
  return countMetrics(collectBlocks(files));
}
