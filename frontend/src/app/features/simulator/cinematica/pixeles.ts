/**
 * Las capas de luz de la cinemática, en píxel de verdad: el cuarto encendido detrás de la ventana, el haz de las balizas,
 * el resplandor de la ambulancia y la viñeta. Antes eran degradados lisos del lienzo; la vara de calidad del juego pide
 * escalones tramados (Bayer 4 × 4, el mismo tramado de la luz de las salas) y ningún suavizado. Cada capa se compone UNA
 * vez como imagen RGBA y el lienzo la reutiliza en cada cuadro.
 *
 * Pura y sin DOM: se prueba en Node.
 */
import type { Imagen } from '../sala/pintor';

type Rgb = readonly [number, number, number];

/** Bayer 4 × 4, de 0 a 1 (sin llegar). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const tramado = (x: number, y: number): number => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/** El escalón (0 … n−1) de un valor de 0 a 1, con el borde entre escalones tramado. */
export function escalon(valor: number, n: number, x: number, y: number): number {
  const v = Math.min(1, Math.max(0, valor)) * (n - 1);
  const k = Math.floor(v);
  return Math.min(n - 1, v - k > tramado(x, y) ? k + 1 : k);
}

function imagen(ancho: number, alto: number): Imagen {
  return { ancho, alto, rgba: new Uint8ClampedArray(Math.max(1, ancho) * Math.max(1, alto) * 4) };
}

function poner(img: Imagen, x: number, y: number, c: Rgb, a = 255): void {
  if (x < 0 || y < 0 || x >= img.ancho || y >= img.alto) return;
  const p = (y * img.ancho + x) * 4;
  img.rgba[p] = c[0]; img.rgba[p + 1] = c[1]; img.rgba[p + 2] = c[2]; img.rgba[p + 3] = a;
}

const escala = (c: Rgb, f: number): Rgb => [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)];

/** La rampa del cuarto encendido, de la luz de la lámpara a los rincones (tarde: luz de día que entra tibia; noche: ámbar). */
const RAMPA_CUARTO: Record<'tarde' | 'noche', readonly Rgb[]> = {
  tarde: [[242, 201, 142], [222, 176, 120], [201, 141, 92], [154, 106, 76], [109, 74, 58]],
  noche: [[255, 215, 154], [240, 187, 124], [224, 161, 96], [168, 112, 63], [122, 74, 44]],
};

/**
 * El cuarto que se ve por la ventana encendida, del tamaño del cristal: la luz de una lámpara colgada a la derecha y alta,
 * que se apaga por escalones hacia los rincones; el bombillo con su cable; un cuadro en la pared del fondo; y abajo, el
 * mueble bajo la ventana, a contraluz. Las siluetas se pintan encima, en el lienzo.
 */
export function cuartoEncendido(ancho: number, alto: number, momento: 'tarde' | 'noche'): Imagen {
  const img = imagen(ancho, alto);
  const rampa = RAMPA_CUARTO[momento];
  const lx = Math.round(ancho * 0.64), ly = Math.round(alto * 0.22);
  const radio = ancho * 0.78;
  const mueble = Math.round(alto * 0.82);
  const nivel = (x: number, y: number) => escalon(Math.hypot(x - lx, (y - ly) * 1.15) / radio, rampa.length, x, y);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const k = nivel(x, y);
      // El mueble bajo la ventana: el mismo tono, más oscuro, con su canto un poco más claro.
      const c = y >= mueble ? escala(rampa[Math.min(rampa.length - 1, k + (y === mueble ? 1 : 2))], 0.55) : rampa[k];
      poner(img, x, y, c);
    }
  }
  // El cuadro en la pared del fondo, a la izquierda: un marco oscuro y una lámina de un escalón menos de luz.
  const cx = Math.round(ancho * 0.14), cy = Math.round(alto * 0.3);
  const cw = Math.max(6, Math.round(ancho * 0.13)), ch = Math.max(5, Math.round(alto * 0.16));
  for (let y = cy; y < cy + ch; y++) {
    for (let x = cx; x < cx + cw; x++) {
      const borde = x === cx || y === cy || x === cx + cw - 1 || y === cy + ch - 1;
      const base = rampa[Math.min(rampa.length - 1, nivel(x, y) + 1)];
      poner(img, x, y, borde ? escala(base, 0.45) : base);
    }
  }
  // El cable y el bombillo de la lámpara colgada.
  for (let y = 0; y < ly - 2; y++) poner(img, lx, y, escala(rampa[rampa.length - 1], 0.6));
  for (const [dx, dy] of [[-1, -2], [0, -2], [1, -2], [-1, -1], [0, -1], [1, -1], [0, 0]] as const) {
    poner(img, lx + dx, ly + dy, momento === 'noche' ? [255, 246, 214] : [250, 232, 196]);
  }
  return img;
}

/**
 * El reflejo del vidrio sobre el cuarto: dos rayas diagonales de uno y dos píxeles, claras y apenas visibles (alfa fija,
 * sin antialias), que no compiten con las siluetas.
 */
export function reflejoDeVidrio(ancho: number, alto: number): Imagen {
  const img = imagen(ancho, alto);
  for (const [desde, grosor] of [[0.18, 2], [0.31, 1]] as const) {
    for (let y = 0; y < alto; y++) {
      const x0 = Math.round(ancho * desde + (alto - y) * 0.45);
      for (let g = 0; g < grosor; g++) poner(img, x0 + g, y, [255, 255, 255], 26);
    }
  }
  return img;
}

/**
 * El haz de una baliza sobre la fachada: una franja vertical que se aclara hacia su centro en cinco escalones tramados y se
 * apaga en el andén, hacia la cámara. Va en coordenadas del decorado (`alto` = el del decorado). Se suma con `lighter`.
 */
export function hazDeBaliza(ancho: number, alto: number, color: Rgb, suelo: number): Imagen {
  const img = imagen(ancho, alto);
  for (let y = 0; y < alto; y++) {
    const vertical = y < suelo ? 1 : Math.max(0, 1 - (y - suelo) / 70);
    for (let x = 0; x < ancho; x++) {
      const u = 1 - Math.abs((x / Math.max(1, ancho - 1)) * 2 - 1);
      const k = escalon(u * u * vertical, 5, x, y);
      if (k) poner(img, x, y, escala(color, k / 4));
    }
  }
  return img;
}

/** Un resplandor circular por escalones (la luz roja de la ambulancia que entra por la puerta de urgencias). */
export function resplandor(radio: number, color: Rgb): Imagen {
  const lado = radio * 2;
  const img = imagen(lado, lado);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const k = escalon(1 - Math.hypot(x - radio, y - radio) / radio, 5, x, y);
      if (k) poner(img, x, y, escala(color, k / 4));
    }
  }
  return img;
}

/** La viñeta del cine: las esquinas se oscurecen hasta la mitad por escalones tramados; el centro queda limpio. */
export function vinetaTramada(ancho: number, alto: number, color: Rgb = [11, 10, 18]): Imagen {
  const img = imagen(ancho, alto);
  const cx = ancho / 2, cy = alto / 2, r = Math.hypot(cx, cy);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const k = escalon((Math.hypot(x - cx, y - cy) / r - 0.5) / 0.5, 5, x, y);
      if (k) poner(img, x, y, color, 32 * k);
    }
  }
  return img;
}
