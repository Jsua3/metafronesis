#!/usr/bin/env node
// Mide si el sprite de la jugadora cae en la rejilla del zoom (plan visual F0-7, REGLA-009). Lee las
// instantáneas nativas que escribe pixel-check.e2e.ts (cámara quieta, jugadora caminando): el fondo de cada
// píxel es el color que más se repite entre cuadros y el sprite es lo que difiere de ese fondo. Dentro del
// sprite cuenta, fila por fila, los tramos de un mismo color: con zoom entero k y vértices alineados, cada
// tramo mide un múltiplo de k. Informa el porcentaje de tramos irregulares por cuadro y su media por zoom.
// Uso: node scripts/ui/pixel-grid.mjs <carpeta pixel/<etiqueta>>
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const colorAt = (png, x, y) => {
  const i = (y * png.width + x) * 4;
  return (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2];
};

/** Fondo de una región: por píxel, el color más frecuente entre los cuadros (comparaciones directas, sin mapas). */
export function backgroundOf(frames, x0, y0, width, height) {
  const background = new Int32Array(width * height);
  const colors = new Int32Array(frames.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let f = 0; f < frames.length; f++) colors[f] = colorAt(frames[f], x0 + x, y0 + y);
      let best = colors[0];
      let bestCount = 0;
      for (let i = 0; i < colors.length; i++) {
        let n = 0;
        for (let j = 0; j < colors.length; j++) if (colors[j] === colors[i]) n++;
        if (n > bestCount) { best = colors[i]; bestCount = n; }
      }
      background[y * width + x] = best;
    }
  }
  return background;
}

/** Tramos de un mismo color totalmente dentro del sprite (distinto del fondo) e irregulares (no múltiplos de k). */
export function spriteRuns(png, background, x0, y0, width, height, zoom) {
  let runs = 0;
  let irregular = 0;
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      const c = colorAt(png, x0 + x, y0 + y);
      let end = x + 1;
      while (end < width && colorAt(png, x0 + end, y0 + y) === c) end++;
      let inside = x > 0 && end < width;
      for (let k = x; inside && k < end; k++) if (background[y * width + k] === c) inside = false;
      if (inside) {
        runs++;
        if ((end - x) % zoom !== 0) irregular++;
      }
      x = end;
    }
  }
  return { runs, irregular, ratio: runs ? irregular / runs : 0 };
}

if (process.argv[1] && process.argv[1].endsWith('pixel-grid.mjs')) {
  const dir = process.argv[2];
  for (const meta of readdirSync(dir).filter(file => file.endsWith('.json'))) {
    const info = JSON.parse(readFileSync(join(dir, meta), 'utf8'));
    const frames = info.shots.map(shot => PNG.sync.read(readFileSync(join(dir, `${shot.file}.png`))));
    const zoom = info.shots[0].zoom;
    const ratios = [];
    const width = frames[0].width;
    const height = frames[0].height;
    const background = backgroundOf(frames, 0, 0, width, height);
    info.shots.forEach((shot, index) => {
      const result = spriteRuns(frames[index], background, 0, 0, width, height, zoom);
      ratios.push(result.ratio);
      const extra = shot.worldX !== undefined ? `  x=${Number(shot.worldX).toFixed(2)}  modo=${shot.roundMode}` : '';
      console.log(`${shot.file}  tramos del sprite ${result.runs}  irregulares ${result.irregular} (${(result.ratio * 100).toFixed(1)} %)${extra}`);
    });
    console.log(`${meta}: zoom ${zoom}, media ${(ratios.reduce((a, b) => a + b, 0) / ratios.length * 100).toFixed(1)} % de tramos irregulares en ${ratios.length} cuadros\n`);
  }
}
