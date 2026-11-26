/**
 * Lectura de lo que el caso trae en `map.ambient` para la cinemática y el tutor (contrato del caso insignia, §1 y §2).
 *
 * El servidor lo manda tal cual lo escribió la autora: aquí se valida y se completa. Un campo que no sirve se descarta sin
 * romper nada (un plano con una escena desconocida se salta; un tutor sin líneas no existe) y lo que queda trae sus valores
 * por omisión. Los textos se guardan con `{nombre}` sin poner: la plantilla se aplica al pintar (`caso/plantilla-nombre.ts`).
 * Pura: sin Angular ni DOM. La memoria de «ya visto» va aparte, al final, con su almacenamiento inyectable.
 */
import type {
  EscenaDeCinematica, MomentoDeCinematica, PasoDelTutor, SiluetaDeCinematica,
} from '../../../core/models/simulation.model';
import { conNombre } from '../caso/plantilla-nombre';

export const ESCENAS_DE_CINEMATICA: readonly EscenaDeCinematica[] = Object.freeze([
  'barrio', 'casa-ventana', 'negro', 'calle-emergencia', 'urgencias-llegada', 'urgencias-familia', 'titulo',
]);
const SILUETAS: readonly SiluetaDeCinematica[] = ['hombre', 'mujer', 'nina'];

/** Mínimo del plano y máximo de la duración pedida por el caso. */
export const DURACION_MINIMA_MS = 1500;
export const DURACION_MAXIMA_MS = 30_000;
/**
 * Lo que un subtítulo tarda en aparecer entero y el fundido entre planos: se suma al tiempo de lectura para que el texto
 * quede ENTERO en pantalla al menos lo que se tarda en leerlo.
 */
export const MARGEN_DE_LECTURA_MS = 1800;
/** Sin `duracionMs` ni texto: lo que dura un plano en silencio (el corte a negro respira, no parpadea). */
const DURACION_SIN_TEXTO_MS = 2500;
/** Topes: el caso no puede colgar la pantalla con cientos de planos o un texto sin fin. */
const MAX_PLANOS = 24;
const MAX_TEXTO = 420;
const MAX_LINEAS_TUTOR = 16;
const MAX_PASOS_TUTOR = 10;

export interface PlanoLeido {
  escena: EscenaDeCinematica;
  momento: MomentoDeCinematica;
  /** Con `{nombre}` sin poner; '' si el plano va sin texto. */
  subtitulo: string;
  /** Lo que dura de verdad: la que pidió el caso, nunca menos que su tiempo de lectura. */
  duracionMs: number;
  /** Duración base antes de calcular la lectura del texto con el nombre de quien juega. */
  duracionBaseMs?: number;
  siluetas: SiluetaDeCinematica[];
  /** null: lo que la escena hace por omisión. */
  luzVentana: boolean | null;
  /**
   * Recetas del kit de quienes aparecen en el plano, en orden (`urgencias-familia`: las tres personas que llegan;
   * `calle-emergencia`: la vecina). Vacío: las genéricas del reproductor. Así la cinemática muestra a los mismos personajes
   * que el juego sin que el reproductor sepa nada del caso.
   */
  personas: (string | null)[];
}

/** Una clave de receta del kit (las rutas de sus hojas se arman con ella: nada de barras ni puntos). */
const RECETA_VALIDA = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface CinematicaLeida {
  id: string;
  planos: PlanoLeido[];
}

export interface TutorLeido {
  nombre: string;
  rol: string;
  /** Receta del kit para el retrato; null si falta o no es una clave válida (no se pinta retrato). */
  recipeId: string | null;
  lineas: string[];
  pasos: PasoDelTutor[];
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function texto(x: unknown, tope = MAX_TEXTO): string {
  return typeof x === 'string' ? x.trim().slice(0, tope) : '';
}

function palabras(t: string): number {
  return t.split(/\s+/).filter(Boolean).length;
}

/** Lo que tarda en leerse un subtítulo, con el margen de su aparición y del fundido. 0 si no hay texto. */
export function tiempoDeLectura(subtitulo: string): number {
  const n = palabras(subtitulo);
  return n ? Math.ceil(n * 4000 / 15) + MARGEN_DE_LECTURA_MS : 0;
}

/** Al montar, el reloj y la animación usan la duración del texto que realmente se muestra. */
export function duracionConNombre(plano: PlanoLeido, nombre: string): number {
  return Math.max(plano.duracionBaseMs ?? plano.duracionMs, tiempoDeLectura(conNombre(plano.subtitulo, nombre)));
}

/** Las escenas de noche por naturaleza: de noche si el caso no dice otra cosa. */
const DE_NOCHE: ReadonlySet<EscenaDeCinematica> = new Set(['calle-emergencia', 'urgencias-llegada', 'urgencias-familia']);

function leerPlano(x: unknown): PlanoLeido | null {
  if (!esObjeto(x)) return null;
  const escena = x['escena'];
  if (typeof escena !== 'string' || !(ESCENAS_DE_CINEMATICA as readonly string[]).includes(escena)) return null;
  const e = escena as EscenaDeCinematica;
  const momento: MomentoDeCinematica = x['momento'] === 'noche' || x['momento'] === 'tarde'
    ? x['momento']
    : DE_NOCHE.has(e) ? 'noche' : 'tarde';
  const subtitulo = texto(x['subtitulo']);
  const pedida = typeof x['duracionMs'] === 'number' && Number.isFinite(x['duracionMs']) ? x['duracionMs'] : 0;
  const base = pedida > 0 ? pedida : subtitulo ? 0 : DURACION_SIN_TEXTO_MS;
  const duracionBaseMs = Math.round(Math.min(DURACION_MAXIMA_MS, Math.max(DURACION_MINIMA_MS, base)));
  const duracionMs = Math.max(duracionBaseMs, tiempoDeLectura(subtitulo));
  const siluetas = Array.isArray(x['siluetas'])
    ? (x['siluetas'] as unknown[]).filter((s): s is SiluetaDeCinematica => typeof s === 'string' && (SILUETAS as readonly string[]).includes(s)).slice(0, 3)
    : [];
  const luzVentana = typeof x['luzVentana'] === 'boolean' ? x['luzVentana'] : null;
  const lista = x['personas'];
  const cantidad = e === 'urgencias-familia' ? 3 : e === 'calle-emergencia' ? 1 : 0;
  const posiciones = Array.isArray(lista) && (e !== 'urgencias-familia' || lista.length === cantidad) ? lista.slice(0, cantidad) : [];
  const personas = Array.from(posiciones, (r: unknown) => typeof r === 'string' && RECETA_VALIDA.test(r) ? r : null);
  return { escena: e, momento, subtitulo, duracionMs, duracionBaseMs, siluetas, luzVentana, personas };
}

/** `ambient.cinematica` validada, o null si no hay o no trae ningún plano que se pueda dibujar. */
export function leerCinematica(ambient: unknown): CinematicaLeida | null {
  const c = esObjeto(ambient) ? ambient['cinematica'] : null;
  if (!esObjeto(c) || !Array.isArray(c['planos'])) return null;
  const planos = (c['planos'] as unknown[]).slice(0, MAX_PLANOS).map(leerPlano).filter((p): p is PlanoLeido => p !== null);
  if (!planos.length) return null;
  const id = texto(c['id'], 80).replace(/[^\w.-]+/g, '-') || 'cinematica';
  return { id, planos };
}

/** Clave de una receta del kit: minúsculas, cifras y guiones (también es una ruta de archivo: nada más entra). */
export function esRecetaValida(x: unknown): x is string {
  return typeof x === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x) && x.length <= 64;
}

function leerPaso(x: unknown, i: number): PasoDelTutor | null {
  if (!esObjeto(x)) return null;
  const titulo = texto(x['titulo'], 120);
  if (!titulo) return null;
  const numero = typeof x['numero'] === 'number' && Number.isInteger(x['numero']) && x['numero'] > 0 && x['numero'] < 100 ? x['numero'] : i + 1;
  const detalle = texto(x['detalle']);
  return detalle ? { numero, titulo, detalle } : { numero, titulo };
}

/** `ambient.tutor` validado, o null si no hay o no trae ninguna línea. */
export function leerTutor(ambient: unknown): TutorLeido | null {
  const t = esObjeto(ambient) ? ambient['tutor'] : null;
  if (!esObjeto(t) || !Array.isArray(t['lineas'])) return null;
  const lineas = (t['lineas'] as unknown[]).map(l => texto(l, 900)).filter(Boolean).slice(0, MAX_LINEAS_TUTOR);
  if (!lineas.length) return null;
  const pasos = Array.isArray(t['pasos'])
    ? (t['pasos'] as unknown[]).slice(0, MAX_PASOS_TUTOR).map(leerPaso).filter((p): p is PasoDelTutor => p !== null)
    : [];
  return {
    nombre: texto(t['nombre'], 80) || 'Tutor',
    rol: texto(t['rol'], 140),
    recipeId: esRecetaValida(t['recipeId']) ? t['recipeId'] : null,
    lineas,
    pasos,
  };
}

/** La línea que presenta la lista de pasos: la penúltima (o la única, si solo hay una). */
export function lineaDeLosPasos(tutor: Pick<TutorLeido, 'lineas'>): number {
  return Math.max(0, tutor.lineas.length - 2);
}

// ── Lo ya visto en un intento ────────────────────────────────────────────────────────────────────────────────────────

/** Lo mínimo de `Storage` que hace falta (las pruebas pasan uno de mentira). */
export interface AlmacenDeVistos {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

const PREFIJO = 'siep.intento-visto.v1.';
/** Tope de marcas por intento: una sala por capítulo y poco más; si se pasa, se olvidan las más viejas. */
const MAX_MARCAS = 64;

export const marcaDeCinematica = (id: string) => `cinematica:${id}`;
export const marcaDeTutor = (mapa: string) => `tutor:${mapa}`;
export const marcaDeCapitulo = (mapa: string) => `capitulo:${mapa}`;

/**
 * Lo que ya se vio en un intento (la cinemática, el tutor de cada sala, la nota de capítulo de la sala inicial): una sola
 * entrada de `localStorage` por intento, así no se repite al volver otro día. Un almacenamiento que falla (modo privado,
 * cuota) cuenta como «no visto»: se vuelve a mostrar y el juego sigue.
 */
export class VistosDelIntento {
  constructor(private readonly intento: string, private readonly almacen: AlmacenDeVistos | null = almacenLocal()) {}

  private leer(): string[] {
    try {
      const crudo = this.almacen?.getItem(PREFIJO + this.intento);
      const lista = crudo ? JSON.parse(crudo) as unknown : [];
      return Array.isArray(lista) ? lista.filter((m): m is string => typeof m === 'string') : [];
    } catch {
      return [];
    }
  }

  visto(marca: string): boolean {
    return this.leer().includes(marca);
  }

  marcar(marca: string): void {
    const lista = this.leer().filter(m => m !== marca);
    lista.push(marca);
    try {
      this.almacen?.setItem(PREFIJO + this.intento, JSON.stringify(lista.slice(-MAX_MARCAS)));
    } catch {
      // Sin almacenamiento la marca no queda: se volverá a mostrar. El juego sigue.
    }
  }
}

function almacenLocal(): AlmacenDeVistos | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
