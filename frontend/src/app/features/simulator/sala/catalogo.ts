/**
 * Catálogo de las «salas por piezas»: la forma de una sala (`estructura`), la del manifiesto de piezas que publica
 * `tools/escenarios/piezas_catalogo.py` (esquema 2) y la lectura de la luz de cada pieza.
 *
 * Sin dependencias y con sintaxis borrable: lo cargan el navegador y las pruebas en Node.
 */
import type { Encuadre, Momento, Muro } from './geometria';

/** Raíz, en el navegador, de las rutas del manifiesto (que son relativas a `biblioteca/`). */
export const BIBLIOTECA_URL = '/assets/biblioteca/';
export const MANIFIESTO_DE_PIEZAS_URL = `${BIBLIOTECA_URL}piezas/manifiesto.json`;

export function urlDePieza(ruta: string): string {
  return `${BIBLIOTECA_URL}${ruta}`;
}

// ── la sala ─────────────────────────────────────────────────────────────────────

export interface PiezaDeSala {
  id?: string;
  tipo: string;
  modelo: string;
  /** Las piezas de muro van con `muro` y `pos`; las lámparas de pie y de mesa, con `x` e `y` sobre el piso. */
  muro?: Muro;
  pos?: number;
  x?: number;
  y?: number;
  /** px por encima del piso, para la lámpara que va encima de una mesa. */
  sobre?: number;
  /** La biblioteca de P1 escribe `siempre` o `nunca`; el contrato 2.2 del servidor, un booleano. Valen los dos. */
  encendida?: 'auto' | 'siempre' | 'nunca' | boolean;
}

export interface PuertaDeSala {
  id: string;
  muro: Muro;
  pos: number;
  modelo: string;
  hacia?: string;
  par?: string;
  etiqueta?: string;
}

export interface TapeteDeSala {
  caja?: number[];
  /** Capa ya dibujada del tapete. Sin ella el tapete no se pinta: Pillow lo dibuja con polígonos que el cliente no repite. */
  ruta?: string;
  x?: number;
  y?: number;
}

export interface EstructuraDeSala {
  ancho: number;
  momento?: Momento;
  /** Al aire libre: sobre el muro se ve el cielo y la luz es la del día. */
  exterior?: boolean;
  acabados: { piso: string; variante?: string; muro: string; paleta: string };
  piezas?: PiezaDeSala[];
  tapetes?: TapeteDeSala[];
  /** Capas fijas de una sala convertida (una escalera, un mesón), ya dibujadas sobre el piso y el muro del fondo. */
  propios?: { ref?: string; ruta: string }[];
}

export interface SalaPorPiezas {
  encuadre: Encuadre;
  estructura: EstructuraDeSala;
  puertas?: PuertaDeSala[];
}

/** `encendida` de una pieza, en la forma de P1 o en la del contrato 2.2: true o false si se fuerza, null si sigue al momento. */
export function encendidaForzada(pieza: Pick<PiezaDeSala, 'encendida'>): boolean | null {
  if (pieza.encendida === true || pieza.encendida === 'siempre') return true;
  if (pieza.encendida === false || pieza.encendida === 'nunca') return false;
  return null;
}

// ── el manifiesto ───────────────────────────────────────────────────────────────

/** Una tira de cuadros de una pieza: `ancho` y `alto` son los de UN cuadro y `apoyo` es su punto de apoyo dentro de él. */
export interface VistaDePieza {
  ruta: string;
  ancho: number;
  alto: number;
  apoyo: [number, number];
  /**
   * Mapa de brillo: tira igual a la del dibujo, transparente salvo lo que brilla, en gris 255 (vidrio, pantalla), 170 (metal)
   * u 85 (barniz). Se tiñe con la luz que le llega a la pieza y se suma encima de la luz.
   */
  brillo?: string;
  /**
   * Mapa de luz propia: tira igual a la del dibujo con los píxeles que emiten (pantallas, pilotos, el tubo o el foco
   * encendido, el cielo de la ventana) en su color final. Se pinta ENCIMA de la luz, sin multiplicar por ambiente.
   */
  emisivo?: string;
}

export interface FichaDePieza {
  nombre: string;
  ocupa: number;
  muros: string[];
  cuadros: number;
  franja: [number, number];
  estados?: string[];
  fps?: number;
  hojas?: string;
  /** En una puerta: ancho y alto del vano. */
  ancho?: number;
  alto?: number;
  /** Solo si la pieza emite luz: ver `luzDePieza`. */
  luz?: Record<string, unknown>;
  vistas: {
    frente?: VistaDePieza;
    camara?: VistaDePieza;
    suelo?: VistaDePieza;
    /** Por ancho de sala («960», «1200»…): el muro lateral cambia de pendiente con el ancho. */
    lado?: Record<string, VistaDePieza>;
  };
}

export interface ImagenDeCatalogo {
  ruta: string;
  ancho: number;
  alto: number;
  nombre?: string;
}

export interface MuroDeCatalogo {
  nombre: string;
  fondo: ImagenDeCatalogo;
  lado: Record<string, { izquierda: ImagenDeCatalogo; derecha: ImagenDeCatalogo }>;
}

export interface MuebleDeCatalogo extends ImagenDeCatalogo {
  cuadros: number;
  fps?: number;
  /** Lo que ocupa en el piso (centrado en su apoyo, `fondo` px hacia atrás) y su altura: de ahí sale la sombra que arroja. */
  huella?: { ancho: number; fondo: number; alto: number };
  /** Mapa de brillo del mueble (ver `VistaDePieza.brillo`). */
  brillo?: string;
  /** Mapa de luz propia del mueble (ver `VistaDePieza.emisivo`). */
  emisivo?: string;
}

export interface ManifiestoDePiezas {
  esquema: 2;
  /** Constantes y tablas de la luz, para comprobar que el motor del cliente usa las mismas. */
  luz?: Record<string, unknown>;
  piezas: Record<string, FichaDePieza>;
  pisos: Record<string, ImagenDeCatalogo>;
  muros: Record<string, MuroDeCatalogo>;
  muebles: Record<string, MuebleDeCatalogo>;
  propios: string[];
  lugares: string[];
}

function esTabla(x: unknown): boolean {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

/** ¿Es un manifiesto de piezas que este código sabe leer? Cualquier otra cosa cuenta como «sin manifiesto». */
export function esManifiestoDePiezas(x: unknown): x is ManifiestoDePiezas {
  const m = x as Partial<ManifiestoDePiezas> | null;
  return !!m && typeof m === 'object' && m.esquema === 2 && esTabla(m.piezas) && esTabla(m.pisos) && esTabla(m.muros);
}

// ── la luz de cada pieza ────────────────────────────────────────────────────────

export interface LuzDePieza {
  /** `haz`: ventana que proyecta sobre el piso. `pozo`: lámpara cálida. `tubo`: luz fría y pareja. */
  forma: 'haz' | 'pozo' | 'tubo';
  /** Cuándo emite por sí sola: las ventanas de día y las lámparas de noche. */
  momento: Momento;
  tono: 'calido' | 'frio';
  /** De 0 a 100. */
  fuerza: number;
  /** Del haz: el vidrio de la ventana (ancho, altura del antepecho y alto), en px del muro. */
  ancho: number;
  antepecho: number;
  alto: number;
  /** Del pozo y del tubo: radios de la mancha sobre el piso. */
  radio: [number, number];
  /** Del pozo: px sobre el piso a los que está la luz; de ahí sale el largo de las sombras que arroja. */
  altura: number;
  /**
   * Del haz: la forma de la ventana que el haz lleva al piso, en 1024avos. `verticales` (parteluces a lo largo del haz),
   * `horizontales` (travesaños que lo cruzan) y `lamas` ([desde, hasta, paso] de la persiana). Sin forma, un parteluz al medio.
   */
  parteluces: FormaDeVentana;
}

export interface FormaDeVentana {
  verticales?: number[];
  horizontales?: number[];
  lamas?: [number, number, number];
}

const PARTELUZ_SIMPLE: FormaDeVentana = { verticales: [512] };

function formaDeVentana(x: unknown): FormaDeVentana {
  const f = x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null;
  if (!f) return PARTELUZ_SIMPLE;
  const lista = (v: unknown) => (Array.isArray(v) && v.every(n => typeof n === 'number' && Number.isFinite(n)) ? v as number[] : undefined);
  const lamas = lista(f['lamas']);
  const forma: FormaDeVentana = {};
  if (lista(f['verticales'])) forma.verticales = lista(f['verticales']);
  if (lista(f['horizontales'])) forma.horizontales = lista(f['horizontales']);
  if (lamas && lamas.length === 3 && lamas[2] > 0) forma.lamas = [lamas[0], lamas[1], lamas[2]];
  return forma;
}

/**
 * Lo que la luz lee del catálogo: la ficha `luz` de cada pieza que emite y el `ancho` del vano de cada puerta.
 * Es la forma de `piezas` del manifiesto (y la de `catalogo` en `biblioteca/piezas/luz/casos.json`).
 */
export type CatalogoDeLuz = Readonly<Record<string, { luz?: unknown; ancho?: unknown } | undefined>>;

function numero(x: unknown, porDefecto: number): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : porDefecto;
}

/** La luz de una pieza según el catálogo, con sus valores por defecto; null si no emite o si su ficha no se entiende. */
export function luzDePieza(catalogo: CatalogoDeLuz, tipo: string, modelo: string): LuzDePieza | null {
  const clave = `${tipo}/${modelo}`;
  const luz = Object.hasOwn(catalogo, clave) ? (catalogo[clave]?.luz as Record<string, unknown> | undefined) : undefined;
  if (!luz || typeof luz !== 'object') return null;
  const forma = luz['forma'], momento = luz['momento'], tono = luz['tono'], radio = luz['radio'];
  if (forma !== 'haz' && forma !== 'pozo' && forma !== 'tubo') return null;
  if (momento !== 'dia' && momento !== 'noche') return null;
  if (tono !== 'calido' && tono !== 'frio') return null;
  const [rx, ry] = Array.isArray(radio) ? radio : [];
  const ficha: LuzDePieza = {
    forma, momento, tono,
    fuerza: numero(luz['fuerza'], 100),
    ancho: numero(luz['ancho'], 0),
    antepecho: numero(luz['antepecho'], 0),
    alto: numero(luz['alto'], 0),
    radio: [numero(rx, 0), numero(ry, 0)],
    altura: numero(luz['altura'], 150),
    // `parteluces` puede faltar o ser null: entonces el haz lleva un parteluz al medio, como en Python.
    parteluces: formaDeVentana(luz['parteluces']),
  };
  // Un haz sin ancho o una lámpara sin radio no dibujan nada y dividirían por cero.
  if (forma === 'haz' ? ficha.ancho <= 0 : ficha.radio[0] <= 0 || ficha.radio[1] <= 0) return null;
  return ficha;
}

/** Ancho del vano de un modelo de puerta: lo usa la cuña de luz de la puerta abierta. null si el catálogo no lo trae. */
export function vanoDePuerta(catalogo: CatalogoDeLuz, modelo: string): number | null {
  const clave = `puerta/${modelo}`;
  const ancho = Object.hasOwn(catalogo, clave) ? catalogo[clave]?.ancho : undefined;
  return typeof ancho === 'number' && ancho > 0 ? ancho : null;
}
