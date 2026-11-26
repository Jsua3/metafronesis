/**
 * Desde frontend, con Node 24:
 * node scripts/generar-portada-sim-vbg-002.mjs [ruta-de-la-copia-960.png]
 *
 * Compone con el decorado y las capas de luz de la cinemática. Trabaja a 480 × 270 y
 * amplía la portada por réplica exacta de píxeles. La ruta opcional recibe la escala ×2.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import pngjs from 'pngjs';

const { PNG } = pngjs;
const fuentes = new URL('../src/', import.meta.url);
// Los módulos de Angular importan sus vecinos sin extensión. Node ya sabe borrar sus tipos.
const enlaces = registerHooks({
  resolve(specifier, context, siguiente) {
    const local = context.parentURL?.startsWith(fuentes.href) && specifier.startsWith('.') && !extname(specifier);
    const resuelto = siguiente(local ? `${specifier}.ts` : specifier, context);
    return resuelto.url.startsWith(fuentes.href) && resuelto.url.endsWith('.ts')
      ? { ...resuelto, format: 'module-typescript' } : resuelto;
  },
});
const motor = '../src/app/features/simulator/cinematica/';
const { pintarDecorado, rutasDelDecorado } = await import(`${motor}decorados.ts`);
const { CALLE, cuadroDelPlano } = await import(`${motor}escenas.ts`);
const { cuartoEncendido, hazDeBaliza, reflejoDeVidrio } = await import(`${motor}pixeles.ts`);
enlaces.deregister();

const ANCHO = 480;
const ALTO = 270;
const biblioteca = new URL('assets/biblioteca/', fuentes);
const manifiesto = JSON.parse(readFileSync(new URL('piezas/manifiesto.json', biblioteca), 'utf8'));
const cuadro = cuadroDelPlano({
  escena: 'calle-emergencia', momento: 'noche', personas: [], siluetas: [],
  subtitulo: '', luzVentana: null, duracionMs: 5000,
}, 0, { ancho: ANCHO, alto: ALTO }, true);
const clave = `${cuadro.decorado}:${cuadro.momento}`;
const piezas = new Map(rutasDelDecorado(clave, manifiesto).map(ruta => {
  const png = PNG.sync.read(readFileSync(new URL(ruta, biblioteca)));
  return [ruta, { ancho: png.width, alto: png.height, rgba: png.data }];
}));
const decorado = pintarDecorado(clave, manifiesto, piezas);
const vidrio = decorado.vidrio;
if (!vidrio || !cuadro.ventana?.luz) throw new Error('La portada necesita el cristal y la ventana encendida.');
const cuarto = cuartoEncendido(vidrio.w, vidrio.h, cuadro.momento);
const reflejo = reflejoDeVidrio(vidrio.w, vidrio.h);
const casa = decorado.imagen;
const izquierda = CALLE.ventana.x - 112;
const arriba = CALLE.ventana.y - 86;
const balizas = [
  { imagen: hazDeBaliza(188, casa.alto, [255, 46, 58], CALLE.anden[0]), x: izquierda + 224, fuerza: cuadro.luces.rojo },
  { imagen: hazDeBaliza(204, casa.alto, [58, 104, 255], CALLE.anden[0]), x: izquierda + 335, fuerza: cuadro.luces.azul },
];

const base = new PNG({ width: ANCHO, height: ALTO });
for (let y = 0; y < ALTO; y++) {
  for (let x = 0; x < ANCHO; x++) {
    const sx = x + izquierda, sy = y + arriba;
    const origen = (sy * casa.ancho + sx) * 4;
    const destino = (y * ANCHO + x) * 4;
    const vx = sx - vidrio.x, vy = sy - vidrio.y;
    const interior = vy * vidrio.w + vx;
    const cristal = vx >= 0 && vx < vidrio.w && vy >= 0 && vy < vidrio.h && vidrio.mascara[interior];
    for (let c = 0; c < 3; c++) {
      let valor = casa.rgba[origen + c];
      if (cristal) {
        const p = interior * 4;
        const alfa = reflejo.rgba[p + 3] / 255;
        valor = cuarto.rgba[p + c] * (1 - alfa) + reflejo.rgba[p + c] * alfa;
      }
      valor += decorado.derrame?.rgba[origen + c] ?? 0;
      for (const luz of balizas) {
        const lx = sx - luz.x;
        if (lx >= 0 && lx < luz.imagen.ancho) valor += luz.imagen.rgba[(sy * luz.imagen.ancho + lx) * 4 + c] * luz.fuerza;
      }
      base.data[destino + c] = Math.min(255, Math.round(valor));
    }
    base.data[destino + 3] = 255;
  }
}

/** Corte mediano ponderado por frecuencia. El resultado conserva hasta 40 tintas opacas. */
function limitarPaleta(png, maximo) {
  const histograma = new Map();
  for (let i = 0; i < png.data.length; i += 4) {
    const id = png.data.readUIntBE(i, 3);
    histograma.set(id, (histograma.get(id) ?? 0) + 1);
  }
  const grupo = colores => {
    const min = [255, 255, 255], max = [0, 0, 0];
    let peso = 0;
    for (const { rgb, cuenta } of colores) {
      peso += cuenta;
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], rgb[c]);
        max[c] = Math.max(max[c], rgb[c]);
      }
    }
    const rangos = max.map((v, c) => v - min[c]);
    const rango = Math.max(...rangos);
    return { colores, peso, canal: rangos.indexOf(rango), prioridad: rango * Math.sqrt(peso) };
  };
  const cajas = [grupo(Array.from(histograma, ([id, cuenta]) => ({ id, rgb: [id >> 16, (id >> 8) & 255, id & 255], cuenta })))];
  while (cajas.length < maximo) {
    cajas.sort((a, b) => b.prioridad - a.prioridad);
    const { colores, peso, canal } = cajas[0];
    if (colores.length <= 1) break;
    colores.sort((a, b) => a.rgb[canal] - b.rgb[canal] || a.id - b.id);
    let suma = 0, mitad = 0;
    do {
      suma += colores[mitad++].cuenta;
    } while (suma < peso / 2 && mitad < colores.length - 1);
    cajas.splice(0, 1, grupo(colores.slice(0, mitad)), grupo(colores.slice(mitad)));
  }
  const paleta = new Map();
  for (const { colores, peso } of cajas) {
    const rgb = [0, 1, 2].map(c => Math.round(colores.reduce((suma, v) => suma + v.rgb[c] * v.cuenta, 0) / peso));
    const tinta = rgb[0] * 65536 + rgb[1] * 256 + rgb[2];
    for (const { id } of colores) paleta.set(id, tinta);
  }
  for (let i = 0; i < png.data.length; i += 4) png.data.writeUIntBE(paleta.get(png.data.readUIntBE(i, 3)), i, 3);
}

function guardar(escala, ruta) {
  const png = new PNG({ width: ANCHO * escala, height: ALTO * escala });
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const origen = (Math.floor(y / escala) * ANCHO + Math.floor(x / escala)) * 4;
      png.data.writeUInt32BE(base.data.readUInt32BE(origen), (y * png.width + x) * 4);
    }
  }
  writeFileSync(ruta, PNG.sync.write(png, { colorType: 2 }));
}

limitarPaleta(base, 40);
guardar(4, new URL('../../apps/simulation/data/casos/SIM-VBG-002.portada.png', import.meta.url));
if (process.argv[2]) guardar(2, process.argv[2]);
