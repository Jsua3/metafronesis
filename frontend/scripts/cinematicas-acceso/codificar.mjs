// Codifica los cuadros de grabar.mjs en los archivos que usa el acceso: <toma>.webm (AV1), <toma>.mp4 (H.264) y
// <toma>.webp (póster). Sin audio, a 1280 × 800 (el tamaño de captura: sin reescalar). Necesita ffmpeg en el PATH.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SALIDA } from './grabar.mjs';

const DESTINO = process.env.DESTINO ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../src/assets/login/tomas');
/** Tope por archivo: el acceso no puede pesar más que esto por toma. Si no cabe, se sube el CRF de dos en dos. */
const TOPE = 2 * 1024 * 1024;

function ffmpeg(argumentos) {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...argumentos], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg falló: ${r.stderr || r.error}`);
}

// BT.709 explícito: sin él, cada navegador adivina la matriz de color y el pixel art cambia de tono.
const COLOR = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const FILTRO = 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p';

const FORMATOS = {
  webm: { crf: 30, args: crf => ['-c:v', 'libsvtav1', '-preset', '3', '-crf', `${crf}`, '-g', '90'] },
  mp4: { crf: 20, args: crf => ['-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'animation', '-profile:v', 'high', '-crf', `${crf}`, '-movflags', '+faststart'] },
};

mkdirSync(DESTINO, { recursive: true });
const tomas = readdirSync(SALIDA).filter(nombre => existsSync(join(SALIDA, nombre, 'toma.json')));
if (!tomas.length) throw new Error(`No hay tomas grabadas en ${SALIDA}.`);

for (const nombre of tomas) {
  const carpeta = join(SALIDA, nombre);
  const { fps, cuadros, poster } = JSON.parse(readFileSync(join(carpeta, 'toma.json'), 'utf8'));
  const entrada = ['-framerate', `${fps}`, '-i', join(carpeta, '%04d.png'), '-frames:v', `${cuadros}`, '-vf', FILTRO, ...COLOR, '-an'];
  const pesos = [];
  for (const [extension, formato] of Object.entries(FORMATOS)) {
    const salida = join(DESTINO, `${nombre}.${extension}`);
    let crf = formato.crf;
    for (;; crf += 2) {
      ffmpeg([...entrada, ...formato.args(crf), salida]);
      if (statSync(salida).size <= TOPE) break;
      if (crf > formato.crf + 14) throw new Error(`${nombre}.${extension} no cabe en ${TOPE} bytes.`);
    }
    pesos.push(`${extension} ${(statSync(salida).size / 1024).toFixed(0)} KB (crf ${crf})`);
  }
  const imagen = join(DESTINO, `${nombre}.webp`);
  ffmpeg(['-i', join(carpeta, `${String(poster).padStart(4, '0')}.png`), '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6', imagen]);
  pesos.push(`póster ${(statSync(imagen).size / 1024).toFixed(0)} KB`);
  console.log(`${nombre}: ${(cuadros / fps).toFixed(1)} s · ${pesos.join(' · ')}`);
}
