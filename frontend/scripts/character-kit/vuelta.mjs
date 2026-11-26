#!/usr/bin/env node
/**
 * Hojas de contacto de la vuelta en ocho vistas, sin navegador: PNG directo a
 * escala entera (vecino más cercano). Sirve para mirar y corregir las diagonales.
 *
 *   node scripts/character-kit/vuelta.mjs --maniqui
 *   node scripts/character-kit/vuelta.mjs --receta valentina,jorge
 *   node scripts/character-kit/vuelta.mjs --piezas hair:afro,top:camisa [--complexion a]
 *   node scripts/character-kit/vuelta.mjs --elenco
 *   opciones: --caminata [vistas] (una fila por vista con los 6 cuadros; por defecto las dos diagonales)
 *             --reposo [vistas] (igual, con los 4 cuadros de reposo)
 *             --vistas <lista> (en la vuelta, solo esas columnas) · --escala <k> (4) · --salida <png>
 *
 * Sin `--caminata` ni `--reposo`: una fila por personaje con las 8 vistas en
 * orden de giro (cuadro 0 de reposo). La hoja no lleva texto: el orden de las
 * filas se imprime en la salida estándar.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FRAME, SHEETS, VIEW_ROWS, composeCharacter } from '../../src/app/features/character/kit/kit-engine.ts';
import { FRONTEND_ROOT, buildBundle } from './bundle.mjs';
import { recipeVariants } from './build.mjs';
import { encodePng } from './kit-png.mjs';
import { mannequinBundle, mannequinRecipe } from './laminas.mjs';
import { sampleRecipe } from './muestras.mjs';

const FONDO = [0x9c, 0x98, 0xa8, 255];
const SUELO = [0x7d, 0x78, 0x8a, 255];
const MARGEN = 2;

/** Celdas de la vuelta: las 8 vistas en orden de giro, un cuadro de una hoja. */
export function celdasDeVuelta(composed, hoja = 'idle', cuadro = 0, vistas = VIEW_ROWS) {
  return vistas.map(view => {
    const row = VIEW_ROWS.indexOf(view);
    if (row < 0) throw new Error(`vista desconocida: ${view}`);
    return { image: composed[hoja], col: cuadro, row };
  });
}

/** Celdas de una vista: todos los cuadros de la hoja. */
export function celdasDeVista(composed, hoja, view) {
  const row = VIEW_ROWS.indexOf(view);
  if (row < 0) throw new Error(`vista desconocida: ${view}`);
  return Array.from({ length: SHEETS[hoja].frames }, (_, col) => ({ image: composed[hoja], col, row }));
}

/**
 * Pega filas de celdas en una imagen: cada celda es un cuadro 48×72 de una
 * hoja, escalado ×k, con una línea de suelo bajo los pies para juzgar el apoyo.
 */
export function vueltaImage(filas, { escala = 4 } = {}) {
  const k = escala;
  const cw = (FRAME.width + MARGEN) * k;
  const ch = (FRAME.height + MARGEN) * k;
  const cols = Math.max(...filas.map(f => f.length));
  const width = cols * cw + MARGEN * k;
  const height = filas.length * ch + MARGEN * k;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set(FONDO, i * 4);
  filas.forEach((fila, r) => {
    fila.forEach((celda, c) => {
      const ox = MARGEN * k + c * cw;
      const oy = MARGEN * k + r * ch;
      // Suelo: la fila del punto de apoyo (y = 68).
      for (let x = 0; x < FRAME.width * k; x++) {
        for (let dy = 0; dy < k; dy++) rgba.set(SUELO, ((oy + FRAME.pivotY * k + dy) * width + ox + x) * 4);
      }
      for (let y = 0; y < FRAME.height; y++) {
        for (let x = 0; x < FRAME.width; x++) {
          const s = ((celda.row * FRAME.height + y) * celda.image.width + celda.col * FRAME.width + x) * 4;
          if (celda.image.rgba[s + 3] === 0) continue;
          const px = celda.image.rgba.subarray(s, s + 4);
          for (let dy = 0; dy < k; dy++) {
            for (let dx = 0; dx < k; dx++) rgba.set(px, ((oy + y * k + dy) * width + ox + x * k + dx) * 4);
          }
        }
      }
    });
  });
  return { width, height, rgba };
}

export function vueltaPng(filas, opciones) {
  const image = vueltaImage(filas, opciones);
  return encodePng(image.width, image.height, image.rgba);
}

/** Personajes pedidos por la línea de órdenes: [etiqueta, compuesto]. */
function personajes(args) {
  if (args.maniqui) {
    const bundle = mannequinBundle();
    return Object.keys(bundle.complexions).sort().map(c => [`maniquí ${c.toUpperCase()}`, composeCharacter(bundle, mannequinRecipe(c))]);
  }
  const bundle = buildBundle();
  if (args.receta) {
    return args.receta.split(',').map(id => {
      const recipe = bundle.recipes[id];
      if (!recipe) throw new Error(`receta desconocida: ${id}`);
      return [id, composeCharacter(bundle, recipe)];
    });
  }
  if (args.piezas) {
    const complexions = args.complexion ? [args.complexion] : Object.keys(bundle.complexions).sort();
    return args.piezas.split(',').flatMap(key => {
      if (!bundle.pieces[key]) throw new Error(`pieza desconocida: ${key}`);
      return complexions.map(c => [`${key} · ${c.toUpperCase()}`, composeCharacter(bundle, sampleRecipe(key, c))]);
    });
  }
  if (args.elenco) {
    return Object.values(bundle.recipes).flatMap(r => [
      [r.id, composeCharacter(bundle, r)],
      ...(args.variantes ? recipeVariants(bundle, r).map(([v, vr]) => [`${r.id}/${v}`, composeCharacter(bundle, vr)]) : []),
    ]);
  }
  throw new Error('uso: vuelta.mjs --maniqui | --receta <ids> | --piezas <claves> | --elenco [--variantes] [--caminata [vistas]] [--reposo [vistas]] [--escala k] [--salida png]');
}

const BANDERAS = new Set(['maniqui', 'elenco', 'variantes']);
const CON_VALOR_OPCIONAL = new Set(['caminata', 'reposo']);

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (BANDERAS.has(key)) args[key] = true;
    else if (CON_VALOR_OPCIONAL.has(key)) args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'down-left,up-left';
    else if (key === 'escala') args.escala = Number(argv[++i]);
    else args[key] = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const lista = personajes(args);
  const hoja = args.caminata ? 'walk' : 'idle';
  const vistas = (args.caminata ?? args.reposo)?.split(',');
  const filas = [];
  const leyenda = [];
  for (const [etiqueta, composed] of lista) {
    if (vistas) {
      for (const view of vistas) {
        filas.push(celdasDeVista(composed, hoja, view));
        leyenda.push(`${etiqueta} · ${hoja} ${view}`);
      }
    } else {
      const columnas = args.vistas ? args.vistas.split(',') : VIEW_ROWS;
      filas.push(celdasDeVuelta(composed, 'idle', 0, columnas));
      leyenda.push(`${etiqueta} · ${columnas.join(', ')}`);
    }
  }
  const out = path.resolve(args.salida ?? path.join(FRONTEND_ROOT, '..', 'docs', 'visual', 'kit-personajes', 'vuelta.png'));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, vueltaPng(filas, { escala: args.escala ?? 4 }));
  process.stdout.write(`${leyenda.map((l, i) => `fila ${i + 1}: ${l}`).join('\n')}\nhoja ${out}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
