/**
 * La puerta de una sala por piezas (diseño, sección 4.4): cuándo se abre, qué cuadro muestra, cuál manda cuando hay varias
 * cerca y cómo se cruza. Funciones puras de tiempo: la escena solo les pasa los milisegundos y pinta lo que devuelven.
 *
 * - Cerca (menos de 56 px del umbral) se abre en cuatro cuadros; lejos se cierra.
 * - La apertura no es lineal (contrato de calidad, regla 6): arranca despacio, acelera y, en las puertas de hoja, rebota un
 *   cuadro al llegar al tope antes de asentarse. La corrediza y el paso abierto no rebotan.
 * - Cerrada con llave no se abre: al intentar cruzarla traquetea (asoma un cuadro y vuelve) y se corre 1 px a cada lado.
 * - Cruzar: velo de 150 ms, espera a que la sala nueva esté lista y velo de 150 ms de salida (300 ms en total).
 * - Movimiento reducido: la puerta cambia de estado de una vez, sin rebote, traqueteo ni velo.
 *
 * Sin dependencias y con sintaxis borrable: lo cargan el navegador y las pruebas en Node.
 */

/** px del umbral a los que la puerta se abre. */
export const ALCANCE_DE_PUERTA = 56;
/** px a los que una puerta abierta deja de ser la activa: un poco más que el alcance, para que no parpadee en el borde. */
export const SUELTA_DE_PUERTA = 60;
/** Cuánto más cerca tiene que estar otra puerta para quitarle el turno a la activa. */
export const HISTERESIS = 6;
/** Último cuadro: la puerta abierta del todo. */
export const CUADRO_ABIERTA = 3;
/** ms en que cada cuadro de la apertura deja paso al siguiente: lento al arrancar, rápido después (210 ms en total). */
const TRAMOS_DE_APERTURA = [90, 150, 210];
const APERTURA_MS = TRAMOS_DE_APERTURA[TRAMOS_DE_APERTURA.length - 1];
/** Rebote al llegar al tope: a los `REBOTE_DESDE` ms vuelve un cuadro atrás durante `REBOTE_MS` y se asienta. */
const REBOTE_DESDE = 40;
const REBOTE_MS = 50;
/** Traqueteo de la puerta cerrada con llave: cuatro golpes de 45 ms. */
export const MS_DE_SACUDIDA = 180;
const GOLPE_MS = 45;
/** Cada mitad del velo al cruzar. */
export const MS_DE_FUNDIDO = 150;
/** Hasta dónde avanza quien cruza, del umbral hacia la puerta, mientras el velo cae. */
const PASO_AL_CRUZAR = 24;

/** Cómo abre: de una hoja, de dos, corrediza o sin hoja. Las de hoja rebotan al llegar al tope. */
export type Hojas = 'una' | 'doble' | 'corrediza' | 'ninguna';

export interface EstadoDePuerta {
  /** ms recorridos de la apertura: 0 cerrada, 210 abierta del todo. */
  avance: number;
  /** ms desde que llegó al tope abriéndose (para el rebote); -1 si no está en el tope. */
  enTope: number;
  /** ms que le quedan al traqueteo. */
  sacudida: number;
}

export const PUERTA_CERRADA: EstadoDePuerta = { avance: 0, enTope: -1, sacudida: 0 };
export const PUERTA_ABIERTA: EstadoDePuerta = { avance: APERTURA_MS, enTope: REBOTE_DESDE + REBOTE_MS, sacudida: 0 };

export interface PasoDePuerta {
  dtMs: number;
  /** Quien juega está a su alcance y es la puerta activa. */
  cerca: boolean;
  /** Cerrada con llave (lo dice `door-status.util.ts`). */
  bloqueada: boolean;
  reducido: boolean;
}

/** El estado de la puerta `dtMs` después. */
export function avanzarPuerta(e: EstadoDePuerta, paso: PasoDePuerta): EstadoDePuerta {
  const abrir = paso.cerca && !paso.bloqueada;
  const sacudida = paso.reducido ? 0 : Math.max(0, e.sacudida - paso.dtMs);
  if (paso.reducido) return abrir ? { ...PUERTA_ABIERTA, sacudida } : { ...PUERTA_CERRADA, sacudida };
  const avance = Math.min(APERTURA_MS, Math.max(0, e.avance + (abrir ? paso.dtMs : -paso.dtMs)));
  let enTope = -1;
  if (abrir && avance === APERTURA_MS) {
    // El exceso de este paso cuenta como tiempo ya pasado en el tope.
    const sobra = e.enTope >= 0 ? e.enTope + paso.dtMs : e.avance + paso.dtMs - APERTURA_MS;
    enTope = Math.min(sobra, REBOTE_DESDE + REBOTE_MS);
  }
  return { avance, enTope, sacudida };
}

/** Intento de cruzar una puerta cerrada con llave: traquetea. Con movimiento reducido no se mueve. */
export function sacudir(e: EstadoDePuerta, reducido: boolean): EstadoDePuerta {
  return reducido ? e : { ...e, sacudida: MS_DE_SACUDIDA };
}

/** El cuadro de la tira que se ve (0 cerrada … 3 abierta). */
export function cuadroVisible(e: EstadoDePuerta, hojas: Hojas = 'una'): number {
  if (e.sacudida > 0) {
    // Traqueteo: asoma el primer cuadro en el primer y el tercer golpe.
    const golpe = Math.floor((MS_DE_SACUDIDA - e.sacudida) / GOLPE_MS);
    return golpe === 0 || golpe === 2 ? 1 : 0;
  }
  if (e.avance >= APERTURA_MS) {
    const rebota = hojas === 'una' || hojas === 'doble';
    return rebota && e.enTope >= REBOTE_DESDE && e.enTope < REBOTE_DESDE + REBOTE_MS ? CUADRO_ABIERTA - 1 : CUADRO_ABIERTA;
  }
  const cuadro = TRAMOS_DE_APERTURA.findIndex(limite => e.avance < limite);
  return cuadro === -1 ? CUADRO_ABIERTA : cuadro;
}

/** px que la puerta se corre en x mientras traquetea. */
export function desvioDeSacudida(e: EstadoDePuerta): number {
  if (e.sacudida <= 0) return 0;
  const golpe = Math.floor((MS_DE_SACUDIDA - e.sacudida) / GOLPE_MS);
  return [1, -1, 1, 0][golpe] ?? 0;
}

/** ¿Está abierta del todo? (Para la cuña de luz: entra cuando la puerta ya dejó pasar la luz.) */
export function abiertaDelTodo(e: EstadoDePuerta): boolean {
  return e.avance >= APERTURA_MS;
}

export interface UmbralDePuerta {
  id: string;
  /** Umbral de la puerta: el punto del piso desde el que se mide la cercanía y en el que aparece quien llega por ella. */
  umbral: readonly [number, number];
}

/**
 * La puerta que manda: la más cercana a menos de 56 px del umbral. La que ya mandaba sigue mientras esté a menos de 60 px
 * y ninguna otra la supere por más de 6 px; así, entre dos puertas vecinas, el aviso no parpadea.
 */
export function puertaActiva(puertas: readonly UmbralDePuerta[], jugador: { x: number; y: number }, actual: string | null): string | null {
  const distancia = (p: UmbralDePuerta) => Math.hypot(jugador.x - p.umbral[0], jugador.y - p.umbral[1]);
  let mejor: UmbralDePuerta | null = null;
  for (const p of puertas) if (distancia(p) < ALCANCE_DE_PUERTA && (!mejor || distancia(p) < distancia(mejor))) mejor = p;
  const sigue = actual === null ? undefined : puertas.find(p => p.id === actual);
  if (sigue && distancia(sigue) < SUELTA_DE_PUERTA && (!mejor || distancia(mejor) > distancia(sigue) - HISTERESIS)) return sigue.id;
  return mejor?.id ?? null;
}

// ── el cruce ────────────────────────────────────────────────────────────────────

export interface Cruce {
  /** `salida`: cae el velo. `espera`: velo puesto hasta que la sala nueva esté lista. `entrada`: se levanta. `fin`: terminó. */
  fase: 'salida' | 'espera' | 'entrada' | 'fin';
  /** ms dentro de la fase. */
  ms: number;
}

/** Empieza el cruce (solo lo pide la tecla E o el aviso: nadie cambia de sala por accidente). */
export function iniciarCruce(reducido: boolean): Cruce {
  return { fase: reducido ? 'espera' : 'salida', ms: 0 };
}

export function avanzarCruce(c: Cruce, dtMs: number, salaLista: boolean, reducido: boolean): Cruce {
  const ms = c.ms + dtMs;
  switch (c.fase) {
    case 'salida':
      return ms >= MS_DE_FUNDIDO ? avanzarCruce({ fase: 'espera', ms: 0 }, ms - MS_DE_FUNDIDO, salaLista, reducido) : { fase: 'salida', ms };
    case 'espera':
      if (!salaLista) return { fase: 'espera', ms };
      return reducido ? { fase: 'fin', ms: 0 } : { fase: 'entrada', ms: 0 };
    case 'entrada':
      return ms >= MS_DE_FUNDIDO ? { fase: 'fin', ms: 0 } : { fase: 'entrada', ms };
    default:
      return c;
  }
}

/** Opacidad del velo, de 0 a 1, por pasos de 1/8 (el velo también va por escalones). Con movimiento reducido no hay velo. */
export function opacidadDeCruce(c: Cruce, reducido = false): number {
  if (reducido) return 0;
  const escalon = (t: number) => Math.round(Math.min(1, Math.max(0, t)) * 8) / 8;
  if (c.fase === 'salida') return escalon(c.ms / MS_DE_FUNDIDO);
  if (c.fase === 'espera') return 1;
  if (c.fase === 'entrada') return escalon(1 - c.ms / MS_DE_FUNDIDO);
  return 0;
}

/** ¿Corre un cruce? Mientras tanto la cámara no hace zoom ni sigue (lo lee el bloque M1). */
export function cruceEnCurso(c: Cruce | null): boolean {
  return c !== null && c.fase !== 'fin';
}

/** Dónde va quien cruza mientras cae el velo: del umbral hacia la puerta, hasta 24 px. */
export function posicionAlCruzar(umbral: readonly [number, number], ancla: readonly [number, number], c: Cruce): [number, number] {
  const dx = ancla[0] - umbral[0], dy = ancla[1] - umbral[1];
  const largo = Math.hypot(dx, dy);
  if (largo === 0 || c.fase !== 'salida') return [umbral[0], umbral[1]];
  const avance = Math.min(largo, PASO_AL_CRUZAR) * Math.min(1, c.ms / MS_DE_FUNDIDO);
  return [Math.round(umbral[0] + (dx / largo) * avance), Math.round(umbral[1] + (dy / largo) * avance)];
}
