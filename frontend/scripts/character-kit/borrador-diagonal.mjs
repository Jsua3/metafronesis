#!/usr/bin/env node
/**
 * Borrador de las vistas diagonales (tres cuartos) de una pieza, a partir de
 * sus vistas de frente o espalda y de perfil. Es solo el punto de partida: el
 * archivo que escribe (`<id>.diagonal.mjs`) se corrige después a mano y pasa a
 * ser la autoría. Por eso no pisa un archivo que ya existe (salvo `--forzar`).
 *
 *   node scripts/character-kit/borrador-diagonal.mjs [tipo:id …] [--forzar]
 *
 * Método: cada superposición se lleva a coordenadas del cuadro y se reubica
 * columna a columna como si envolviera un cilindro suave (la cabeza o el
 * tronco) girado hacia donde mira el personaje. El lado hacia donde mira sale
 * de la vista principal (frente o espalda); el lado cercano, del perfil; lo
 * que sobresale de la silueta conserva su vuelo. Las filas no cambian.
 */

import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PIECES } from '../../character-kit/pieces/index.mjs';
import { FRAME, MIRROR_OF, isEmptyChar, parseGrid } from '../../src/app/features/character/kit/kit-engine.ts';
import { KIT_ROOT } from './bundle.mjs';

const W = FRAME.width;
const RAD = Math.PI / 180;

/**
 * Cilindro de cada región: centro y semiancho en la vista diagonal (`T`), en la
 * principal (`M`) y en el perfil (`S`), y cuánto gira. El giro es menor que 45°
 * a propósito: a 48×72 un giro geométrico saca del cráneo el ojo lejano.
 */
export const REGIONES = Object.freeze({
  cabeza: Object.freeze({ cxT: 24.5, rT: 8, cxM: 24, rM: 8.5, cxS: 23.5, rS: 8, giro: 30 }),
  cuerpo: Object.freeze({ cxT: 23.5, rT: 7, cxM: 24, rM: 7.5, cxS: 23.5, rS: 6, giro: 25 }),
});
/** Ángulo (desde el frente o desde la espalda) a partir del cual manda el perfil. */
const CAMBIO = 45;

/** De dónde sale la columna `xT` de la vista diagonal izquierda: vista principal o perfil, y qué columna. */
export function origen(xT, region, lado) {
  const r = REGIONES[region];
  const u = (xT - r.cxT) / r.rT;
  if (u < -1) return { de: 'principal', x: r.cxM - r.rM - (r.cxT - r.rT - xT) };
  if (u > 1) return { de: 'principal', x: r.cxM + r.rM + (xT - r.cxT - r.rT) };
  const a = Math.asin(u) / RAD;
  if (lado === 'frente') {
    const alfa = a + r.giro;
    return alfa <= CAMBIO
      ? { de: 'principal', x: r.cxM + r.rM * Math.sin(alfa * RAD) }
      : { de: 'perfil', x: r.cxS - r.rS * Math.cos(alfa * RAD) };
  }
  const alfa = a + 180 - r.giro;
  return alfa >= 180 - CAMBIO
    ? { de: 'principal', x: r.cxM - r.rM * Math.sin(alfa * RAD) }
    : { de: 'perfil', x: r.cxS - r.rS * Math.cos(alfa * RAD) };
}

const espejo = x => 2 * FRAME.pivotX - x;

/** Superposición → filas de 48 columnas en coordenadas del cuadro (con espejo opcional). */
function filasAbsolutas(overlay, reflejar) {
  const rows = parseGrid(overlay.grid);
  return rows.map(row => {
    const out = new Array(W).fill('.');
    [...row].forEach((ch, c) => {
      if (isEmptyChar(ch)) return;
      const x = reflejar ? espejo(overlay.at[0] + c) : overlay.at[0] + c;
      if (x >= 0 && x < W) out[x] = ch;
    });
    return out;
  });
}

/**
 * Reubica una superposición. `de` dice qué papel hace (principal o perfil):
 * solo aporta las columnas que le tocan. Los rasgos finos (un carácter que
 * aparece 1 o 2 veces en su fila: un ojo, un botón) se llevan además hacia
 * delante, para que la compresión no se los coma.
 */
function reubicar(overlay, de, region, lado, reflejar) {
  const src = filasAbsolutas(overlay, reflejar);
  const mapa = Array.from({ length: W }, (_, xT) => origen(xT, region, lado));
  const out = src.map(row => {
    const fila = new Array(W).fill('.');
    for (let xT = 0; xT < W; xT++) {
      const o = mapa[xT];
      if (o.de !== de) continue;
      const xs = Math.round(o.x);
      if (xs >= 0 && xs < W) fila[xT] = row[xs];
    }
    const cuenta = {};
    for (const ch of row) if (ch !== '.') cuenta[ch] = (cuenta[ch] ?? 0) + 1;
    for (let xs = 0; xs < W; xs++) {
      const ch = row[xs];
      if (ch === '.' || cuenta[ch] > 2) continue;
      let mejor = -1;
      for (let xT = 0; xT < W; xT++) {
        if (mapa[xT].de !== de) continue;
        if (mejor < 0 || Math.abs(mapa[xT].x - xs) < Math.abs(mapa[mejor].x - xs)) mejor = xT;
      }
      if (mejor >= 0 && Math.abs(mapa[mejor].x - xs) <= 1) fila[mejor] = ch;
    }
    return fila;
  });
  const filas = reflejar ? out.map(fila => fila.map((_, x) => fila[espejo(x)] ?? '.')) : out;
  // Recorte a la caja ocupada.
  let x0 = W;
  let x1 = -1;
  let y0 = filas.length;
  let y1 = -1;
  filas.forEach((fila, y) => fila.forEach((ch, x) => {
    if (ch === '.') return;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }));
  if (x1 < 0) return null;
  const grid = filas.slice(y0, y1 + 1).map(fila => fila.slice(x0, x1 + 1).join('')).join('\n');
  const { grid: _, at: __, ...resto } = overlay;
  return { ...resto, at: [x0, overlay.at[1] + y0], grid };
}

const regionDe = (piece, overlay) => (piece.kind === 'hair' || overlay.anchor === 'H' ? 'cabeza' : 'cuerpo');

/** Vistas de autoría que sirven de fuente a un objetivo diagonal. */
function fuentes(piece, objetivo) {
  const reflejar = objetivo.endsWith('right');
  const principal = piece.views[objetivo.startsWith('down') ? 'down' : 'up'] ?? [];
  // Mirando a la derecha el perfil propio es `right`; si no existe, sirve el de la izquierda (pieza simétrica).
  const propia = reflejar ? piece.views.right : undefined;
  return { reflejar, principal, perfil: propia ?? piece.views.left ?? [], perfilReflejado: reflejar && propia !== undefined };
}

/** Borrador de una vista diagonal de la pieza: lista de superposiciones con la grilla en texto. */
export function borradorDiagonal(piece, objetivo) {
  const lado = objetivo.startsWith('down') ? 'frente' : 'espalda';
  const { reflejar, principal, perfil, perfilReflejado } = fuentes(piece, objetivo);
  const out = [];
  // Para un objetivo derecho todo se calcula reflejado (como si mirara a la izquierda) y se devuelve al derecho.
  for (const o of principal) out.push(reubicar(o, 'principal', regionDe(piece, o), lado, reflejar));
  for (const o of perfil) {
    const r = reubicar(o, 'perfil', regionDe(piece, o), lado, perfilReflejado);
    if (r && reflejar && !perfilReflejado) {
      // Perfil izquierdo de una pieza simétrica usado para la derecha: se refleja el resultado.
      const filas = parseGrid(r.grid);
      const ancho = filas[0].length;
      r.grid = filas.map(f => [...f].reverse().join('')).join('\n');
      r.at = [espejo(r.at[0] + ancho - 1), r.at[1]];
    }
    out.push(r);
  }
  return out.filter(Boolean);
}

/** Objetivos de una pieza: las dos izquierdas y, si es asimétrica, también las derechas. */
export function objetivosDe(piece) {
  const izquierdas = Object.values(MIRROR_OF).filter(v => v !== 'left');
  const derechas = Object.keys(MIRROR_OF).filter(v => v !== 'right');
  return piece.asymmetric ? [...izquierdas, ...derechas] : izquierdas;
}

const literal = value => JSON.stringify(value).replace(/"([A-Za-z_][A-Za-z0-9_]*)":/g, '$1: ').replace(/"/g, "'").replace(/,/g, ', ');

/** Texto del archivo `<id>.diagonal.mjs` de una pieza; null si no tiene nada que dibujar. */
export function archivoDiagonal(piece) {
  const vistas = objetivosDe(piece).map(objetivo => [objetivo, borradorDiagonal(piece, objetivo)]);
  if (vistas.every(([, lista]) => lista.length === 0)) return null;
  return textoDiagonal(piece, vistas);
}

/** Texto de un `<id>.diagonal.mjs` con las superposiciones dadas: pares [vista, lista], grillas una fila por línea. */
export function textoDiagonal(piece, vistas) {
  const cuerpo = vistas.map(([objetivo, lista]) => {
    const items = lista.map(o => {
      const { grid, ...campos } = o;
      const props = Object.entries(campos).map(([k, v]) => `${k}: ${literal(v)}`).join(', ');
      const filas = parseGrid(grid).map(f => `        ${f}`).join('\n');
      return `    {\n      ${props},\n      grid: \`\n${filas}\n      \`,\n    },`;
    }).join('\n');
    return `  '${objetivo}': [\n${items}\n  ],`;
  }).join('\n');
  return `/**\n * Vistas diagonales (tres cuartos) de ${piece.kind}:${piece.id}.\n * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se\n * corrigen a mano aquí: este archivo es la autoría.\n */\nexport const DIAGONAL = {\n${cuerpo}\n};\n`;
}

export function rutaDiagonal(piece) {
  return path.join(KIT_ROOT, 'pieces', piece.kind, `${piece.id}.diagonal.mjs`);
}

function main() {
  const args = process.argv.slice(2);
  const forzar = args.includes('--forzar');
  const claves = new Set(args.filter(a => !a.startsWith('--')));
  for (const piece of PIECES) {
    const clave = `${piece.kind}:${piece.id}`;
    if (claves.size && !claves.has(clave)) continue;
    // La fuente son solo las vistas dibujadas a mano: no se deriva de un borrador anterior.
    const base = { ...piece, views: Object.fromEntries(Object.entries(piece.views).filter(([v]) => ['down', 'up', 'left', 'right'].includes(v))) };
    const texto = archivoDiagonal(base);
    const ruta = rutaDiagonal(piece);
    if (texto === null) { process.stdout.write(`${clave}: sin dibujo, no necesita vistas diagonales\n`); continue; }
    if (existsSync(ruta) && !forzar) { process.stdout.write(`${clave}: ya existe ${path.basename(ruta)} (usa --forzar para rehacer el borrador)\n`); continue; }
    writeFileSync(ruta, texto);
    process.stdout.write(`${clave}: borrador en ${path.basename(ruta)}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
