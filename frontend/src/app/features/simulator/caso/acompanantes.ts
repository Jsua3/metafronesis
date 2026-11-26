/**
 * Los acompañantes caminan hasta la puerta (contrato `metadatos.acompanantes`, sección 4): antes de que quien juega cruce,
 * cada persona listada recorre su camino hasta la puerta rodeando los muebles, una tras otra, y se desvanece al cruzarla.
 *
 * Módulo puro: la ruta (A* en una rejilla sobre la colisión que inyecta la escena), el plan en el tiempo (escalonado y con
 * tope de duración) y el muestreo de cada persona en un instante. Sin Angular ni Phaser; la escena solo pinta lo que sale de aquí.
 */
import type { ViewId } from '../../character/kit/kit-engine';
import { direccionDeVector } from '../direccion-ocho';

export interface Punto {
  readonly x: number;
  readonly y: number;
}

export interface EntornoDeRuta {
  /** Los pies en (x, y) chocarían con un mueble, una pared o algo que no se mueve. */
  bloqueado(x: number, y: number): boolean;
  readonly limites: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
}

/** Lado de la rejilla de búsqueda (px): lo bastante fino para pasar entre muebles, lo bastante grueso para ser barato. */
export const CELDA_PX = 10;
/** Tope de celdas que explora el A* antes de rendirse y caer a la línea recta. */
const TOPE_DE_NODOS = 3000;
/** Cuánto se amplía, hacia cada lado, la caja que une salida y llegada para buscar el rodeo. */
const MARGEN_DE_BUSQUEDA_PX = 120;
/** Cada cuántos px se comprueba que un tramo recto esté libre. */
const MUESTREO_PX = 6;
/** Cerca de la puerta no se exige suelo libre: el marcador de la puerta puede caer sobre su propia pared. */
const HOLGURA_DE_PUERTA_PX = 14;

/** Velocidad al ir a la puerta (px/s): más viva que el deambular (40) pero sin correr. */
export const VELOCIDAD_A_LA_PUERTA = 90;
/** Ninguna caminata dura más: si el trayecto es largo, esa persona acelera. */
export const TOPE_DE_CAMINATA_MS = 2200;
/** Entre una persona y la siguiente. */
export const ESCALON_MS = 250;
/** Los últimos px del camino, en los que la persona se desvanece al cruzar la puerta. */
export const DESVANECE_PX = 22;
/** Margen tras la última persona antes de que el jugador cruce. */
const ASENTAR_MS = 120;

const distancia = (a: Punto, b: Punto): number => Math.hypot(b.x - a.x, b.y - a.y);

/** ¿El tramo está libre? Junto a una puerta se permite cruzar su pared. */
function tramoLibre(a: Punto, b: Punto, env: EntornoDeRuta, libreDe: Punto, holgura: number): boolean {
  const largo = distancia(a, b);
  const pasos = Math.max(1, Math.ceil(largo / MUESTREO_PX));
  for (let i = 1; i <= pasos; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / pasos, y: a.y + ((b.y - a.y) * i) / pasos };
    if (holgura > 0 && distancia(p, libreDe) <= holgura) continue;
    if (env.bloqueado(p.x, p.y)) return false;
  }
  return true;
}

/**
 * Camino de `desde` a `hasta` esquivando lo que bloquea: puntos de paso SIN el de salida y con `hasta` al final. Si la
 * búsqueda no encuentra nada, los acompañantes aún cruzan la puerta. Una llegada que exige suelo libre devuelve [].
 */
export function rutaEsquivando(desde: Punto, hasta: Punto, env: EntornoDeRuta, exigirLlegadaLibre = false): Punto[] {
  const holgura = exigirLlegadaLibre ? 0 : HOLGURA_DE_PUERTA_PX;
  if (exigirLlegadaLibre && env.bloqueado(hasta.x, hasta.y)) return [];
  if (tramoLibre(desde, hasta, env, hasta, holgura)) return [hasta];

  const { limites } = env;
  const minX = Math.max(limites.minX, Math.min(desde.x, hasta.x) - MARGEN_DE_BUSQUEDA_PX);
  const maxX = Math.min(limites.maxX, Math.max(desde.x, hasta.x) + MARGEN_DE_BUSQUEDA_PX);
  const minY = Math.max(limites.minY, Math.min(desde.y, hasta.y) - MARGEN_DE_BUSQUEDA_PX);
  const maxY = Math.min(limites.maxY, Math.max(desde.y, hasta.y) + MARGEN_DE_BUSQUEDA_PX);
  const columnas = Math.max(1, Math.floor((maxX - minX) / CELDA_PX) + 1);
  const filas = Math.max(1, Math.floor((maxY - minY) / CELDA_PX) + 1);
  const aCelda = (p: Punto): [number, number] => [
    Math.min(columnas - 1, Math.max(0, Math.round((p.x - minX) / CELDA_PX))),
    Math.min(filas - 1, Math.max(0, Math.round((p.y - minY) / CELDA_PX))),
  ];
  const aPunto = (c: number, f: number): Punto => ({ x: minX + c * CELDA_PX, y: minY + f * CELDA_PX });
  const id = (c: number, f: number): number => f * columnas + c;

  const [c0, f0] = aCelda(desde);
  const [c1, f1] = aCelda(hasta);
  const libre = new Map<number, boolean>();
  const celdaLibre = (c: number, f: number): boolean => {
    if (c === c1 && f === f1) return true;   // la llegada siempre se puede pisar
    if (c === c0 && f === f0) return true;   // y la salida: ahí ya está parada
    const k = id(c, f);
    let v = libre.get(k);
    if (v === undefined) {
      const p = aPunto(c, f);
      v = (holgura > 0 && distancia(p, hasta) <= holgura) || !env.bloqueado(p.x, p.y);
      libre.set(k, v);
    }
    return v;
  };

  const g = new Map<number, number>([[id(c0, f0), 0]]);
  const padre = new Map<number, number>();
  const cerrado = new Set<number>();
  // Cola de prioridad mínima y simple: pocas celdas, un arreglo con búsqueda del menor basta.
  const abierta: { k: number; c: number; f: number; costo: number }[] = [{ k: id(c0, f0), c: c0, f: f0, costo: 0 }];
  const h = (c: number, f: number): number => Math.hypot(c1 - c, f1 - f);
  let encontrado = false;
  let explorados = 0;

  while (abierta.length > 0 && explorados < TOPE_DE_NODOS) {
    let mejor = 0;
    for (let i = 1; i < abierta.length; i++) if (abierta[i].costo < abierta[mejor].costo) mejor = i;
    const actual = abierta.splice(mejor, 1)[0];
    if (cerrado.has(actual.k)) continue;
    cerrado.add(actual.k);
    explorados++;
    if (actual.c === c1 && actual.f === f1) { encontrado = true; break; }
    for (let dc = -1; dc <= 1; dc++) {
      for (let df = -1; df <= 1; df++) {
        if (dc === 0 && df === 0) continue;
        const nc = actual.c + dc, nf = actual.f + df;
        if (nc < 0 || nf < 0 || nc >= columnas || nf >= filas || !celdaLibre(nc, nf)) continue;
        // Sin cortar esquinas: en diagonal, las dos celdas vecinas también deben estar libres.
        if (dc !== 0 && df !== 0 && (!celdaLibre(actual.c + dc, actual.f) || !celdaLibre(actual.c, actual.f + df))) continue;
        const nk = id(nc, nf);
        if (cerrado.has(nk)) continue;
        const costo = (g.get(actual.k) ?? 0) + (dc !== 0 && df !== 0 ? Math.SQRT2 : 1);
        if (costo < (g.get(nk) ?? Infinity)) {
          g.set(nk, costo);
          padre.set(nk, actual.k);
          abierta.push({ k: nk, c: nc, f: nf, costo: costo + h(nc, nf) });
        }
      }
    }
  }
  if (!encontrado) return exigirLlegadaLibre ? [] : [hasta];

  const celdas: Punto[] = [];
  for (let k: number | undefined = id(c1, f1); k !== undefined; k = padre.get(k)) {
    celdas.push(aPunto(k % columnas, Math.floor(k / columnas)));
  }
  celdas.reverse();
  // La primera celda es la de salida (≈ `desde`) y la última la de llegada: se cambian por los puntos exactos.
  const camino: Punto[] = [desde, ...celdas.slice(1, -1), hasta];

  // Se estira el camino: de cada punto se salta al más lejano al que se llega en línea recta libre.
  const liso: Punto[] = [];
  let i = 0;
  while (i < camino.length - 1) {
    let j = camino.length - 1;
    while (j > i + 1 && !tramoLibre(camino[i], camino[j], env, hasta, holgura)) j--;
    if (exigirLlegadaLibre && !tramoLibre(camino[i], camino[j], env, hasta, holgura)) return [];
    liso.push(camino[j]);
    i = j;
  }
  return liso;
}

export interface EntradaAcompanante {
  readonly key: string;
  readonly desde: Punto;
}

export interface PasoDeAcompanante {
  readonly key: string;
  /** Los puntos de paso hasta la puerta (sin el de salida). */
  readonly ruta: readonly Punto[];
  readonly longitud: number;
  /** Cuándo echa a andar (escalón) y cuánto camina. */
  readonly inicioMs: number;
  readonly caminaMs: number;
}

export interface PlanDeAcompanantes {
  readonly pasos: readonly PasoDeAcompanante[];
  /** Cuándo termina el último y el jugador puede cruzar. */
  readonly totalMs: number;
}

/** Un instante de un acompañante: dónde está, hacia dónde mira, cuánto se ve y si ya cruzó. */
export interface MuestraDeAcompanante {
  readonly x: number;
  readonly y: number;
  readonly vista: ViewId | null;
  readonly alfa: number;
  readonly caminando: boolean;
  readonly cruzo: boolean;
}

function largoDe(desde: Punto, ruta: readonly Punto[]): number {
  let total = 0, previo = desde;
  for (const p of ruta) { total += distancia(previo, p); previo = p; }
  return total;
}

/**
 * El plan: cada persona en el orden de la lista, con su ruta propia, escalonadas `ESCALON_MS`. Caminar más de
 * `TOPE_DE_CAMINATA_MS` no se permite: quien está lejos acelera (la coreografía no debe hacer esperar a quien juega).
 */
export function planearAcompanantes(entradas: readonly EntradaAcompanante[], puerta: Punto, env: EntornoDeRuta): PlanDeAcompanantes {
  const pasos: PasoDeAcompanante[] = entradas.map((e, orden) => {
    const ruta = rutaEsquivando(e.desde, puerta, env);
    const longitud = largoDe(e.desde, ruta);
    const velocidad = Math.max(VELOCIDAD_A_LA_PUERTA, (longitud / TOPE_DE_CAMINATA_MS) * 1000);
    return { key: e.key, ruta, longitud, inicioMs: orden * ESCALON_MS, caminaMs: Math.round((longitud / velocidad) * 1000) };
  });
  const fin = pasos.reduce((m, p) => Math.max(m, p.inicioMs + p.caminaMs), 0);
  return { pasos, totalMs: pasos.length ? fin + ASENTAR_MS : 0 };
}

/** Dónde está `paso` a los `ms` desde que empieza la coreografía (`desde` es su punto de partida). */
export function muestrearAcompanante(paso: PasoDeAcompanante, desde: Punto, ms: number): MuestraDeAcompanante {
  if (ms < paso.inicioMs) return { ...desde, vista: null, alfa: 1, caminando: false, cruzo: false };
  const t = paso.caminaMs <= 0 ? 1 : Math.min(1, (ms - paso.inicioMs) / paso.caminaMs);
  let restante = paso.longitud * t;
  let previo = desde;
  let vista: ViewId | null = null;
  for (const p of paso.ruta) {
    const tramo = distancia(previo, p);
    if (tramo > 0) vista = direccionDeVector(p.x - previo.x, p.y - previo.y, vista);
    if (restante <= tramo || p === paso.ruta[paso.ruta.length - 1]) {
      const f = tramo === 0 ? 1 : Math.min(1, restante / tramo);
      const x = previo.x + (p.x - previo.x) * f, y = previo.y + (p.y - previo.y) * f;
      const falta = paso.longitud - paso.longitud * t;
      const alfa = Math.max(0, Math.min(1, falta / DESVANECE_PX));
      return { x, y, vista, alfa, caminando: t < 1, cruzo: t >= 1 };
    }
    restante -= tramo;
    previo = p;
  }
  return { ...desde, vista, alfa: 0, caminando: false, cruzo: true };
}

/** Movimiento reducido: sin caminar, cada acompañante se desvanece en su sitio, escalonado y en poco tiempo. */
export const DESVANECE_REDUCIDO_MS = 200;
const ESCALON_REDUCIDO_MS = 80;

export function planearDesvanecimiento(claves: readonly string[]): { totalMs: number } {
  return { totalMs: claves.length ? (claves.length - 1) * ESCALON_REDUCIDO_MS + DESVANECE_REDUCIDO_MS : 0 };
}

/** Opacidad de la persona de orden `orden` a los `ms` con movimiento reducido. */
export function alfaReducido(orden: number, ms: number): number {
  const t = (ms - orden * ESCALON_REDUCIDO_MS) / DESVANECE_REDUCIDO_MS;
  return Math.max(0, Math.min(1, 1 - t));
}

/** Las claves de `metadata.acompanantes` de una puerta: solo textos no vacíos y sin repetir (lo demás se ignora). */
export function leerAcompanantes(metadata: unknown): string[] {
  const crudo = (metadata as { acompanantes?: unknown } | null | undefined)?.acompanantes;
  if (!Array.isArray(crudo)) return [];
  return [...new Set(crudo.filter((k): k is string => typeof k === 'string' && k.trim() !== '').map(k => k.trim()))];
}
