/**
 * Luz de una sala por piezas, calculada en el cliente desde su estructura con aritmética entera.
 *
 *     calcularLuz(sala, catalogo, { momento, abiertas, cuerpos, todoEnSombra }) -> { ambiente, brillo }
 *
 * `ambiente` se MULTIPLICA sobre la escena y `brillo` se SUMA. Es el espejo de `tools/escenarios/piezas_luz.py` y debe dar
 * los mismos píxeles: lo comprueba `scripts/world-art/salas-luz.test.mjs` contra la referencia congelada de P1. Por eso cada
 * operación repite la de Python, en su mismo orden y con división de piso; no hay que «simplificar» una fórmula sin volver
 * a correr esa prueba. Las reglas del porte están en `biblioteca/piezas/luz/LEEME.md`.
 *
 * - 8 escalones de 0,07 entre 0,44 y 1,00, penumbra 0,79 (0,58 de noche), tramado Bayer 4×4.
 * - De día cada ventana proyecta un haz sobre el piso y un halo en su muro; de noche deja entrar la luna (poca y fría) y la
 *   luz sale de las lámparas. Varias luces se combinan con el máximo ANTES de cuantizar.
 * - La puerta abierta del muro del fondo deja caer una cuña de luz de la sala vecina; la cerrada con vidrio se refleja en
 *   el piso pulido.
 * - `cuerpos`: muebles y personas sobre el piso. Cada uno arroja su SILUETA (el alfa de su dibujo) tendida en el piso con la
 *   matriz entera de la fuente que más luz le da en su apoyo; dentro de la sombra cada fuente pierde su parte y el piso
 *   baja un escalón. Sin fuente que mande, la sombra es cenital: corta y hacia la cámara.
 * - Quien camina no se calcula aquí: `matrizDeCuerpo` y `sombraDeCuerpo` dan su sombra y `capasEnSombra()` la luz que hay
 *   dentro de ella en todo el piso («La sombra de quien camina» en el LEEME).
 *
 * Sin dependencias y con sintaxis borrable: lo cargan el navegador y las pruebas en Node.
 */
import { luzDePieza, encendidaForzada, vanoDePuerta } from './catalogo';
import type { CatalogoDeLuz, FormaDeVentana, SalaPorPiezas } from './catalogo';
import { ALTO, FONDO, MARGEN, SEAM, TOP, borde, laterales, limites } from './geometria';
import type { Momento } from './geometria';

/** 1,00 de luz. */
const U = 10000;
const MINIMO = 4400;
const PASO = 700;
const NIVELES = 8;
const PENUMBRA = 7900;
const PENUMBRA_NOCHE = 5800;
const EXTERIOR = 9300;
const EXTERIOR_NOCHE = 5100;
/** 1,0 en las mezclas. */
const UNO = 1024;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
type Clase = 'haz' | 'pozo' | 'tubo';
/** De la luz de cada fuente, lo que se pierde dentro de una sombra (3/4; del tubo, 3/8). */
const EN_SOMBRA: Record<Clase, number> = { haz: 768, pozo: 768, tubo: 384 };
/** Escalones que además baja la luz dentro de una sombra (bajo techo; al sol). */
const SOMBRA_PROPIA = 1;
const SOMBRA_AL_SOL = 2;
/** px del piso al tubo de techo: su sombra es corta y cae casi debajo. */
const ALTURA_TUBO = 360;
/** Largo máximo de la sombra de una lámpara, en octavos del alto del cuerpo. */
const TOPE_SOMBRA = { pozo: 12, tubo: 3 };
/** fuerza × mancha que una fuente debe dar en el apoyo de un cuerpo para mandar su sombra. */
const UMBRAL_DOMINIO = 12800;
/** Sin fuente que mande: sombra corta hacia la cámara (dirección 4, 3/8 del alto). */
const CENITAL: readonly [number, number] = [4, 3];
/** Matriz (a, b, c, d) de la sombra bajo el haz de una ventana (o el sol), y (seno, coseno) de ese haz sobre el piso. */
const MATRIZ_HAZ: Record<'fondo' | 'izquierda' | 'derecha', Matriz> = {
  fondo: [60, 28, -11, 40], izquierda: [36, 48, -27, 16], derecha: [36, -48, 27, 16],
};
const SENOS_HAZ: Record<'fondo' | 'izquierda' | 'derecha', readonly [number, number]> = {
  fondo: [60, 21], izquierda: [36, 53], derecha: [36, 53],
};
/** Las 16 direcciones de las lámparas, de 22,5° en 22,5° desde la derecha y girando hacia la cámara: (Dx, Dy, Px, Py) en 64avos. */
const DIRECCIONES: readonly (readonly [number, number, number, number])[] = [
  [64, 0, 0, 32], [59, 12, 24, -30], [45, 23, 45, -23], [24, 30, 59, -12], [0, 32, 64, 0], [-24, 30, 59, 12],
  [-45, 23, 45, 23], [-59, 12, 24, 30], [-64, 0, 0, 32], [-59, -12, 24, -30], [-45, -23, 45, -23], [-24, -30, 59, -12],
  [0, -32, 64, 0], [24, -30, 59, 12], [45, -23, 45, 23], [59, -12, 24, 30],
];
/** Pisos que devuelven la luz, y cuánto de la luz de una fuente devuelven al brillo. */
const PULIDOS = ['vinilo', 'baldosa', 'damero'];
const REFLEJO = 900;
/** Fuerza (de 100) con que una ventana deja entrar la luna de noche, fría. */
const LUNA = 22;
/** Fuerza con que el vidrio de una puerta cerrada del fondo se refleja en el piso pulido. */
const VIDRIADAS: Record<string, number> = { corrediza: 80, vidrio: 70, urgencias: 40, 'madera-ventanilla': 30 };
/** Escalones que baja la luz en el centro de una sombra de contacto. */
const CONTACTO = 2;
/** px que mide como mucho la sombra que arroja una lámpara. */
const SOMBRA_MAXIMA = 72;
/** Escalones de luz por debajo de los cuales nada brilla. */
const UMBRAL_REFLEJO = 4;

/** Las constantes del motor, para comprobarlas contra las que publica el manifiesto (`luz`). */
export const CONSTANTES_DE_LUZ = {
  unidad: U, minimo: MINIMO, paso: PASO, niveles: NIVELES, uno: UNO,
  penumbra: { dia: PENUMBRA, noche: PENUMBRA_NOCHE, exteriorDia: EXTERIOR, exteriorNoche: EXTERIOR_NOCHE },
  bayer: [BAYER.slice(0, 4), BAYER.slice(4, 8), BAYER.slice(8, 12), BAYER.slice(12, 16)],
  enSombra: EN_SOMBRA, sombraPropia: SOMBRA_PROPIA, sombraAlSol: SOMBRA_AL_SOL, alturaTubo: ALTURA_TUBO,
  topeSombra: TOPE_SOMBRA, umbralDominio: UMBRAL_DOMINIO, cenital: CENITAL, matrizHaz: MATRIZ_HAZ, senosHaz: SENOS_HAZ,
  direcciones: DIRECCIONES, sombraMaxima: SOMBRA_MAXIMA, pulidos: PULIDOS, reflejo: REFLEJO, luna: LUNA,
  vidriadas: VIDRIADAS, contacto: CONTACTO, umbralReflejo: UMBRAL_REFLEJO,
};

function piso(a: number, b: number): number {
  return Math.floor(a / b);
}

function raiz(n: number): number {
  return Math.floor(Math.sqrt(n));
}

function limitar(v: number, minimo: number, maximo: number): number {
  return v < minimo ? minimo : v > maximo ? maximo : v;
}

/**
 * Sombras frías y luces neutras: (r, v, a) por escalón, redondeado. De noche la sombra es más azul: el día y la noche se
 * distinguen por el tono general, no solo por lo que está encendido.
 */
function tablaAmbiente(noche = false): number[][] {
  const filas: number[][] = [];
  for (let n = 0; n <= NIVELES; n++) {
    const v = MINIMO + PASO * n;
    filas.push(noche
      ? [
        piso(255 * v * (64 + 2 * n) + 400000, 800000),
        piso(255 * v * (704 + 12 * n) + 4000000, 8000000),
        Math.min(255, piso(255 * v * (928 - 16 * n) + 4000000, 8000000)),
      ]
      : [
        piso(255 * v * (72 + n) + 400000, 800000),
        piso(255 * v * (744 + 7 * n) + 4000000, 8000000),
        Math.min(255, piso(255 * v * (88 - n) + 400000, 800000)),
      ]);
  }
  return filas;
}

function tablaBrillo(color: readonly number[]): number[][] {
  return [0, 1, 2, 3].map(n => color.map(c => piso(c * 5 * n + 50, 100)));
}

export const TABLA_AMBIENTE: number[][] = tablaAmbiente();
export const TABLA_AMBIENTE_NOCHE: number[][] = tablaAmbiente(true);
export type TonoDeReflejo = 'neutro' | 'calido' | 'frio';
/** Color que SUMA un píxel brillante según la luz que le llega: [tono][escalón de 0 a 3]. */
export const TABLA_REFLEJO: Record<TonoDeReflejo, number[][]> = {
  neutro: [[0, 0, 0], [24, 24, 22], [48, 48, 44], [76, 76, 70]],
  calido: [[0, 0, 0], [28, 23, 14], [54, 45, 28], [86, 72, 44]],
  frio: [[0, 0, 0], [16, 23, 30], [32, 46, 58], [52, 72, 92]],
};

/** Lo que suma un píxel del mapa de brillo (gris 255 vidrio, 170 metal, 85 barniz): el metal necesita un escalón más y el barniz dos. */
export function colorDeReflejo(k: number, tono: TonoDeReflejo, gris: number): number[] {
  return TABLA_REFLEJO[tono][limitar(k - (3 - piso(gris, 85)), 0, 3)];
}

export const TABLA_CALIDA: number[][] = tablaBrillo([255, 206, 140]);
export const TABLA_FRIA: number[][] = tablaBrillo([150, 200, 255]);

export interface CapasDeLuz {
  ancho: number;
  alto: number;
  /** RGBA, alfa 255. Se multiplica sobre la escena. */
  ambiente: Uint8ClampedArray<ArrayBuffer>;
  /** RGBA, alfa 255. Se suma sobre la escena. */
  brillo: Uint8ClampedArray<ArrayBuffer>;
}

/** El dibujo de un cuerpo como máscara: 1 donde es opaco (alfa ≥ 128). */
export interface Mascara {
  ancho: number;
  alto: number;
  datos: Uint8Array;
}

/**
 * Un mueble o una persona sobre el piso: su huella (`x0..y1`, para la sombra de contacto y para saber si una lámpara está
 * encima), su `alto` y, si la trae, su silueta: `mascara` (el dibujo; en los datos de la referencia, filas de texto con `#`
 * opaco y `.` transparente), su apoyo dentro del dibujo (`px`, `py`: columna del apoyo y fila siguiente a la última opaca)
 * y en la sala (`x`, `y`). Sin silueta arroja la de una caja con el ancho de su huella y su alto.
 */
export interface Cuerpo {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  alto: number;
  x?: number;
  y?: number;
  px?: number;
  py?: number;
  mascara?: Mascara | readonly string[];
}

/** Matriz (a, b, c, d) de una sombra: el píxel a `u` px del apoyo y a `h` de altura cae en (x + (a·u + b·h)/64, y + (c·u + d·h)/64). */
export type Matriz = readonly [number, number, number, number];

/** Huella y altura de algo apoyado en (x, y), el centro de su base, a partir del tamaño de su sprite. */
export function cuerpo(x: number, y: number, ancho: number, alto: number, persona = false): Cuerpo {
  if (persona) return { x0: x - 9, x1: x + 9, y0: y - 10, y1: y, alto: 60 };
  const fondo = Math.max(8, Math.min(16, piso(ancho, 5)));
  return { x0: x - piso(ancho, 2) + 2, x1: x + piso(ancho, 2) - 2, y0: y - fondo, y1: y, alto: Math.max(8, alto - piso(fondo, 2)) };
}

/**
 * El cuerpo de un dibujo de `ancho × alto` (su alfa, de 0 a 255) puesto con su esquina en (x, y): su silueta es el alfa desde
 * 128. `pie` es el punto del piso donde se apoya una persona; un mueble se apoya en el centro de su base. El apoyo de la
 * sombra queda en la fila siguiente a la última opaca (`piezas_luz.cuerpo_de`).
 */
export function cuerpoDe(alfa: ArrayLike<number>, ancho: number, alto: number, x: number, y: number, pie?: readonly [number, number]): Cuerpo {
  const datos = new Uint8Array(ancho * alto);
  let primera = -1, ultima = -1;
  for (let f = 0; f < alto; f++) {
    for (let col = 0; col < ancho; col++) {
      if (alfa[f * ancho + col] >= 128) {
        datos[f * ancho + col] = 1;
        if (primera < 0) primera = f;
        ultima = f;
      }
    }
  }
  const c = pie ? cuerpo(pie[0], pie[1], ancho, alto, true) : cuerpo(x + piso(ancho, 2), y + alto, ancho, alto);
  if (ultima < 0) return c;
  const px = pie ? pie[0] - x : piso(ancho, 2), py = ultima + 1;
  return { ...c, x: x + px, y: y + py, px, py, alto: py - primera, mascara: { ancho, alto, datos } };
}

interface CuerpoCompleto {
  x0: number; x1: number; y0: number; y1: number; alto: number;
  x: number; y: number; px: number; py: number;
  mascara: Mascara;
}

function mascaraDe(m: Mascara | readonly string[]): Mascara {
  if (!Array.isArray(m)) return m as Mascara;
  const filas = m as readonly string[];
  const alto = filas.length, ancho = alto ? filas[0].length : 0;
  const datos = new Uint8Array(ancho * alto);
  filas.forEach((fila, f) => { for (let col = 0; col < ancho; col++) if (fila[col] === '#') datos[f * ancho + col] = 1; });
  return { ancho, alto, datos };
}

/** El cuerpo con todo lo que pide la sombra: el que no trae silueta arroja la de su caja (`_completo`). */
function completo(c: Cuerpo): CuerpoCompleto {
  if (c.mascara && c.x !== undefined && c.y !== undefined && c.px !== undefined && c.py !== undefined) {
    return { x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, alto: c.alto, x: c.x, y: c.y, px: c.px, py: c.py, mascara: mascaraDe(c.mascara) };
  }
  const ancho = Math.max(c.x1 - c.x0, 1);
  return {
    x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, alto: c.alto,
    x: piso(c.x0 + c.x1, 2), y: c.y1, px: piso(ancho, 2), py: c.alto,
    mascara: { ancho, alto: c.alto, datos: new Uint8Array(ancho * c.alto).fill(1) },
  };
}

/**
 * Índice (0 a 15) de la dirección (dx, dy) del piso, de 22,5° en 22,5° desde la derecha y girando hacia la cámara. Solo
 * compara enteros: las tangentes de 11,25°, 33,75°, 56,25° y 78,75° van en 256avos (51, 171, 383, 1287).
 */
export function direccion(dx: number, dy: number): number {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const q = ay * 256 <= ax * 51 ? 0 : ay * 256 <= ax * 171 ? 1 : ay * 256 <= ax * 383 ? 2 : ay * 256 <= ax * 1287 ? 3 : 4;
  if (dy >= 0) return dx >= 0 ? q : 8 - q;
  return dx >= 0 ? (16 - q) % 16 : 8 + q;
}

/** Matriz de la dirección i con una sombra de k8 octavos del alto del cuerpo. */
export function matrizDe(i: number, k8: number): Matriz {
  const [dx, dy, px, py] = DIRECCIONES[i];
  return [px, piso(dx * k8, 8), py, piso(dy * k8, 8)];
}

/** La matriz con el ancho del cuerpo como se ve desde la fuente: de frente se ve su ancho; de lado, su fondo. */
function vistaDesde(c: CuerpoCompleto, m: Matriz, seno: number, coseno: number): Matriz {
  const ancho = Math.max(c.x1 - c.x0, 1);
  const s = Math.min(Math.max(piso(ancho * seno + 2 * (c.y1 - c.y0) * coseno, ancho), 8), 64);
  return [piso(m[0] * s, 64), m[1], piso(m[2] * s, 64), m[3]];
}

export interface OpcionesDeLuz {
  /** Por omisión, el de la estructura. */
  momento?: Momento;
  /** Muebles y personas quietas que arrojan sombra. */
  cuerpos?: readonly Cuerpo[];
}

export interface Rectangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** La sombra tendida de un cuerpo: una máscara (1 = en sombra) del rectángulo que la contiene. */
export interface SombraTendida extends Rectangulo {
  datos: Uint8Array;
}

/** Lo que un cuerpo puede tapar: haces, pozos y tubos, con su mancha sobre el piso (0 a 1024). */
interface Fuente {
  clase: Clase;
  mancha: Uint16Array;
  fuerza: number;
  tono: 'calido' | 'frio';
  color: number;
  muro?: 'fondo' | 'izquierda' | 'derecha';
  punto?: readonly [number, number, number];
}

/** Halos, franjas y cuñas (nadie las tapa) y reflejos del piso pulido. */
interface Fija {
  mancha: Uint16Array;
  fuerza: number;
  tono: 'calido' | 'frio';
  peso: number;
  color: number;
}

interface Reflejo {
  mancha: Uint16Array;
  fuerza: number;
  tono: 'calido' | 'frio';
}

/** Rectángulo [x0, x1) × [y0, y1) donde una mancha no es cero (vacío si x0 >= x1). */
interface Caja { x0: number; y0: number; x1: number; y1: number }

const cajas = new WeakMap<Uint16Array, Caja>();

/** La caja de una mancha, medida una vez: fuera de ella vale 0 y bajo techo no cambia nada (L ya parte de la base). */
function cajaDe(m: Uint16Array, ancho: number): Caja {
  const guardada = cajas.get(m);
  if (guardada) return guardada;
  let x0 = ancho, y0 = ALTO, x1 = 0, y1 = 0;
  for (let y = 0; y < ALTO; y++) {
    const fila = y * ancho;
    for (let x = 0; x < ancho; x++) {
      if (!m[fila + x]) continue;
      if (x < x0) x0 = x;
      if (x >= x1) x1 = x + 1;
      if (y < y0) y0 = y;
      y1 = y + 1;
    }
  }
  const caja = { x0, y0, x1, y1 };
  cajas.set(m, caja);
  return caja;
}

interface Crudo {
  L: Int32Array;
  calido: Int32Array;
  frio: Int32Array;
}

/** Lo calculado para una máscara de sombra: las capas, los escalones y la luz antes del contacto (para `reflejoEn`). */
interface Resultado {
  capas: CapasDeLuz;
  niveles: Uint8Array;
  crudo: Crudo;
  sombra: Uint8Array | null;
}

function cruce(a: Caja, b: Caja): Caja {
  return { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
}

function union(a: Caja | null, b: Caja): Caja {
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return a ?? b;
  if (!a || a.x0 >= a.x1) return b;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

/**
 * La luz de una sala en un momento: las capas normales, las de «todo en sombra» (para quien camina) y la sombra de un
 * cuerpo cualquiera con la matriz de la fuente que manda donde pisa. Abrir o cerrar una puerta rehace la luz.
 */
export class LuzDeSala {
  readonly ancho: number;
  readonly alto = ALTO;
  readonly momento: Momento;
  private readonly sala: SalaPorPiezas;
  private readonly catalogo: CatalogoDeLuz;
  private readonly cuerpos: CuerpoCompleto[];
  private readonly izq: boolean;
  private readonly der: boolean;
  private readonly exterior: boolean;
  private readonly sol: boolean;
  private readonly base: number;
  private readonly pulido: boolean;
  private readonly xl: number;
  private readonly xr: number;
  private readonly cx: number;
  private readonly n: Int32Array;
  private readonly jl: Int32Array;
  private readonly jr: Int32Array;
  private readonly esPiso: Uint8Array;
  private readonly esMuro: Uint8Array;
  private abiertas: readonly string[] = [];
  private fuentes: Fuente[] = [];
  private fijas: Fija[] = [];
  private brillos: Reflejo[] = [];
  private normales: Resultado | null = null;
  private enSombra: Resultado | null = null;

  constructor(sala: SalaPorPiezas, catalogo: CatalogoDeLuz, opciones: OpcionesDeLuz = {}) {
    const est = sala.estructura;
    this.sala = sala;
    this.catalogo = catalogo;
    this.ancho = est.ancho;
    this.momento = opciones.momento ?? est.momento ?? 'dia';
    const [izq, der] = laterales(sala.encuadre);
    this.izq = izq;
    this.der = der;
    const b = borde(this.ancho);
    [this.xl, this.xr] = limites(sala.encuadre, this.ancho);
    this.cx = piso(this.ancho, 2);
    this.exterior = est.exterior === true;
    this.sol = this.exterior && this.momento === 'dia';
    this.base = this.exterior ? (this.momento === 'dia' ? EXTERIOR : EXTERIOR_NOCHE) : (this.momento === 'dia' ? PENUMBRA : PENUMBRA_NOCHE);
    this.pulido = PULIDOS.includes(est.acabados?.piso ?? '');
    this.n = new Int32Array(ALTO);
    this.jl = new Int32Array(ALTO);
    this.jr = new Int32Array(ALTO);
    for (let y = 0; y < ALTO; y++) {
      this.n[y] = limitar(y - SEAM, 0, FONDO);
      this.jl[y] = b - piso(this.n[y] * (b - MARGEN), FONDO);
      this.jr[y] = this.ancho - this.jl[y];
    }
    const w = this.ancho;
    this.esPiso = new Uint8Array(w * ALTO);
    this.esMuro = new Uint8Array(w * ALTO);
    for (let y = 0; y < ALTO; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (y >= SEAM && (!izq || x >= this.jl[y]) && (!der || x <= this.jr[y])) this.esPiso[i] = 1;
        if (y >= TOP && y < SEAM && x >= this.xl && x < this.xr) this.esMuro[i] = 1;
      }
    }
    this.cuerpos = (opciones.cuerpos ?? []).map(completo);
    this.armarFuentes();
  }

  /** Las capas de luz de la sala, con los cuerpos quietos y sus sombras. */
  capas(): CapasDeLuz {
    return this.resultadoNormal().capas;
  }

  /** Las capas como quedan DENTRO de una sombra en todo el piso (`todo_en_sombra`): para la sombra de quien camina. */
  capasEnSombra(): CapasDeLuz {
    if (!this.enSombra) this.enSombra = this.calcular(this.esPiso, this.toda());
    return this.enSombra.capas;
  }

  /** Escalones por píxel, para las pruebas: nivel de ambiente (bits 0-3), cálido (bits 4-5) y frío (bits 6-7). */
  escalones(): Uint8Array {
    return this.resultadoNormal().niveles;
  }

  /**
   * Cuánta luz le llega en (x, y) a lo que brilla (k de 0 a 3) y de qué tono: se mide sobre la luz de las fuentes con las
   * sombras de los cuerpos, antes de las de contacto y de rincón y sin tramado (`piezas_luz.reflejos`).
   */
  reflejoEn(x: number, y: number): { k: number; tono: TonoDeReflejo } {
    const { crudo } = this.resultadoNormal();
    const px = limitar(Math.trunc(x), 0, this.ancho - 1), py = limitar(Math.trunc(y), 0, ALTO - 1);
    const i = py * this.ancho + px;
    const k = limitar(piso(crudo.L[i] - MINIMO, PASO) - UMBRAL_REFLEJO, 0, 3);
    const c = crudo.calido[i], f = crudo.frio[i];
    return { k, tono: f > c && f >= 128 ? 'frio' : c >= 128 ? 'calido' : 'neutro' };
  }

  /**
   * Deja abiertas exactamente esas puertas y rehace la luz donde cambia: la cuña y los reflejos de las puertas que se
   * abrieron o se cerraron (cada paso del cálculo es de un píxel, así que basta ese rectángulo). Devuelve el rectángulo
   * que cambió, o null.
   */
  abrir(ids: readonly string[]): Rectangulo | null {
    const antes = new Set(this.abiertas), ahora = new Set(ids);
    const cambian = (this.sala.puertas ?? []).filter(p => antes.has(p.id) !== ahora.has(p.id));
    this.abiertas = [...ids];
    if (cambian.length === 0) return null;
    let zona: Caja | null = null;
    for (const p of cambian) {
      for (const m of [...this.manchasDePuerta(p, true), ...this.manchasDePuerta(p, false)]) {
        if (m) zona = union(zona, cajaDe(m, this.ancho));
      }
    }
    this.armarFuentes();
    if (!zona || zona.x0 >= zona.x1) return null;
    // Al sol el máximo con la base levanta toda la sombra corta del muro: cualquier luz nueva cambia la sala entera.
    if (this.sol) zona = this.toda();
    if (this.normales) this.calcular(this.normales.sombra, zona, this.normales);
    if (this.enSombra) this.calcular(this.esPiso, zona, this.enSombra);
    return { x: zona.x0, y: zona.y0, w: zona.x1 - zona.x0, h: zona.y1 - zona.y0 };
  }

  /**
   * La matriz de la sombra de un cuerpo: la de la fuente que más luz le da en su apoyo (fuerza × mancha, desde el umbral).
   * Al sol manda el sol; si no manda ninguna, la cenital (`_matriz_del_cuerpo`).
   */
  matrizDeCuerpo(c: Cuerpo): Matriz {
    const k = completo(c);
    if (this.sol) return vistaDesde(k, MATRIZ_HAZ.fondo, ...SENOS_HAZ.fondo);
    const x = limitar(k.x, 0, this.ancho - 1), y = limitar(k.y, SEAM, ALTO - 1);
    const i = y * this.ancho + x;
    let mejor = UMBRAL_DOMINIO - 1;
    let manda: Fuente | null = null;
    for (const f of this.fuentes) {
      if (f.clase !== 'haz' && f.punto) {
        const [lx, ly] = f.punto;
        if (k.x0 - 8 <= lx && lx <= k.x1 + 8 && k.y0 - 8 <= ly && ly <= k.y1 + 8) continue;   // la lámpara está encima
      }
      const aporte = f.fuerza * f.mancha[i];
      if (aporte > mejor) {
        mejor = aporte;
        manda = f;
      }
    }
    let [dir, k8] = CENITAL;
    if (manda && manda.clase === 'haz' && manda.muro) return vistaDesde(k, MATRIZ_HAZ[manda.muro], ...SENOS_HAZ[manda.muro]);
    if (manda && manda.punto) {
      const [lx, ly, altura] = manda.punto;
      const dx = k.x - lx, dy = k.y - ly;
      const n = raiz(dx * dx + dy * dy);
      if (n >= 4) {
        const tope = Math.max(2, Math.min(TOPE_SOMBRA[manda.clase as 'pozo' | 'tubo'], piso(SOMBRA_MAXIMA * 8, Math.max(k.alto, 1))));
        dir = direccion(dx, 2 * dy);
        k8 = Math.min(Math.max(piso(n * 8, Math.max(altura - k.alto, 16)), 2), tope);
      }
    }
    return vistaDesde(k, matrizDe(dir, k8), 2 * Math.abs(DIRECCIONES[dir][1]), Math.abs(DIRECCIONES[dir][0]));
  }

  /**
   * La sombra de un cuerpo (quien camina), como la de los quietos: su silueta tendida con `matriz`, el borde tramado al
   * 50 %, recortada al piso y sin cubrir su propio dibujo. Lo que se dibuje delante la tapa (lo resuelve quien la pinta).
   */
  sombraDeCuerpo(c: Cuerpo, matriz: Matriz = this.matrizDeCuerpo(c)): SombraTendida | null {
    const k = completo(c);
    const caja = this.cajaDeSilueta(k, matriz);
    if (!caja) return null;
    const x0 = Math.max(caja.x0 - 1, 0), y0 = Math.max(caja.y0 - 1, 0);
    const x1 = Math.min(caja.x1 + 1, this.ancho), y1 = Math.min(caja.y1 + 1, ALTO);
    const w = x1 - x0, h = y1 - y0;
    const silueta = new Uint8Array(w * h);
    this.tender(k, matriz, caja, (x, y) => { silueta[(y - y0) * w + (x - x0)] = 1; });
    const datos = new Uint8Array(w * h);
    let alguna = false;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const j = (y - y0) * w + (x - x0);
        let en = silueta[j] === 1;
        if (!en && BAYER[(y & 3) * 4 + (x & 3)] < 8) {
          en = (y > y0 && silueta[j - w] === 1) || (y < y1 - 1 && silueta[j + w] === 1)
            || (x > x0 && silueta[j - 1] === 1) || (x < x1 - 1 && silueta[j + 1] === 1);
        }
        if (en && this.esPiso[y * this.ancho + x] && !this.tapaElDibujo(k, x, y)) {
          datos[j] = 1;
          alguna = true;
        }
      }
    }
    return alguna ? { x: x0, y: y0, w, h, datos } : null;
  }

  // ── fuentes (`_fuentes`) ─────────────────────────────────────────────────────

  private armarFuentes(): void {
    const fuentes: Fuente[] = [], fijas: Fija[] = [], brillos: Reflejo[] = [];
    for (const pieza of this.sala.estructura.piezas ?? []) {
      const luz = luzDePieza(this.catalogo, pieza.tipo, pieza.modelo);
      const modo = encendidaForzada(pieza);
      if (!luz || modo === false) continue;
      let tono = luz.tono, fuerza: number;
      if (luz.forma === 'haz' && this.momento === 'noche') {
        // De noche la ventana deja entrar la luna: poca luz y fría, con la misma forma del haz.
        tono = 'frio';
        fuerza = LUNA;
      } else {
        const propia = luz.momento === this.momento;
        if (!propia && modo !== true) continue;
        fuerza = piso(luz.fuerza * (propia ? 100 : 60), 100);
      }
      const muro = pieza.muro;
      if (luz.forma === 'haz') {
        if (this.exterior || pieza.pos === undefined) continue;
        if (muro === 'fondo') {
          const x0 = this.xl + pieza.pos - piso(luz.ancho, 2);
          const [suelo, halo] = this.hazFondo(x0, luz.ancho, SEAM - luz.antepecho - luz.alto, luz.alto, luz.parteluces);
          fuentes.push({ clase: 'haz', mancha: suelo, fuerza, tono, color: UNO, muro: 'fondo' });
          fijas.push({ mancha: halo, fuerza, tono, peso: piso(UNO * 2, 3), color: piso(UNO, 2) });
          brillos.push({ mancha: this.reflejoPiso(x0, x0 + luz.ancho, 110), fuerza, tono });
        } else if ((muro === 'izquierda' && this.izq) || (muro === 'derecha' && this.der)) {
          fuentes.push({ clase: 'haz', mancha: this.hazLado(muro, SEAM + pieza.pos, luz.ancho, luz.parteluces), fuerza, tono, color: UNO, muro });
        }
        continue;
      }
      const tubo = luz.forma === 'tubo';
      let x: number, y: number;
      if (pieza.x !== undefined && pieza.y !== undefined) {
        x = pieza.x;
        y = pieza.y;
      } else if (muro === 'fondo' && pieza.pos !== undefined) {
        x = this.xl + pieza.pos;
        y = SEAM + (tubo ? 120 : 64);
      } else {
        continue;
      }
      const [rx, ry] = luz.radio;
      const altura = tubo ? ALTURA_TUBO : luz.altura + (pieza.sobre ?? 0);
      fuentes.push({ clase: tubo ? 'tubo' : 'pozo', mancha: this.pozo(x, y, rx, ry), fuerza, tono, color: piso(UNO * 9, 10), punto: [x, y, altura] });
      if (muro === 'fondo' && pieza.x === undefined) {
        const medio = tubo ? 26 : 14;
        brillos.push({ mancha: this.reflejoPiso(x - medio, x + medio, 90), fuerza, tono });
      }
      if (tubo) fijas.push({ mancha: this.franjaDeTubo(x), fuerza, tono, peso: piso(UNO * 8, 10), color: piso(UNO, 2) });
      else fijas.push({ mancha: this.haloMuro(x, SEAM - 36, 96), fuerza, tono, peso: piso(UNO, 2), color: piso(UNO * 4, 10) });
    }
    for (const puerta of this.sala.puertas ?? []) {
      const abierta = this.abiertas.includes(puerta.id);
      const [cuna, reflejo] = this.manchasDePuerta(puerta, abierta);
      if (!abierta) {
        // Cerrada, su vidrio deja pasar algo de la luz de la sala vecina: el piso pulido la devuelve al pie.
        if (reflejo) brillos.push({ mancha: reflejo, fuerza: VIDRIADAS[puerta.modelo], tono: 'frio' });
        continue;
      }
      if (!cuna || !reflejo) continue;
      fijas.push({
        mancha: cuna, fuerza: 100, tono: 'calido',
        peso: this.momento === 'dia' ? piso(UNO * 2, 3) : piso(UNO * 4, 10), color: piso(UNO * 4, 10),
      });
      brillos.push({ mancha: reflejo, fuerza: 100, tono: 'calido' });
    }
    this.fuentes = fuentes;
    this.fijas = fijas;
    this.brillos = brillos;
  }

  private readonly manchasGuardadas = new Map<string, Uint16Array[]>();

  /**
   * Las manchas de una puerta del muro del fondo: abierta, [cuña, reflejo al pie]; cerrada, [null, reflejo de su vidrio]
   * si su modelo es de los vidriados. [null, null] si no es del fondo o su modelo no está en el catálogo. Se guardan.
   */
  private manchasDePuerta(puerta: { id: string; muro: string; pos: number; modelo: string }, abierta: boolean): [Uint16Array | null, Uint16Array | null] {
    const ancho = puerta.muro === 'fondo' ? vanoDePuerta(this.catalogo, puerta.modelo) : null;
    if (ancho === null) return [null, null];
    const vano = piso(ancho, 2) - 6, eje = this.xl + puerta.pos;
    const clave = `${puerta.id}|${abierta ? 1 : 0}`;
    let guardadas = this.manchasGuardadas.get(clave);
    if (!guardadas) {
      guardadas = abierta
        ? [this.cuna(eje, vano), this.reflejoPiso(eje - vano, eje + vano, 60)]
        : VIDRIADAS[puerta.modelo] ? [this.reflejoPiso(eje - vano, eje + vano, 70)] : [];
      this.manchasGuardadas.set(clave, guardadas);
    }
    return abierta ? [guardadas[0] ?? null, guardadas[1] ?? null] : [null, guardadas[0] ?? null];
  }

  /** Ventana del muro del fondo: (luz sobre el piso, halo sobre el muro), de 0 a 1024, con la forma de la ventana. */
  private hazFondo(x0: number, ancho: number, y0: number, alto: number, forma: FormaDeVentana): [Uint16Array, Uint16Array] {
    const w = this.ancho, cx = this.cx;
    const suelo = new Uint16Array(w * ALTO), halo = new Uint16Array(w * ALTO);
    const n0 = piso(15 * FONDO, 1000), n1 = piso(740 * FONDO, 1000);
    const verticales = forma.verticales ?? [], horizontales = forma.horizontales ?? [];
    for (let y = SEAM; y < ALTO; y++) {
      const n = this.n[y];
      const esc = 16 * FONDO + 3 * n;
      const xi = cx + piso((x0 - 8 - cx) * esc, 16 * FONDO) + piso(170 * n, FONDO);
      const xd = cx + piso((x0 + ancho + 8 - cx) * esc, 16 * FONDO) + piso(250 * n, FONDO);
      const t = piso(n * 1000, FONDO);
      const largo = Math.min(piso((t - 15) * 700, 1000), piso((740 - t) * 500, 1000));
      let lamaFila = false;
      if (forma.lamas) {
        const [desde, hasta, paso] = forma.lamas;
        const na = n0 + piso((n1 - n0) * desde, UNO), nb = n0 + piso((n1 - n0) * hasta, UNO);
        lamaFila = n >= na && n <= nb && (n - na) % paso < piso(paso, 2);
      }
      let travesanos = 0;   // cada travesaño que pasa por esta fila deja la luz al 35 %, uno tras otro
      for (const f of horizontales) if (Math.abs(n - (n0 + piso((n1 - n0) * f, UNO))) * 2 < 5 + piso(4 * t, 1000)) travesanos++;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!this.esPiso[i]) continue;
        const dentro = Math.min(Math.min(x - xi, xd - x), largo);
        let luz = limitar(dentro * 64, 0, UNO);
        if (!luz) continue;
        for (const f of verticales) if (Math.abs(x - (xi + piso((xd - xi) * f, UNO))) * 2 < 6 + piso(10 * t, 1000)) luz = piso(luz * 35, 100);
        for (let k = 0; k < travesanos; k++) luz = piso(luz * 35, 100);
        if (lamaFila) luz = piso(luz * 35, 100);
        suelo[i] = luz;
      }
    }
    for (let y = TOP; y < SEAM; y++) {
      const dy = Math.max(Math.max(y0 - y, y - (y0 + alto)), 0);
      for (let x = this.xl; x < this.xr; x++) {
        const dx = Math.max(Math.max(x0 - x, x - (x0 + ancho)), 0);
        halo[y * w + x] = limitar(UNO - piso(raiz(dx * dx + dy * dy) * UNO, 46), 0, UNO);
      }
    }
    return [suelo, halo];
  }

  /** Ventana de un muro lateral: la luz cruza el piso y baja hacia la cámara mientras se aleja del muro. */
  private hazLado(lado: 'izquierda' | 'derecha', yc: number, ancho: number, forma: FormaDeVentana): Uint16Array {
    const w = this.ancho, luzes = new Uint16Array(w * ALTO);
    const medio = piso(ancho, 2) + 4;
    const verticales = forma.verticales ?? [], horizontales = forma.horizontales ?? [];
    const lamas = forma.lamas ? [40 + piso(300 * forma.lamas[0], UNO), 40 + piso(300 * forma.lamas[1], UNO), forma.lamas[2]] : null;
    for (let y = SEAM; y < ALTO; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!this.esPiso[i]) continue;
        const dist = lado === 'izquierda' ? x - this.jl[y] : this.jr[y] - x;
        const centro = yc + piso(dist * 35, 100);
        const dentro = Math.min(medio - Math.abs(y - centro), dist);
        const alcance = limitar(piso((460 - dist) * UNO, 180), 0, UNO);
        let luz = piso(limitar(dentro * 64, 0, UNO) * alcance, UNO);
        if (!luz) continue;
        const a = y - (centro - medio);
        for (const f of verticales) if (Math.abs(a - piso(2 * medio * f, UNO)) * 2 < 5) luz = piso(luz * 35, 100);
        for (const f of horizontales) if (Math.abs(dist - (40 + piso(300 * f, UNO))) * 2 < 7) luz = piso(luz * 35, 100);
        if (lamas && dist >= lamas[0] && dist <= lamas[1] && (dist - lamas[0]) % lamas[2] < piso(lamas[2], 2)) luz = piso(luz * 35, 100);
        luzes[i] = luz;
      }
    }
    return luzes;
  }

  /** Franja que un piso pulido devuelve bajo algo del muro del fondo que da luz (entre xa y xb). */
  private reflejoPiso(xa: number, xb: number, largo: number): Uint16Array {
    const w = this.ancho, cx = this.cx, m = new Uint16Array(w * ALTO);
    for (let y = SEAM; y < ALTO; y++) {
      const n = this.n[y];
      if (n < 3) continue;
      const esc = 16 * FONDO + 3 * n;
      const xi = cx + piso((xa - cx) * esc, 16 * FONDO), xd = cx + piso((xb - cx) * esc, 16 * FONDO);
      const caida = limitar(piso((largo - n) * UNO, largo), 0, UNO);
      if (!caida) continue;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!this.esPiso[i]) continue;
        const dentro = Math.min(x - xi, xd - x);
        m[i] = piso(limitar(dentro * 96 + 192, 0, UNO) * caida, UNO);
      }
    }
    return m;
  }

  private pozo(lx: number, ly: number, rx: number, ry: number): Uint16Array {
    const w = this.ancho, m = new Uint16Array(w * ALTO);
    for (let y = Math.max(SEAM, ly - ry); y < Math.min(ALTO, ly + ry + 1); y++) {
      const ey = piso(Math.abs(y - ly) * UNO, ry);
      for (let x = Math.max(0, lx - rx); x < Math.min(w, lx + rx + 1); x++) {
        const i = y * w + x;
        if (!this.esPiso[i]) continue;
        const ex = piso(Math.abs(x - lx) * UNO, rx);
        const p = limitar(UNO - raiz(ex * ex + ey * ey), 0, UNO);
        m[i] = piso(p * (3 * UNO - p), 2 * UNO);
      }
    }
    return m;
  }

  private haloMuro(hx: number, hy: number, radio: number): Uint16Array {
    const w = this.ancho, m = new Uint16Array(w * ALTO);
    for (let y = TOP; y < SEAM; y++) {
      const dy = Math.abs(y - hy);
      for (let x = this.xl; x < this.xr; x++) {
        const dx = Math.abs(x - hx);
        m[y * w + x] = limitar(UNO - piso(raiz(dx * dx + dy * dy) * UNO, radio), 0, UNO);
      }
    }
    return m;
  }

  private franjaDeTubo(tx: number): Uint16Array {
    const w = this.ancho, m = new Uint16Array(w * ALTO);
    for (let y = TOP; y < SEAM; y++) {
      for (let x = this.xl; x < this.xr; x++) m[y * w + x] = limitar(UNO - piso(Math.abs(x - tx) * UNO, 190), 0, UNO);
    }
    return m;
  }

  /** La cuña de luz que la puerta abierta del fondo deja caer en el piso. */
  private cuna(eje: number, vano: number): Uint16Array {
    const w = this.ancho, m = new Uint16Array(w * ALTO);
    for (let y = SEAM; y < ALTO; y++) {
      const n = this.n[y];
      const medio = vano + piso(n * 30, 100);
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!this.esPiso[i]) continue;
        const dentro = Math.min(medio - Math.abs(x - eje - piso(n * 12, 100)), 54 - n);
        m[i] = limitar(dentro * 64, 0, UNO);
      }
    }
    return m;
  }

  // ── sombras (`_silueta`, `_dibujo`, `_sombras`) ──────────────────────────────

  /** La caja donde puede caer la silueta tendida (ya recortada a la sala y al piso), o null si no cae nada. */
  private cajaDeSilueta(c: CuerpoCompleto, m: Matriz): { x0: number; x1: number; y0: number; y1: number } | null {
    const [a, b, cc, d] = m;
    const ancho = c.mascara.ancho;
    const xs: number[] = [], ys: number[] = [];
    for (const u of [-c.px, ancho - c.px]) {
      for (const h of [0, c.py]) {
        xs.push(piso(a * u + b * h, 64));
        ys.push(piso(cc * u + d * h, 64));
      }
    }
    const x0 = Math.max(c.x + Math.min(...xs) - 2, 0), x1 = Math.min(c.x + Math.max(...xs) + 3, this.ancho);
    const y0 = Math.max(c.y + Math.min(...ys) - 2, SEAM), y1 = Math.min(c.y + Math.max(...ys) + 3, ALTO);
    if (a * d - b * cc === 0 || x0 >= x1 || y0 >= y1) return null;
    return { x0, x1, y0, y1 };
  }

  /** Recorre la caja y marca cada píxel del piso que viene de un píxel opaco del dibujo (la matriz al revés). */
  private tender(c: CuerpoCompleto, m: Matriz, caja: { x0: number; x1: number; y0: number; y1: number }, marcar: (x: number, y: number) => void): void {
    const [a, b, cc, d] = m;
    const det = a * d - b * cc;
    const { ancho, alto, datos } = c.mascara;
    for (let y = caja.y0; y < caja.y1; y++) {
      const dy = y - c.y;
      for (let x = caja.x0; x < caja.x1; x++) {
        const dx = x - c.x;
        const u = piso((d * dx - b * dy) * 64, det);
        const h = piso((a * dy - cc * dx) * 64, det);
        const col = c.px + u, fila = c.py - 1 - h;
        if (h >= 0 && fila >= 0 && fila < alto && col >= 0 && col < ancho && datos[fila * ancho + col]) marcar(x, y);
      }
    }
  }

  private tapaElDibujo(c: CuerpoCompleto, x: number, y: number): boolean {
    const col = x - (c.x - c.px), fila = y - (c.y - c.py);
    const { ancho, alto, datos } = c.mascara;
    return col >= 0 && col < ancho && fila >= 0 && fila < alto && datos[fila * ancho + col] === 1;
  }

  /** Máscara de la sala (1 = a la sombra de algún cuerpo quieto), o null si ninguno la arroja (`_sombras`). */
  private sombrasDeLosCuerpos(): Uint8Array | null {
    const w = this.ancho;
    const sombra = new Uint8Array(w * ALTO), tapado = new Uint8Array(w * ALTO);
    let x0 = w, y0 = ALTO, x1 = 0, y1 = 0;
    for (const c of this.cuerpos) {
      const m = this.matrizDeCuerpo(c);
      const caja = this.cajaDeSilueta(c, m);
      if (caja) {
        this.tender(c, m, caja, (x, y) => { sombra[y * w + x] = 1; });
        x0 = Math.min(x0, caja.x0); y0 = Math.min(y0, caja.y0); x1 = Math.max(x1, caja.x1); y1 = Math.max(y1, caja.y1);
      }
      const dx = c.x - c.px, dy = c.y - c.py;
      for (let f = Math.max(0, -dy); f < c.mascara.alto && dy + f < ALTO; f++) {
        for (let col = Math.max(0, -dx); col < c.mascara.ancho && dx + col < w; col++) {
          if (c.mascara.datos[f * c.mascara.ancho + col]) tapado[(dy + f) * w + dx + col] = 1;
        }
      }
    }
    if (x0 >= x1) return null;
    const resultado = new Uint8Array(w * ALTO);
    let alguna = false;
    for (let y = Math.max(y0 - 1, 0); y < Math.min(y1 + 1, ALTO); y++) {
      for (let x = Math.max(x0 - 1, 0); x < Math.min(x1 + 1, w); x++) {
        const i = y * w + x;
        let en = sombra[i] === 1;
        if (!en && BAYER[(y & 3) * 4 + (x & 3)] < 8) {
          en = (y > 0 && sombra[i - w] === 1) || (y < ALTO - 1 && sombra[i + w] === 1)
            || (x > 0 && sombra[i - 1] === 1) || (x < w - 1 && sombra[i + 1] === 1);
        }
        if (en && this.esPiso[i] && !tapado[i]) {
          resultado[i] = 1;
          alguna = true;
        }
      }
    }
    return alguna ? resultado : null;
  }

  // ── combinar, contacto, rincones, viñeta y escalones (`niveles`) ─────────────

  private toda(): Caja {
    return { x0: 0, y0: 0, x1: this.ancho, y1: ALTO };
  }

  private resultadoNormal(): Resultado {
    if (!this.normales) this.normales = this.calcular(this.sombrasDeLosCuerpos(), this.toda());
    return this.normales;
  }

  /**
   * La luz sin cuerpos en `zona`, en los píxeles de `donde` (todos si es null); `aLaSombra`, la que queda dentro de una
   * sombra (`combinar`). Bajo techo L parte de la base y una mancha en 0 no la mueve: basta recorrer la caja de cada
   * mancha. Al sol la sombra corta del muro deja L por debajo de la base y el máximo con la base la levanta: ahí, toda.
   */
  private combinar(aLaSombra: boolean, crudo: Crudo, donde: Uint8Array | null, zona: Caja): void {
    const w = this.ancho, base = this.base, ganancia = U - base;
    const { L, calido, frio } = crudo;
    for (let y = zona.y0; y < zona.y1; y++) {
      for (let i = y * w + zona.x0, fin = y * w + zona.x1; i < fin; i++) {
        if (donde && !donde[i]) continue;
        let v = base;
        if (this.sol) {
          if (this.esPiso[i] && this.n[y] < 34) v = Math.min(v, 7200 + piso(2100 * limitar(this.n[y] - 14, 0, 20), 20));
          if (this.esMuro[i] && y < TOP + 18) v = 7900;
        }
        L[i] = v;
        calido[i] = 0;
        frio[i] = 0;
      }
    }
    const cajaDeMancha = (m: Uint16Array) => (this.sol ? zona : cruce(cajaDe(m, w), zona));
    for (const f of this.fuentes) {
      const g1 = piso(ganancia * f.fuerza, 100), perdida = EN_SOMBRA[f.clase], tono = f.tono === 'calido' ? calido : frio;
      const m = f.mancha, c = cajaDeMancha(m);
      for (let y = c.y0; y < c.y1; y++) {
        for (let i = y * w + c.x0, fin = y * w + c.x1; i < fin; i++) {
          if (donde && !donde[i]) continue;
          let v = m[i];
          if (aLaSombra) v = v - piso(v * perdida, UNO);
          const l = base + piso(g1 * v, UNO);
          if (l > L[i]) L[i] = l;
          const t = piso(piso(v * f.fuerza, 100) * f.color, UNO);
          if (t > tono[i]) tono[i] = t;
        }
      }
    }
    for (const f of this.fijas) {
      const g2 = piso(piso(ganancia * f.fuerza, 100) * f.peso, UNO), tono = f.tono === 'calido' ? calido : frio;
      const m = f.mancha, c = cajaDeMancha(m);
      for (let y = c.y0; y < c.y1; y++) {
        for (let i = y * w + c.x0, fin = y * w + c.x1; i < fin; i++) {
          if (donde && !donde[i]) continue;
          const v = m[i];
          const l = base + piso(g2 * v, UNO);
          if (l > L[i]) L[i] = l;
          const t = piso(piso(v * f.fuerza, 100) * f.color, UNO);
          if (t > tono[i]) tono[i] = t;
        }
      }
    }
    if (this.pulido) {
      for (const f of this.brillos) {
        const tono = f.tono === 'calido' ? calido : frio;
        const m = f.mancha, c = cruce(cajaDe(m, w), zona);
        for (let y = c.y0; y < c.y1; y++) {
          for (let i = y * w + c.x0, fin = y * w + c.x1; i < fin; i++) {
            if (donde && !donde[i]) continue;
            const t = piso(piso(m[i] * f.fuerza, 100) * REFLEJO, UNO);
            if (t > tono[i]) tono[i] = t;
          }
        }
      }
    }
    if (aLaSombra) {
      const baja = PASO * (this.sol ? SOMBRA_AL_SOL : SOMBRA_PROPIA);
      for (let y = zona.y0; y < zona.y1; y++) {
        for (let i = y * w + zona.x0, fin = y * w + zona.x1; i < fin; i++) if ((!donde || donde[i]) && this.esPiso[i]) L[i] -= baja;
      }
    }
  }

  /**
   * Los escalones y las capas de `zona` con la máscara `sombra` (o null), en `destino` si se da (si no, en arreglos
   * nuevos de toda la sala). Cada paso es de un píxel: rehacer un rectángulo da lo mismo que rehacer la sala.
   */
  private calcular(sombra: Uint8Array | null, zona: Caja, destino?: Resultado): Resultado {
    const w = this.ancho, N = w * ALTO;
    const r: Resultado = destino ?? {
      crudo: { L: new Int32Array(N), calido: new Int32Array(N), frio: new Int32Array(N) },
      niveles: new Uint8Array(N),
      capas: { ancho: w, alto: ALTO, ambiente: new Uint8ClampedArray(new ArrayBuffer(N * 4)), brillo: new Uint8ClampedArray(new ArrayBuffer(N * 4)) },
      sombra,
    };
    const { crudo, niveles } = r;
    this.combinar(false, crudo, null, zona);
    if (sombra) this.combinar(true, crudo, sombra, zona);
    const zw = zona.x1 - zona.x0;
    const L = new Int32Array(zw * (zona.y1 - zona.y0));
    for (let y = zona.y0; y < zona.y1; y++) L.set(crudo.L.subarray(y * w + zona.x0, y * w + zona.x1), (y - zona.y0) * zw);
    for (const c of this.cuerpos) this.restarContacto(L, c, zona);
    const exterior = this.exterior ? 100 : 200, escala = piso(600 * w, 960);
    const tabla = this.momento === 'noche' ? TABLA_AMBIENTE_NOCHE : TABLA_AMBIENTE;
    const { ambiente, brillo } = r.capas;
    for (let y = zona.y0; y < zona.y1; y++) {
      const n = this.n[y], ey = piso(Math.abs(y - 310) * 1000, 360), fila = (y & 3) * 4;
      for (let x = zona.x0; x < zona.x1; x++) {
        const i = y * w + x, j = (y - zona.y0) * zw + (x - zona.x0);
        // Sombras de rincón al pie de los muros y viñeta.
        let v = L[j];
        if (this.esPiso[i]) {
          if (n < 18) v = piso(v * (800 + piso(200 * n, 18)), 1000);
          if (this.izq && x - this.jl[y] < 16) v = piso(v * (820 + piso(180 * limitar(x - this.jl[y], 0, 16), 16)), 1000);
          if (this.der && this.jr[y] - x < 16) v = piso(v * (820 + piso(180 * limitar(this.jr[y] - x, 0, 16), 16)), 1000);
        }
        const ex = piso(Math.abs(x - this.cx) * 1000, escala);
        const vineta = limitar((raiz(ex * ex + ey * ey) - 620) * 2, 0, 1000);
        v = piso(v * (1000 - piso(exterior * vineta, 1000)), 1000);
        const umbral = BAYER[fila + (x & 3)];
        const q = limitar(v - MINIMO, 0, PASO * NIVELES);
        const nivel = limitar(piso(q, PASO) + ((q % PASO) * 16 > umbral * PASO ? 1 : 0), 0, NIVELES);
        const ca = crudo.calido[i] * 3, fr = crudo.frio[i] * 3;
        const escCalido = limitar(piso(ca, UNO) + ((ca % UNO) * 16 > umbral * UNO ? 1 : 0), 0, 3);
        const escFrio = limitar(piso(fr, UNO) + ((fr % UNO) * 16 > umbral * UNO ? 1 : 0), 0, 3);
        niveles[i] = nivel | (escCalido << 4) | (escFrio << 6);
        const o = i * 4, am = tabla[nivel], c = TABLA_CALIDA[escCalido], f = TABLA_FRIA[escFrio];
        ambiente[o] = am[0]; ambiente[o + 1] = am[1]; ambiente[o + 2] = am[2]; ambiente[o + 3] = 255;
        brillo[o] = c[0] + f[0]; brillo[o + 1] = c[1] + f[1]; brillo[o + 2] = c[2] + f[2]; brillo[o + 3] = 255;
      }
    }
    return r;
  }

  /** Sombra de contacto de un cuerpo dentro de `zona` (L es la de la zona): una elipse baja a sus pies, plena en el centro. */
  private restarContacto(L: Int32Array, c: CuerpoCompleto, zona: Caja): void {
    const w = this.ancho, zw = zona.x1 - zona.x0;
    const cx = piso(c.x0 + c.x1, 2), cy = c.y1 - 2;
    const rx = piso(c.x1 - c.x0, 2) + 5, ry = Math.max(4, piso(c.y1 - c.y0, 2) + 3);
    for (let y = Math.max(SEAM, cy - ry, zona.y0); y <= Math.min(ALTO - 1, cy + ry, zona.y1 - 1); y++) {
      const ey = piso(Math.abs(y - cy) * UNO, ry);
      for (let x = Math.max(0, cx - rx, zona.x0); x <= Math.min(w - 1, cx + rx, zona.x1 - 1); x++) {
        if (!this.esPiso[y * w + x]) continue;
        const ex = piso(Math.abs(x - cx) * UNO, rx);
        const m = Math.min(limitar(UNO - raiz(ex * ex + ey * ey), 0, UNO) * 2, UNO);
        const j = (y - zona.y0) * zw + (x - zona.x0);
        L[j] = L[j] - piso(CONTACTO * PASO * m, UNO);
      }
    }
  }
}

/** La luz de la sala lista para abrir y cerrar puertas. Lanza si el ancho no es del catálogo. */
export function prepararLuz(sala: SalaPorPiezas, catalogo: CatalogoDeLuz, opciones: OpcionesDeLuz = {}): LuzDeSala {
  return new LuzDeSala(sala, catalogo, opciones);
}

/**
 * Las dos capas de luz de la sala, con las puertas `abiertas` (ids) dejando pasar la luz de la sala vecina. Con
 * `todoEnSombra`, las que quedan dentro de una sombra en todo el piso (`calcular_luz(..., todo_en_sombra=True)`).
 */
export function calcularLuz(
  sala: SalaPorPiezas, catalogo: CatalogoDeLuz,
  opciones: OpcionesDeLuz & { abiertas?: readonly string[]; todoEnSombra?: boolean } = {},
): CapasDeLuz {
  const luz = new LuzDeSala(sala, catalogo, opciones);
  luz.abrir(opciones.abiertas ?? []);
  return opciones.todoEnSombra ? luz.capasEnSombra() : luz.capas();
}
