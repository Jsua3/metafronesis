#!/usr/bin/env node
// Nombres de Material Symbols que la app necesita (plan visual F1-3). Fuentes:
//  1. contenido de <mat-icon>…</mat-icon> (nombre suelto o literales dentro de {{ }});
//  2. propiedades y asignaciones cuyo nombre contiene «icon» (icon: 'x', primaryIcon = 'x');
//  3. resultados de las funciones que se llaman dentro de un <mat-icon> ({{ iconForClass(…) }});
//  4. semillas y datos del backend ("icon": "x" en Python; "icono": "x" en los documentos del caso);
//  5. scripts/ui/icons-extra.json: iconos curados para lo que escriben los autores en «Icono Material».
// Uso: node scripts/ui/icon-names.mjs > nombres.json   (lo consume scripts/ui/subset-icons.py)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICON = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
// Literal en posición de RESULTADO (`return 'a'`, `? 'a' : 'b'`, `clave: 'a'`), no de comparación (`x === 'a'`).
const QUOTED = /(?:\breturn|[?:])\s*['"`]([a-z0-9]+(?:_[a-z0-9]+)*)['"`]/g;

function addQuoted(text, out) {
  for (const [, name] of text.matchAll(QUOTED)) out.add(name);
}

/** Cuerpo entre llaves que empieza en `open` (índice de «{»), con llaves anidadas. */
function bodyFrom(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

export function iconNamesIn(files) {
  const out = new Set();
  const sources = files.filter(({ path }) => !/\.spec\.ts$/.test(path));
  // Funciones llamadas dentro de un <mat-icon> (p. ej. {{ iconForClass(…) }}): sus resultados son iconos.
  const iconFunctions = new Set();
  for (const { path, text } of sources) {
    if (path.endsWith('.py') || path.endsWith('.json')) {
      // «icon» en las semillas de Python y «icono» en los documentos del caso (apps/simulation/data/cases, E4-6).
      for (const [, name] of text.matchAll(/["']icono?["']\s*:\s*["']([a-z0-9_]+)["']/g)) out.add(name);
      continue;
    }
    for (const [, content] of text.matchAll(/<mat-icon\b[^>]*>([\s\S]*?)<\/mat-icon>/g)) {
      const bare = content.trim();
      if (ICON.test(bare)) out.add(bare);
      for (const [, expr] of content.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
        addQuoted(expr, out);
        for (const [, fn] of expr.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) iconFunctions.add(fn);
      }
    }
    // Atributos de los componentes de shared/ui (F2-1): icon="save", iconEnd="arrow_forward", [icon]="'x'" o un
    // ternario de literales en la vinculación.
    for (const [, name] of text.matchAll(/\s(?:icon|iconEnd)="([a-z0-9]+(?:_[a-z0-9]+)*)"/g)) out.add(name);
    for (const [, expr] of text.matchAll(/\s\[(?:icon|iconEnd)\]="([^"]*)"/g)) {
      const literal = /^\s*'([a-z0-9]+(?:_[a-z0-9]+)*)'\s*$/.exec(expr);
      if (literal) out.add(literal[1]);
      addQuoted(expr, out);
    }
    if (path.endsWith('.ts')) {
      // Sin alias de tipo (`type PatientIconKind = 'crisis' | …`): son claves, no nombres de icono.
      for (const [, name] of text.matchAll(/(?<!\btype\s+)\b\w*[iI]con\w*\s*[:=]\s*['"]([a-z0-9]+(?:_[a-z0-9]+)*)['"]/g)) out.add(name);
    }
  }
  // Definiciones de funciones y métodos: nombre, parámetros y cuerpo.
  const definitions = [];
  for (const { path, text } of sources) {
    if (!path.endsWith('.ts')) continue;
    const header = /\b([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?::\s*[\w<>[\]|' ]+)?\s*\{/g;
    let m;
    while ((m = header.exec(text))) {
      definitions.push({ name: m[1], params: m[2], body: bodyFrom(text, m.index + m[0].length - 1) });
    }
  }
  // Resultados de las funciones usadas en <mat-icon>, siguiendo las llamadas que hacen a otras (timelineIcon → iconFor).
  const pending = [...iconFunctions];
  while (pending.length) {
    const name = pending.pop();
    for (const def of definitions.filter(d => d.name === name)) {
      addQuoted(def.body, out);
      for (const [, called] of def.body.matchAll(/\breturn\b[^;]*?\b([A-Za-z_]\w*)\s*\(/g)) {
        if (!iconFunctions.has(called)) {
          iconFunctions.add(called);
          pending.push(called);
        }
      }
    }
  }
  // Argumentos literales en la posición de un parámetro llamado *icon* (this.metric('people', …)).
  for (const def of definitions) {
    const position = def.params.split(',').findIndex(param => /^\s*\w*[iI]con\w*\s*[?:=]/.test(param));
    if (position < 0) continue;
    for (const { path, text } of sources) {
      if (!path.endsWith('.ts')) continue;
      for (const call of text.matchAll(new RegExp(`\\b${def.name}\\s*\\(`, 'g'))) {
        const args = argumentsFrom(text, call.index + call[0].length);
        const literal = /^\s*['"]([a-z0-9]+(?:_[a-z0-9]+)*)['"]\s*$/.exec(args[position] ?? '');
        if (literal) out.add(literal[1]);
      }
    }
  }
  return out;
}

/** Argumentos de primer nivel de una llamada cuyo paréntesis de apertura termina en `start`. */
function argumentsFrom(text, start) {
  const args = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      current += char;
      if (char === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; current += char; continue; }
    if (char === '(' || char === '[' || char === '{') depth++;
    if (char === ')' || char === ']' || char === '}') {
      if (depth === 0) { args.push(current); return args; }
      depth--;
    }
    if (char === ',' && depth === 0) { args.push(current); current = ''; continue; }
    current += char;
  }
  return args;
}

function walk(dir, accept, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.venv' || name === 'migrations' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, accept, out);
    else if (accept(name)) out.push(full);
  }
  return out;
}

const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(here, '..', '..');
const REPO = join(FRONTEND, '..');

/** Todos los nombres requeridos por el proyecto (código, semillas del backend y lista curada). */
export function projectIconNames() {
  const read = full => ({ path: relative(REPO, full).split(sep).join('/'), text: readFileSync(full, 'utf8') });
  const files = [
    ...walk(join(FRONTEND, 'src'), name => /\.(ts|html)$/.test(name)).map(read),
    // Las pruebas del backend no son semillas: E2-6 valida los iconos mandando nombres falsos a propósito.
    ...walk(join(REPO, 'backend_django', 'apps'), name => /\.(py|json)$/.test(name))
      .filter(full => !full.split(sep).includes('tests'))
      .map(read),
  ];
  const names = iconNamesIn(files);
  for (const name of JSON.parse(readFileSync(join(here, 'icons-extra.json'), 'utf8'))) names.add(name);
  return names;
}

if (process.argv[1] && process.argv[1].endsWith('icon-names.mjs')) {
  console.log(JSON.stringify([...projectIconNames()].sort(), null, 1));
}
