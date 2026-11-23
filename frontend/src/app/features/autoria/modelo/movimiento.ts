/**
 * Cómo se mueve una persona de la sala y a quién hay que atender: lo que el docente decide y el juego lee de
 * `metadata.movimiento` y `metadata.personaClave`. Funciones puras.
 *
 * El juego (`simulator/person-walk.util.ts`) lee el movimiento así: `"deambula"`, `{tipo: 'va-y-viene', hasta: {x, y}}`
 * o, ausente o mal formado, quieto. Aquí se lee igual (sin lanzar nunca) y se escribe en la forma más corta.
 */
import type { MovimientoPersonaje, SalaCaso } from './caso';
import type { Escenario, Punto } from './escenario';
import { zonaCaminable } from './geometria';

/** Cómo lo nombra el docente: nunca el valor técnico. */
export const NOMBRE_MOVIMIENTO: Record<'quieto' | 'deambula' | 'va-y-viene', string> = {
  quieto: 'Se queda quieto',
  deambula: 'Camina por la sala',
  'va-y-viene': 'Va y viene',
};

/** Cómo se anuncia a la persona a atender (el mismo texto que dice el juego en su lista de la sala). */
export const TEXTO_PERSONA_A_ATENDER = 'persona a atender';

/** Lo mínimo que tiene que haber entre la persona y el punto al que va para que haya un camino que recorrer (px de sala). */
const DISTANCIA_MINIMA_PX = 24;

const esCoordenada = (valor: unknown): valor is number => typeof valor === 'number' && Number.isFinite(valor);

/** Valida la forma que entiende el juego antes de editarla. */
export function revisarTrayecto(m: { puntos: unknown; modo: unknown; pausaMs?: unknown }): string[] {
  const errores: string[] = [];
  const numero = (v: unknown) => esCoordenada(v) && Math.abs(v) <= 1_000_000;
  if (!Array.isArray(m.puntos) || m.puntos.length < 2 || m.puntos.length > 8 || m.puntos.some((p: unknown) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return true;
    const punto = p as Record<string, unknown>;
    return !numero(punto['x']) || !numero(punto['y']);
  })) {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    errores.push('El trayecto necesita entre 2 y 8 puntos con coordenadas válidas.');
  }
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
  if (m.modo !== 'circuito' && m.modo !== 'ida-y-vuelta') errores.push('Elige un modo de recorrido válido.');
  if ('pausaMs' in m && (typeof m.pausaMs !== 'number' || !Number.isInteger(m.pausaMs) || m.pausaMs < 0 || m.pausaMs > 10000)) {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    errores.push('La pausa debe ser un número entero entre 0 y 10000 milisegundos.');
  }
  return errores;
}

/** Lee `metadata.movimiento`. Ausente, desconocido o mal formado es «quieto»; nunca lanza. */
export function movimientoDeMetadata(crudo: unknown): MovimientoPersonaje {
  if (crudo === 'deambula') return 'deambula';
  if (crudo === 'quieto' || crudo === null || typeof crudo !== 'object' || Array.isArray(crudo)) return 'quieto';
  const registro = crudo as Record<string, unknown>;
  if (registro['tipo'] === 'deambula') return 'deambula';
  if (registro['tipo'] === 'ruta' && !revisarTrayecto(registro as { puntos: unknown; modo: unknown; pausaMs?: unknown }).length) {
    return { tipo: 'ruta', puntos: (registro['puntos'] as Punto[]).map(({ x, y }) => ({ x, y })),
      modo: registro['modo'] as 'circuito' | 'ida-y-vuelta',
      ...('pausaMs' in registro ? { pausaMs: registro['pausaMs'] as number } : {}) };
  }
  if (registro['tipo'] === 'va-y-viene') {
    const hasta = registro['hasta'];
    if (hasta && typeof hasta === 'object') {
      const { x, y } = hasta as Record<string, unknown>;
      if (esCoordenada(x) && esCoordenada(y)) return { tipo: 'va-y-viene', hasta: { x, y } };
    }
  }
  return 'quieto';
}

/** Lo que se escribe en `metadata.movimiento`. */
export function movimientoAMetadata(movimiento: MovimientoPersonaje): MovimientoPersonaje {
  if (typeof movimiento === 'string') return movimiento;
  if (movimiento.tipo === 'ruta') return { tipo: 'ruta', puntos: movimiento.puntos.map(({ x, y }) => ({ x, y })),
    modo: movimiento.modo, ...(movimiento.pausaMs !== undefined ? { pausaMs: movimiento.pausaMs } : {}) };
  return { tipo: 'va-y-viene', hasta: { ...movimiento.hasta } };
}

export function mismoMovimiento(a: MovimientoPersonaje, b: MovimientoPersonaje): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (a.tipo !== b.tipo) return false;
  if (a.tipo === 'ruta' && b.tipo === 'ruta') return a.modo === b.modo && a.pausaMs === b.pausaMs &&
    a.puntos.length === b.puntos.length && a.puntos.every((p, i) => p.x === b.puntos[i].x && p.y === b.puntos[i].y);
  return a.tipo === 'va-y-viene' && b.tipo === 'va-y-viene' && a.hasta.x === b.hasta.x && a.hasta.y === b.hasta.y;
}

/** El nombre técnico del movimiento. */
export function tipoDeMovimiento(movimiento: MovimientoPersonaje): 'quieto' | 'deambula' | 'va-y-viene' | 'ruta' {
  return typeof movimiento === 'string' ? movimiento : movimiento.tipo;
}

interface Huella {
  nombre: string;
  izquierda: number;
  arriba: number;
  derecha: number;
  abajo: number;
}

/**
 * Las huellas en el suelo de los muebles que chocan: el punto de apoyo es su centro inferior (como las guarda
 * `hacia-api.huella`). Un mueble que el catálogo no conoce (un caso sin lugar) no se puede medir y no cuenta.
 */
function huellasDeMuebles(sala: Pick<SalaCaso, 'muebles'>, catalogo: Escenario['catalogo']): Huella[] {
  const huellas: Huella[] = [];
  for (const m of sala.muebles) {
    const pieza = catalogo.muebles.find((c) => c.id === m.ref);
    if (!pieza?.colision) continue;
    const izquierda = m.x - Math.floor(pieza.ancho / 2);
    huellas.push({ nombre: pieza.nombre, izquierda, arriba: m.y - pieza.alto, derecha: izquierda + pieza.ancho, abajo: m.y });
  }
  return huellas;
}

export type PuntoDeIda = { ok: true; punto: Punto } | { ok: false; motivo: string };

/**
 * ¿Sirve este punto como el otro extremo de un «va y viene»? Tiene que estar dentro de la zona por donde se camina, fuera
 * de los muebles que chocan (la línea del suelo del mueble no cuenta como dentro) y a cierta distancia de donde la persona
 * está. Si no sirve, dice por qué en palabras del docente.
 */
export function revisarPuntoDeIda(
  sala: Pick<SalaCaso, 'encuadre' | 'muebles'>, catalogo: Escenario['catalogo'], desde: Punto, punto: Punto,
): PuntoDeIda {
  const zona = zonaCaminable(sala.encuadre);
  if (punto.x < zona.x || punto.x > zona.x + zona.ancho || punto.y < zona.y || punto.y > zona.y + zona.alto) {
    return { ok: false, motivo: 'Ese punto queda fuera de la zona por donde se puede caminar. Elige uno dentro de la sala.' };
  }
  const choca = huellasDeMuebles(sala, catalogo).find(
    (h) => punto.x >= h.izquierda && punto.x <= h.derecha && punto.y > h.arriba && punto.y < h.abajo,
  );
  if (choca) return { ok: false, motivo: `Ese punto cae dentro de «${choca.nombre}». Elige un punto libre.` };
  if (Math.hypot(punto.x - desde.x, punto.y - desde.y) < DISTANCIA_MINIMA_PX) {
    return { ok: false, motivo: 'Elige un punto un poco más lejos de donde está la persona.' };
  }
  return { ok: true, punto: { x: punto.x, y: punto.y } };
}
