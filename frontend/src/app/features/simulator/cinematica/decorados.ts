/**
 * Los decorados de la cinemática, compuestos por software con el mismo motor de las salas del juego (`sala/composicion.ts`,
 * `sala/pintor.ts` y la luz de `sala/luz.ts`): la calle de la casa (tarde o noche) y la entrada de urgencias (noche). Cada
 * uno se compone UNA vez y queda como una imagen; lo que se mueve (personas, la camilla, las luces) lo pinta el lienzo
 * encima, cuadro a cuadro.
 *
 * - La calle son dos fachadas seguidas de la biblioteca de piezas: la de la casa (casa A, con su alero) y otra de ladrillo.
 * - La tarde es la luz de día del motor con el grado de la hora dorada: cielo cálido, luz que entibia las paredes y, abajo,
 *   la sombra fría y tramada de las casas de enfrente (sombras largas).
 * - La noche es la del motor tal cual (luna fría, sin lámparas en la calle); la ventana de la casa se enciende encima.
 *
 * Pura y con sintaxis borrable: se prueba en Node con las imágenes de la biblioteca.
 */
import type { ManifiestoDePiezas, SalaPorPiezas } from '../sala/catalogo';
import { CIELO_DE_DIA, planDeSala, rutasDelPlan } from '../sala/composicion';
import type { PlanDeSala } from '../sala/composicion';
import { SEAM, TOP } from '../sala/geometria';
import type { Momento } from '../sala/geometria';
import { calcularLuz } from '../sala/luz';
import { componerSala } from '../sala/pintor';
import type { Imagen, Imagenes } from '../sala/pintor';

export type ClaveDeDecorado = 'calle:tarde' | 'calle:noche' | 'urgencias:noche';

/** Casa A: la fachada de la casa de la biblioteca (`lugares/casa.json`, sala `fachada`), sin sus muebles. */
export const CASA_A: SalaPorPiezas = {
  encuadre: 'una-pared',
  estructura: {
    ancho: 960,
    exterior: true,
    momento: 'dia',
    acabados: { muro: 'zocalo-alto', paleta: 'casa-fachada', piso: 'adoquin', variante: 'casa-fachada' },
    piezas: [
      { id: 'corrediza-1', tipo: 'ventana', modelo: 'corrediza', muro: 'fondo', pos: 232 },
      { id: 'corrediza-2', tipo: 'ventana', modelo: 'corrediza', muro: 'fondo', pos: 728 },
    ],
    propios: [{ ref: 'casa/fachada', ruta: 'piezas/propios/casa-fachada.png' }],
  },
  puertas: [{ id: 'puerta-sala', muro: 'fondo', pos: 480, modelo: 'madera' }],
};

/** Casa B: la vecina, de ladrillo a la vista, con persiana, ventana alta y puerta metálica. */
export const CASA_B: SalaPorPiezas = {
  encuadre: 'una-pared',
  estructura: {
    ancho: 960,
    exterior: true,
    momento: 'dia',
    acabados: { muro: 'ladrillo', paleta: 'casa-patio', piso: 'adoquin', variante: 'casa-fachada' },
    piezas: [
      { id: 'persiana-1', tipo: 'ventana', modelo: 'persiana', muro: 'fondo', pos: 220 },
      { id: 'alta-1', tipo: 'ventana', modelo: 'alta', muro: 'fondo', pos: 700 },
    ],
  },
  puertas: [{ id: 'puerta-b', muro: 'fondo', pos: 460, modelo: 'metalica' }],
};

/** La entrada de urgencias del hospital de la biblioteca (`lugares/hospital.json`, sala `entrada-urgencias`). */
export const ENTRADA_DE_URGENCIAS: SalaPorPiezas = {
  encuadre: 'tres-paredes',
  estructura: {
    ancho: 1200,
    momento: 'noche',
    acabados: { muro: 'azulejo', paleta: 'hospital', piso: 'baldosa', variante: 'b' },
    piezas: [
      { id: 'tubo-1', tipo: 'lampara', modelo: 'tubo', muro: 'fondo', pos: 250, encendida: true },
      { id: 'tubo-2', tipo: 'lampara', modelo: 'tubo', muro: 'fondo', pos: 690, encendida: true },
      { id: 'cruz', tipo: 'cruz', modelo: 'cruz', muro: 'fondo', pos: 326 },
      { id: 'reloj', tipo: 'reloj', modelo: 'reloj', muro: 'fondo', pos: 378 },
      { id: 'gel', tipo: 'gel', modelo: 'gel', muro: 'fondo', pos: 600 },
      { id: 'senal', tipo: 'senal', modelo: 'senal', muro: 'fondo', pos: 640 },
      { id: 'extintor', tipo: 'extintor', modelo: 'extintor', muro: 'fondo', pos: 700 },
      { id: 'ventana', tipo: 'ventana', modelo: 'alta', muro: 'fondo', pos: 808 },
      { id: 'ventanal', tipo: 'ventana', modelo: 'ventanal', muro: 'derecha', pos: 150 },
    ],
  },
  puertas: [
    { id: 'a-espera', muro: 'fondo', pos: 485, modelo: 'corrediza' },
    { id: 'a-pasillo', muro: 'izquierda', pos: 160, modelo: 'urgencias' },
  ],
};

/** La ventana de la casa A que la cinemática enciende y en la que se ven las siluetas. */
export const VENTANA_DE_LA_CASA = 'corrediza-1';

function partes(clave: ClaveDeDecorado): { salas: SalaPorPiezas[]; momento: Momento } {
  if (clave === 'urgencias:noche') return { salas: [ENTRADA_DE_URGENCIAS], momento: 'noche' };
  return { salas: [CASA_A, CASA_B], momento: clave === 'calle:noche' ? 'noche' : 'dia' };
}

function planes(clave: ClaveDeDecorado, manifiesto: ManifiestoDePiezas): PlanDeSala[] {
  const { salas, momento } = partes(clave);
  return salas.map(sala => planDeSala(sala, manifiesto, momento));
}

/** Las imágenes de la biblioteca (rutas relativas a `biblioteca/`) que un decorado necesita. Lanza si no se puede planear. */
export function rutasDelDecorado(clave: ClaveDeDecorado, manifiesto: ManifiestoDePiezas): string[] {
  return [...new Set(planes(clave, manifiesto).flatMap(rutasDelPlan))];
}

/** El cristal de una ventana en el decorado: su caja y su máscara (1 = cristal), sacada del cielo pintado de día. */
export interface Vidrio {
  x: number;
  y: number;
  w: number;
  h: number;
  mascara: Uint8Array;
}

export interface DecoradoPintado {
  clave: ClaveDeDecorado;
  ancho: number;
  alto: number;
  /** La escena con su luz y su grado de color. */
  imagen: Imagen;
  /** La luz ambiente (RGBA, se multiplica): con ella se tiñen las personas según dónde pisan. */
  ambiente: Uint8ClampedArray;
  /** Además de la luz: el grado de la hora (tarde cálida), que también tiñe a las personas. 255 = sin cambio. */
  grado: readonly [number, number, number];
  /** El cristal de la ventana de la casa (solo en la calle). */
  vidrio: Vidrio | null;
  /** Lo que suma la ventana encendida en la pared y el andén (RGBA; alfa 255 donde hay luz). Solo en la calle de noche. */
  derrame: Imagen | null;
}

/** Bayer 4 × 4, de 0 a 15: el mismo tramado de la luz de las salas. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const tramado = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/** Grado de la hora dorada sobre lo que no es cielo (las personas se tiñen igual). */
export const GRADO_DE_TARDE: readonly [number, number, number] = [255, 228, 196];
const SIN_GRADO: readonly [number, number, number] = [255, 255, 255];
/** Cielo de la tarde, de arriba al horizonte. */
const CIELO_DE_TARDE: readonly (readonly [number, number, number])[] = [[112, 128, 178], [168, 150, 176], [222, 170, 150], [246, 198, 150]];
/** La sombra de las casas de enfrente en el andén: fría y un escalón más oscura. */
const SOMBRA_FRIA: readonly [number, number, number] = [176, 182, 214];

function unirEnFila(imagenes: Imagen[]): Imagen {
  const ancho = imagenes.reduce((s, i) => s + i.ancho, 0), alto = imagenes[0].alto;
  const rgba = new Uint8ClampedArray(ancho * alto * 4);
  let x0 = 0;
  for (const img of imagenes) {
    for (let y = 0; y < alto; y++) rgba.set(img.rgba.subarray(y * img.ancho * 4, (y + 1) * img.ancho * 4), (y * ancho + x0) * 4);
    x0 += img.ancho;
  }
  return { ancho, alto, rgba };
}

/** El cielo pintado por la composición (sin luz): 1 donde el píxel es una franja del cielo de día. */
function marcarCielo(fondo: Imagen, mascara: Uint8Array, ancho: number, x0: number): void {
  const colores = new Set(CIELO_DE_DIA.map(c => (c[0] << 16) | (c[1] << 8) | c[2]));
  for (let y = 0; y < Math.min(fondo.alto, TOP); y++) {
    for (let x = 0; x < fondo.ancho; x++) {
      const p = (y * fondo.ancho + x) * 4, d = fondo.rgba;
      if (colores.has((d[p] << 16) | (d[p + 1] << 8) | d[p + 2])) mascara[y * ancho + x0 + x] = 1;
    }
  }
}

/** La hora dorada: cielo cálido, grado sobre todo lo demás y la sombra tramada de enfrente en el andén. */
export function gradoDeTarde(escena: Imagen, cielo: Uint8Array): void {
  const { ancho, alto, rgba: d } = escena;
  const altoCielo = TOP - 6;
  for (let y = 0; y < alto; y++) {
    // La sombra de enfrente: su borde baja un poco hacia la derecha y se deshace en 6 filas de tramado.
    for (let x = 0; x < ancho; x++) {
      const i = y * ancho + x, p = i * 4;
      if (cielo[i]) {
        const f = Math.min(1, y / altoCielo) * (CIELO_DE_TARDE.length - 1);
        const k = Math.min(CIELO_DE_TARDE.length - 2, Math.floor(f)), r = f - k;
        // Franjas tramadas, como el cielo de las salas: nada de degradado liso.
        const c = CIELO_DE_TARDE[r > tramado(x, y) ? k + 1 : k];
        d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2];
        continue;
      }
      for (let k = 0; k < 3; k++) d[p + k] = (d[p + k] * GRADO_DE_TARDE[k]) >> 8;
      const borde = 290 + (x / ancho) * 10;
      const dentro = y - borde;
      if (dentro > 0 && (dentro >= 6 || dentro / 6 > tramado(x, y))) {
        for (let k = 0; k < 3; k++) d[p + k] = (d[p + k] * SOMBRA_FRIA[k]) >> 8;
      }
    }
  }
  // Sol bajo en lo alto de las paredes: una franja tibia sobre el zócalo, que se apaga hacia abajo con tramado.
  for (let y = TOP; y < SEAM; y++) {
    const f = 1 - (y - TOP) / (SEAM - TOP);
    for (let x = 0; x < ancho; x++) {
      const i = y * ancho + x;
      if (cielo[i] || f * 0.9 < tramado(x, y)) continue;
      const p = i * 4;
      d[p] = Math.min(255, d[p] + 14);
      d[p + 1] = Math.min(255, d[p + 1] + 8);
    }
  }
}

/** El cristal de la ventana: la caja del sprite y, de su mapa de luz propia de DÍA (el cielo), la máscara. */
function vidrioDe(plan: PlanDeSala, imagenes: Imagenes, id: string): Vidrio | null {
  const s = plan.sprites.find(sprite => sprite.id === id);
  const emisivo = s?.emisivo ? imagenes.get(s.emisivo) : undefined;
  if (!s || !emisivo) return null;
  const mascara = new Uint8Array(s.w * s.h);
  let alguno = false;
  for (let j = 0; j < s.h && j < emisivo.alto; j++) {
    for (let i = 0; i < s.w && i < emisivo.ancho; i++) {
      if (emisivo.rgba[(j * emisivo.ancho + i) * 4 + 3] > 0) { mascara[j * s.w + i] = 1; alguno = true; }
    }
  }
  return alguno ? { x: s.x, y: s.y, w: s.w, h: s.h, mascara } : null;
}

/**
 * De noche, vista desde la calle, una ventana no deja ver el cielo (eso es lo que el motor de salas pinta, porque mira
 * desde ADENTRO): deja ver un cuarto en penumbra. Se pinta por escalones tramados (techo más oscuro, pared, el mueble bajo
 * la ventana) y con el reflejo frío de la luna en el vidrio: una franja diagonal de dos tonos, sin suavizado.
 */
const CUARTO_DE_NOCHE = {
  techo: [20, 18, 29] as const,
  pared: [31, 28, 42] as const,
  mueble: [17, 14, 22] as const,
  reflejo: [54, 58, 82] as const,
  reflejoSuave: [40, 42, 60] as const,
};

export function vidrioDeNoche(imagen: Imagen, vidrio: Vidrio): void {
  const { x: x0, y: y0, w, h, mascara } = vidrio;
  const d = imagen.rgba;
  for (let j = 0; j < h; j++) {
    const y = y0 + j;
    if (y < 0 || y >= imagen.alto) continue;
    const f = j / Math.max(1, h - 1);
    for (let i = 0; i < w; i++) {
      if (!mascara[j * w + i]) continue;
      const x = x0 + i;
      if (x < 0 || x >= imagen.ancho) continue;
      // Del techo a la pared en un borde tramado de 4 filas; el mueble ocupa el último 18 %.
      let c: readonly [number, number, number] = f < 0.3 || (f < 0.3 + 4 / h && (f - 0.3) * h / 4 < tramado(x, y)) ? CUARTO_DE_NOCHE.techo : CUARTO_DE_NOCHE.pared;
      if (f > 0.82) c = CUARTO_DE_NOCHE.mueble;
      // La luna en el vidrio: una franja diagonal (de abajo a la izquierda hacia arriba a la derecha) con borde tramado.
      const banda = (i + j * 0.7) / w;
      if (banda > 0.42 && banda < 0.5) c = CUARTO_DE_NOCHE.reflejo;
      else if ((banda > 0.38 && banda <= 0.42) || (banda >= 0.5 && banda < 0.54)) {
        if (tramado(x, y) < 0.5) c = CUARTO_DE_NOCHE.reflejoSuave;
      }
      const p = (y * imagen.ancho + x) * 4;
      d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
    }
  }
}

/**
 * Lo que la ventana encendida derrama: un halo cálido en la pared alrededor del marco y un trapecio en el andén, en cuatro
 * escalones tramados (el estilo de las luces de las salas). Se suma con la luz de la ventana.
 */
function derrameDe(vidrio: Vidrio, ancho: number, alto: number): Imagen {
  const rgba = new Uint8ClampedArray(ancho * alto * 4);
  const cx = vidrio.x + vidrio.w / 2, cy = vidrio.y + vidrio.h / 2;
  const color = [92, 58, 22];
  const poner = (x: number, y: number, fuerza: number) => {
    if (x < 0 || y < 0 || x >= ancho || y >= alto || fuerza <= 0) return;
    // El halo es la luz que SALE por la ventana: cae en la pared y el andén, nunca encima del propio cristal (aclararía las
    // siluetas, que deben quedar negras a contraluz).
    const i = x - vidrio.x, j = y - vidrio.y;
    if (i >= 0 && j >= 0 && i < vidrio.w && j < vidrio.h && vidrio.mascara[j * vidrio.w + i]) return;
    const nivel = Math.min(4, Math.floor(fuerza * 4 + tramado(x, y)));
    if (!nivel) return;
    const p = (y * ancho + x) * 4;
    for (let k = 0; k < 3; k++) rgba[p + k] = Math.max(rgba[p + k], (color[k] * nivel) >> 2);
    rgba[p + 3] = 255;
  };
  // Halo en la pared: elipse ancha alrededor del marco.
  const rx = vidrio.w * 0.95, ry = vidrio.h * 0.95;
  for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(SEAM, cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      poner(x, y, (1 - e) * 0.55);
    }
  }
  // El trapecio de luz en el andén, desde la base de la pared hacia la cámara, abriéndose y apagándose.
  const largo = 64;
  for (let j = 0; j < largo; j++) {
    const y = SEAM + 4 + j, abre = vidrio.w * (0.55 + j / largo * 0.6);
    for (let x = Math.floor(cx - abre / 2); x < cx + abre / 2; x++) {
      const lado = 1 - Math.abs(x - cx) / (abre / 2);
      poner(x, y, Math.min(1, lado * 1.6) * (1 - j / largo) * 0.6);
    }
  }
  return { ancho, alto, rgba };
}

/** Compone un decorado con las imágenes ya cargadas. Lanza si el manifiesto no permite planearlo. */
export function pintarDecorado(clave: ClaveDeDecorado, manifiesto: ManifiestoDePiezas, imagenes: Imagenes): DecoradoPintado {
  const { salas, momento } = partes(clave);
  const losPlanes = planes(clave, manifiesto);
  const capas = losPlanes.map((_, n) => calcularLuz(salas[n], manifiesto.piezas, { momento }));
  const tarde = clave === 'calle:tarde';
  const ancho = losPlanes.reduce((total, plan) => total + plan.ancho, 0);
  const cielo = tarde ? new Uint8Array(ancho * TOP) : null;
  let xDeSala = 0;
  const escenas = losPlanes.map((plan, n) => {
    const escena = componerSala(plan, imagenes, capas[n], [], null,
      cielo ? fondo => marcarCielo(fondo, cielo, ancho, xDeSala) : undefined);
    xDeSala += plan.ancho;
    return escena;
  });
  const luces = losPlanes.map((plan, n): Imagen => ({ ancho: plan.ancho, alto: plan.alto, rgba: capas[n].ambiente }));
  const imagen = unirEnFila(escenas);
  const ambiente = unirEnFila(luces).rgba as Uint8ClampedArray;
  if (cielo) gradoDeTarde(imagen, cielo);
  const calle = clave.startsWith('calle');
  const vidrio = calle ? vidrioDe(losPlanes[0], imagenes, VENTANA_DE_LA_CASA) : null;
  if (calle && momento === 'noche') {
    // Todas las ventanas de las fachadas, por fuera: cuartos en penumbra (la de la casa se enciende encima, en el lienzo).
    let x0 = 0;
    losPlanes.forEach((plan, n) => {
      for (const pieza of salas[n].estructura.piezas ?? []) {
        if (pieza.tipo !== 'ventana' || !pieza.id) continue;
        const v = vidrioDe(plan, imagenes, pieza.id);
        if (v) vidrioDeNoche(imagen, { ...v, x: v.x + x0 });
      }
      x0 += plan.ancho;
    });
  }
  return {
    clave,
    ancho: imagen.ancho,
    alto: imagen.alto,
    imagen,
    ambiente,
    grado: tarde ? GRADO_DE_TARDE : SIN_GRADO,
    vidrio,
    derrame: vidrio && momento === 'noche' ? derrameDe(vidrio, imagen.ancho, imagen.alto) : null,
  };
}

/** El color de la luz en un punto del decorado (lo que multiplica a quien pisa ahí), con el grado de la hora. */
export function luzEn(decorado: Pick<DecoradoPintado, 'ancho' | 'alto' | 'ambiente' | 'grado'>, x: number, y: number): [number, number, number] {
  const px = Math.min(decorado.ancho - 1, Math.max(0, Math.round(x)));
  const py = Math.min(decorado.alto - 1, Math.max(0, Math.round(y)));
  const p = (py * decorado.ancho + px) * 4, a = decorado.ambiente;
  return [0, 1, 2].map(k => (a[p + k] * decorado.grado[k]) >> 8) as [number, number, number];
}
