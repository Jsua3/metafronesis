import type { ViewId } from '../character/kit/kit-engine';

/**
 * Hacia dónde mira un personaje del kit (8 vistas) según cómo se mueve.
 *
 * Funciones puras y sin reloj propio: quien llama pasa el vector de movimiento
 * y los milisegundos del cuadro. Sirven igual para el jugador (teclado, toque,
 * «ir a»), las personas que caminan y los NPC, y se prueban sin Phaser.
 *
 * Dos márgenes evitan el parpadeo entre dos vistas vecinas:
 *  - angular: la vista anterior se conserva hasta `MARGEN_ANGULAR_GRADOS` más
 *    allá de la frontera de su sector (una persona que va a un punto en ~22°);
 *  - temporal: en pleno movimiento, una vecina solo gana si se pide durante
 *    `RETARDO_VECINA_MS` (al soltar una diagonal tecla por tecla, el cuadro en
 *    que solo queda una tecla no cuenta). Arrancar desde quieto no espera.
 *
 * Un giro de más de 45° empieza en el acto y pasa por las vistas de en medio
 * (la cabeza gira antes que el cuerpo; el kit no interpola píxeles, así que el
 * giro se dibuja con las filas que ya tiene). Con movimiento reducido llega de una vez.
 */

export const MARGEN_ANGULAR_GRADOS = 10;
export const RETARDO_VECINA_MS = 70;
/** Lo que dura cada vista de en medio cuando gira el jugador: media vuelta en 150 ms, que no se siente como retraso. */
export const MS_POR_PASO_DE_GIRO = 50;
/** Lo que dura cada vista de en medio cuando alguien se vuelve a mirar algo (más pausado que el jugador). */
export const MS_POR_PASO_DE_MIRADA = 80;

/** Vistas en orden de ángulo de pantalla: 0° = derecha y +45° hacia abajo (la y de pantalla crece hacia abajo). */
const ANILLO: readonly ViewId[] = Object.freeze(['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right']);
const SECTOR = 45;
const NULO = 1e-6;

const mod8 = (n: number): number => ((n % 8) + 8) % 8;

/** Distancia entre dos ángulos en grados, de 0 a 180. */
function distanciaAngular(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

/** Pasos de 45° entre dos vistas por el camino corto (0 a 4). */
function separacion(a: ViewId, b: ViewId): number {
  const d = mod8(ANILLO.indexOf(b) - ANILLO.indexOf(a));
  return Math.min(d, 8 - d);
}

/**
 * Vista hacia la que apunta el vector (dx, dy) en pantalla, o null si es nulo. Con `anterior`, esa vista se
 * conserva mientras el vector no se aleje de su centro más de medio sector más el margen.
 */
export function direccionDeVector(dx: number, dy: number, anterior: ViewId | null): ViewId | null {
  if (Math.hypot(dx, dy) < NULO) return null;
  const grados = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (anterior && distanciaAngular(grados, ANILLO.indexOf(anterior) * SECTOR) <= SECTOR / 2 + MARGEN_ANGULAR_GRADOS) {
    return anterior;
  }
  return ANILLO[mod8(Math.round(grados / SECTOR))];
}

/**
 * Vistas por las que pasa un giro de `desde` a `hacia`: sin `desde`, con `hacia` al final; vacío si no hay giro.
 * Va por el camino corto. En media vuelta pasa de frente a la cámara si uno de los dos caminos lo permite (de un
 * lado al otro); si no (de arriba a abajo), por el lado hacia el que está el objetivo (`dx` < 0, la izquierda).
 */
export function pasosDeGiro(desde: ViewId, hacia: ViewId, dx = 0): ViewId[] {
  const i = ANILLO.indexOf(desde);
  const d = mod8(ANILLO.indexOf(hacia) - i);
  const camino = (sentido: 1 | -1, n: number): ViewId[] => Array.from({ length: n }, (_, k) => ANILLO[mod8(i + sentido * (k + 1))]);
  if (d === 0) return [];
  if (d < 4) return camino(1, d);
  if (d > 4) return camino(-1, 8 - d);
  const horario = camino(1, 4);
  const antihorario = camino(-1, 4);
  const deFrente = (c: ViewId[]): boolean => c.slice(0, -1).includes('down');
  if (deFrente(horario) !== deFrente(antihorario)) return deFrente(horario) ? horario : antihorario;
  const porIzquierda = horario.includes('left') ? horario : antihorario;
  const porDerecha = porIzquierda === horario ? antihorario : horario;
  return dx < 0 ? porIzquierda : porDerecha;
}

export interface Mirada {
  /** La vista que se dibuja ahora (durante un giro, una de las de en medio). */
  readonly actual: ViewId;
  /** Hacia donde termina el giro: la dirección que manda el movimiento. */
  readonly destino: ViewId;
  /** Vecina de `destino` que pide el movimiento y aún no se confirma, y cuánto lleva pidiéndose. */
  readonly candidata: ViewId | null;
  readonly candidataMs: number;
  /** Vistas que faltan del giro en curso y cuánto lleva la que se ve. */
  readonly giro: readonly ViewId[];
  readonly giroMs: number;
  /** Si el cuadro anterior hubo movimiento: arrancar desde quieto no espera el retardo de la vecina. */
  readonly enMovimiento: boolean;
}

export interface OpcionesMirada {
  /** Milisegundos de cada vista de en medio en un giro (`MS_POR_PASO_DE_GIRO` por defecto). */
  msPorPaso?: number;
  /** Milisegundos que una vecina debe pedirse para confirmarse (`RETARDO_VECINA_MS` por defecto). */
  retardoVecinaMs?: number;
  /** «Reducir movimiento»: el giro llega de una vez. */
  reducirMovimiento?: boolean;
}

export function miradaInicial(direccion: ViewId = 'down'): Mirada {
  return { actual: direccion, destino: direccion, candidata: null, candidataMs: 0, giro: [], giroMs: 0, enMovimiento: false };
}

/** Nuevo destino: el giro sale de la vista que se ve ahora. */
function girar(m: Mirada, hacia: ViewId, dx: number, reducir: boolean): Mirada {
  const pasos = reducir ? [] : pasosDeGiro(m.actual, hacia, dx);
  return {
    actual: pasos[0] ?? hacia, destino: hacia, candidata: null, candidataMs: 0,
    giro: pasos.slice(1), giroMs: 0, enMovimiento: true,
  };
}

/** Un cuadro: el giro en curso avanza `deltaMs` y luego el vector (dx, dy) del movimiento decide el destino. */
export function actualizarMirada(m: Mirada, dx: number, dy: number, deltaMs: number, opciones: OpcionesMirada = {}): Mirada {
  const msPorPaso = Math.max(1, opciones.msPorPaso ?? MS_POR_PASO_DE_GIRO);
  const retardo = opciones.retardoVecinaMs ?? RETARDO_VECINA_MS;
  const reducir = opciones.reducirMovimiento === true;
  const delta = Math.max(0, deltaMs);

  let actual = m.actual;
  let giro = m.giro;
  let giroMs = m.giroMs;
  if (giro.length) {
    if (reducir) {
      actual = m.destino;
      giro = [];
      giroMs = 0;
    } else {
      const quedan = [...giro];
      giroMs += delta;
      while (quedan.length && giroMs >= msPorPaso) {
        actual = quedan.shift() as ViewId;
        giroMs -= msPorPaso;
      }
      giro = quedan;
      if (!giro.length) giroMs = 0;
    }
  }
  const avanzada: Mirada = { ...m, actual, giro, giroMs };

  const pedida = direccionDeVector(dx, dy, m.destino);
  if (pedida === null) return { ...avanzada, candidata: null, candidataMs: 0, enMovimiento: false };
  if (pedida === m.destino) return { ...avanzada, candidata: null, candidataMs: 0, enMovimiento: true };
  if (separacion(m.destino, pedida) === 1 && m.enMovimiento) {
    // El primer cuadro no cuenta: con cuadros lentos (equipo sin GPU) un solo cuadro con una tecla ya duraría el retardo.
    const pedidaMs = m.candidata === pedida ? m.candidataMs + delta : 0;
    if (pedidaMs < retardo) return { ...avanzada, candidata: pedida, candidataMs: pedidaMs, enMovimiento: true };
  }
  return girar(avanzada, pedida, dx, reducir);
}

/**
 * Se vuelve hacia `vista` (el ancla de un NPC, la flecha de la cruceta, la orientación de un dato): el giro sale de la
 * vista que se ve y sigue avanzando con `actualizarMirada`. `dx` elige el lado de una media vuelta de arriba a abajo.
 * Queda como quieta, así que el siguiente movimiento no espera el retardo de la vecina.
 */
export function mirarHacia(m: Mirada, vista: ViewId, opciones: OpcionesMirada = {}, dx = 0): Mirada {
  if (vista === m.destino) return m;
  return { ...girar(m, vista, dx, opciones.reducirMovimiento === true), enMovimiento: false };
}

/**
 * Orientación escrita en un dato (`facing` del mundo, `orientacion` del documento): una de las 8 vistas del kit; lo demás,
 * de frente. Solo los ids del kit, como guarda el servidor (la biblioteca traduce su «mirando» al copiar la sala).
 */
export function orientacionDeDato(raw: unknown): ViewId {
  return typeof raw === 'string' && (ANILLO as readonly string[]).includes(raw) ? (raw as ViewId) : 'down';
}
