/**
 * Pintor por software de una sala por piezas: ejecuta el plan de `composicion.ts` sobre un búfer RGBA.
 *
 *     pintarFondo(plan, imagenes)                  -> piso, muros, capas propias y la sombra de lo que cuelga del fondo
 *     componerSala(plan, imagenes, luz, abiertas)  -> la sala entera, como la pinta `piezas_sala.componer_sala` de Python
 *
 * El juego usa `pintarFondo` para armar la textura del fondo (un solo lienzo en vez de decenas de recortes) y deja las
 * piezas como sprites, que se animan. `componerSala` es la prueba de que todo junto da los mismos píxeles que Python
 * (`scripts/world-art/salas-composicion.test.mjs`) y sirve para capturas de referencia.
 *
 * Sin dependencias y con sintaxis borrable: lo cargan el navegador y las pruebas en Node.
 */
import type { PlanDeSala, SpriteDeSala } from './composicion';
import { VACIO } from './composicion';
import { SEAM, TOP } from './geometria';
import { colorDeReflejo } from './luz';
import type { CapasDeLuz, TonoDeReflejo } from './luz';

export interface Imagen {
  ancho: number;
  alto: number;
  /** RGBA, 8 bits por canal, por filas. */
  rgba: Uint8Array | Uint8ClampedArray;
}

export type Imagenes = ReadonlyMap<string, Imagen>;

/** Lo que cuelga del muro del fondo le echa una sombra de 3 px, abajo y a la derecha, al 76 %. */
const SOMBRA_DE_MURO = 76;
const CORRE_DE_SOMBRA = 3;
/** Cuadro de una puerta abierta del todo. */
const CUADRO_ABIERTA = 3;

/** (a · b) / 255 hacia abajo, como `ImageChops.multiply` de Pillow (comprobado con las 65 536 combinaciones). */
function multiplicar(a: number, b: number): number {
  return Math.floor((a * b) / 255);
}

interface Pegado {
  origen?: readonly number[];
  opaco?: boolean;
  espejo?: boolean;
}

/** Pega `src` (o un rectángulo suyo) en (dx, dy), recortando a los bordes. El destino es opaco. */
function pegar(dst: Imagen, src: Imagen, dx: number, dy: number, opciones: Pegado = {}): void {
  const [sx, sy, sw, sh] = opciones.origen ?? [0, 0, src.ancho, src.alto];
  const d = dst.rgba, s = src.rgba;
  for (let j = 0; j < sh; j++) {
    const y = dy + j, fy = sy + j;
    if (y < 0 || y >= dst.alto || fy < 0 || fy >= src.alto) continue;
    for (let i = 0; i < sw; i++) {
      const x = dx + i, fx = opciones.espejo ? sx + sw - 1 - i : sx + i;
      if (x < 0 || x >= dst.ancho || fx < 0 || fx >= src.ancho) continue;
      const o = (fy * src.ancho + fx) * 4, p = (y * dst.ancho + x) * 4;
      const alfa = opciones.opaco ? 255 : s[o + 3];
      if (alfa === 0) continue;
      if (alfa === 255) {
        d[p] = s[o];
        d[p + 1] = s[o + 1];
        d[p + 2] = s[o + 2];
      } else {
        // `Image.alpha_composite` de Pillow sobre un destino opaco, con sus 7 bits de precisión.
        const c1 = alfa * 128, c2 = 255 * 128 - c1;
        for (let k = 0; k < 3; k++) {
          const t = s[o + k] * c1 + d[p + k] * c2 + (0x80 << 7);
          d[p + k] = (((t >> 8) + t) >> 8) >> 7;
        }
      }
      d[p + 3] = 255;
    }
  }
}

function pegarSprite(dst: Imagen, imagenes: Imagenes, sprite: SpriteDeSala, cuadro: number): void {
  const hoja = imagenes.get(sprite.ruta);
  if (hoja) pegar(dst, hoja, sprite.x, sprite.y, { origen: [cuadro * sprite.w, 0, sprite.w, sprite.h], espejo: sprite.espejo });
}

/** Sombra que arroja sobre el muro del fondo lo que cuelga de él, con cada pieza en su cuadro de reposo. */
function sombraDeMuro(escena: Imagen, plan: PlanDeSala, imagenes: Imagenes): void {
  const w = escena.ancho;
  const cosa = new Uint8Array(w * escena.alto);
  for (const sprite of plan.sprites) {
    const hoja = sprite.capa === 'muro' && sprite.muro === 'fondo' ? imagenes.get(sprite.ruta) : undefined;
    if (!hoja) continue;
    for (let j = 0; j < sprite.h; j++) {
      const y = sprite.y + j;
      if (y < 0 || y >= escena.alto) continue;
      for (let i = 0; i < sprite.w; i++) {
        const x = sprite.x + i, fx = sprite.cuadro * sprite.w + i;
        if (x < 0 || x >= w || fx >= hoja.ancho || j >= hoja.alto) continue;
        if (hoja.rgba[(j * hoja.ancho + fx) * 4 + 3] > 0) cosa[y * w + x] = 1;
      }
    }
  }
  const d = escena.rgba;
  const ya = Math.max(TOP + 6, CORRE_DE_SOMBRA), xa = Math.max(plan.muroFondo.x0, CORRE_DE_SOMBRA);
  for (let y = ya; y < SEAM - 7; y++) {
    for (let x = xa; x < plan.muroFondo.x1; x++) {
      const i = y * w + x;
      if (cosa[i] || !cosa[i - CORRE_DE_SOMBRA * w - CORRE_DE_SOMBRA]) continue;
      const p = i * 4;
      d[p] = Math.floor((d[p] * SOMBRA_DE_MURO) / 100);
      d[p + 1] = Math.floor((d[p + 1] * SOMBRA_DE_MURO) / 100);
      d[p + 2] = Math.floor((d[p + 2] * SOMBRA_DE_MURO) / 100);
    }
  }
}

/** El fondo de la sala: vacío, cielo, piso, tapetes, muros, capas propias y la sombra de lo que cuelga del muro del fondo. */
export function pintarFondo(plan: PlanDeSala, imagenes: Imagenes): Imagen {
  const escena: Imagen = { ancho: plan.ancho, alto: plan.alto, rgba: new Uint8ClampedArray(plan.ancho * plan.alto * 4) };
  const d = escena.rgba;
  for (let p = 0; p < d.length; p += 4) {
    d[p] = VACIO[0];
    d[p + 1] = VACIO[1];
    d[p + 2] = VACIO[2];
    d[p + 3] = 255;
  }
  if (plan.cielo) {
    // Cuatro franjas sobre el muro; cada una llega, inclusive, hasta la fila donde empieza la siguiente.
    const alto = TOP - 6;
    plan.cielo.forEach((color, k) => {
      const hasta = Math.min(plan.alto - 1, Math.floor(((k + 1) * alto) / 4));
      for (let y = Math.floor((k * alto) / 4); y <= hasta; y++) {
        for (let p = y * plan.ancho * 4; p < (y + 1) * plan.ancho * 4; p += 4) {
          d[p] = color[0];
          d[p + 1] = color[1];
          d[p + 2] = color[2];
        }
      }
    });
  }
  for (const recorte of plan.fondo) {
    const imagen = imagenes.get(recorte.ruta);
    if (imagen) pegar(escena, imagen, recorte.x, recorte.y, { origen: recorte.origen, opaco: recorte.opaco });
  }
  sombraDeMuro(escena, plan, imagenes);
  return escena;
}

/** Aplica las dos capas de luz sobre la escena: `ambiente` multiplica y `brillo` suma. */
export function aplicarLuz(escena: Imagen, luz: CapasDeLuz): void {
  const d = escena.rgba;
  for (let p = 0; p < d.length; p += 4) {
    for (let k = 0; k < 3; k++) d[p + k] = Math.min(255, multiplicar(d[p + k], luz.ambiente[p + k]) + luz.brillo[p + k]);
  }
}

export type MedidaDeReflejo = (x: number, y: number) => { k: number; tono: TonoDeReflejo };

/**
 * El brillo de un sprite en la capa de brillo: primero borra lo que tapa (su silueta), después pone, donde su mapa brilla, el
 * color que suma con la luz que le llega. Así cada pieza tapa el brillo de lo que tiene detrás.
 */
export function brilloDeSprite(capa: Uint8ClampedArray, ancho: number, alto: number, imagenes: Imagenes, sprite: SpriteDeSala, cuadro: number,
  reflejo: { k: number; tono: TonoDeReflejo } | null): void {
  const hoja = imagenes.get(sprite.ruta), mapa = sprite.brillo ? imagenes.get(sprite.brillo) : undefined;
  if (!hoja) return;
  const colores = reflejo ? [85, 170, 255].map(gris => colorDeReflejo(reflejo.k, reflejo.tono, gris)) : null;
  for (let j = 0; j < sprite.h; j++) {
    const y = sprite.y + j;
    if (y < 0 || y >= alto) continue;
    for (let i = 0; i < sprite.w; i++) {
      const x = sprite.x + i;
      if (x < 0 || x >= ancho) continue;
      const fx = cuadro * sprite.w + (sprite.espejo ? sprite.w - 1 - i : i);
      const p = (y * ancho + x) * 3;
      if (fx < hoja.ancho && j < hoja.alto && hoja.rgba[(j * hoja.ancho + fx) * 4 + 3] === 255) capa.fill(0, p, p + 3);
      if (!mapa || !colores || fx >= mapa.ancho || j >= mapa.alto) continue;
      const o = (j * mapa.ancho + fx) * 4;
      if (mapa.rgba[o + 3] !== 255) continue;
      const nivel = [85, 170, 255].indexOf(mapa.rgba[o]);
      const color = nivel >= 0 ? colores[nivel] : null;
      if (color && (color[0] || color[1] || color[2])) capa.set(color, p);
    }
  }
}

/** `Image.paste` de Pillow con máscara: (src·m + dst·(255 − m) + 128), redondeado como Pillow. */
function mezclar(src: number, dst: number, m: number): number {
  const t = src * m + dst * (255 - m) + 128;
  return (t + (t >> 8)) >> 8;
}

/**
 * La luz propia de un sprite en la capa RGBA de lo que emite: primero borra lo que tapa (su silueta, con su alfa), después
 * pega su mapa emisivo con el alfa del mapa (`propios.paste` de `piezas_sala.componer_sala`). Así lo de delante tapa la
 * luz propia de lo de atrás.
 */
export function emisivoDeSprite(capa: Uint8ClampedArray, ancho: number, alto: number, imagenes: Imagenes, sprite: SpriteDeSala, cuadro: number): void {
  const hoja = imagenes.get(sprite.ruta), mapa = sprite.emisivo ? imagenes.get(sprite.emisivo) : undefined;
  if (!hoja) return;
  for (let j = 0; j < sprite.h; j++) {
    const y = sprite.y + j;
    if (y < 0 || y >= alto) continue;
    for (let i = 0; i < sprite.w; i++) {
      const x = sprite.x + i;
      if (x < 0 || x >= ancho) continue;
      const fx = cuadro * sprite.w + (sprite.espejo ? sprite.w - 1 - i : i);
      const p = (y * ancho + x) * 4;
      const a = fx < hoja.ancho && j < hoja.alto ? hoja.rgba[(j * hoja.ancho + fx) * 4 + 3] : 0;
      if (a) for (let k = 0; k < 4; k++) capa[p + k] = mezclar(0, capa[p + k], a);
      if (!mapa || fx >= mapa.ancho || j >= mapa.alto) continue;
      const o = (j * mapa.ancho + fx) * 4, m = mapa.rgba[o + 3];
      if (m) for (let k = 0; k < 4; k++) capa[p + k] = mezclar(mapa.rgba[o + k], capa[p + k], m);
    }
  }
}

/**
 * La sala entera como la pintaría el juego sin muebles ni personas: fondo, piezas de muro, piezas de piso por `z`, lo del
 * lado de la cámara y, si se pasa, la luz y el brillo de vidrio, metal y barniz (medido con `reflejo`). Las puertas de
 * `abiertas` van en su último cuadro.
 */
export function componerSala(plan: PlanDeSala, imagenes: Imagenes, luz: CapasDeLuz | null, abiertas: readonly string[] = [],
  reflejo: MedidaDeReflejo | null = null): Imagen {
  const escena = pintarFondo(plan, imagenes);
  const orden = { muro: 0, piso: 1, frente: 2 };
  const cosas = plan.sprites
    .map((sprite, n) => ({ sprite, n }))
    .sort((a, b) => orden[a.sprite.capa] - orden[b.sprite.capa] || a.sprite.z - b.sprite.z || a.n - b.n);
  const brillos = new Uint8ClampedArray(plan.ancho * plan.alto * 3);
  const propios = new Uint8ClampedArray(plan.ancho * plan.alto * 4);   // lo que emite luz propia: va encima de la luz
  for (const { sprite } of cosas) {
    const cuadro = sprite.puerta && abiertas.includes(sprite.id) ? CUADRO_ABIERTA : sprite.cuadro;
    emisivoDeSprite(propios, plan.ancho, plan.alto, imagenes, sprite, cuadro);
    pegarSprite(escena, imagenes, sprite, cuadro);
    brilloDeSprite(brillos, plan.ancho, plan.alto, imagenes, sprite, cuadro, reflejo ? reflejo(sprite.punto[0], sprite.punto[1]) : null);
  }
  if (luz) {
    aplicarLuz(escena, luz);
    const d = escena.rgba;
    for (let p = 0, q = 0; p < d.length; p += 4, q += 3) {
      d[p] = Math.min(255, d[p] + brillos[q]);
      d[p + 1] = Math.min(255, d[p + 1] + brillos[q + 1]);
      d[p + 2] = Math.min(255, d[p + 2] + brillos[q + 2]);
      const m = propios[p + 3];
      if (m) for (let k = 0; k < 3; k++) d[p + k] = mezclar(propios[p + k], d[p + k], m);
    }
  }
  return escena;
}
