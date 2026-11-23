/**
 * Cámara del juego (bloque M1): decide dónde mira y a qué zoom, sin Phaser. Se dirige como en el cine (vara de
 * calidad, regla 7): tres planos, todos a zoom ENTERO en reposo (todos los píxeles miden lo mismo).
 *
 * - Plano general: toda la sala (o lo más que cabe). Es el que se ve al entrar, antes de cerrarse sobre el personaje.
 * - Plano de caminar: un paso más cerca; sigue al personaje con una zona muerta central y se detiene en los bordes.
 * - Plano cercano: un paso más; al hablar (los dos), al revisar un objeto y en la reacción (quien reacciona). Solo se
 *   acerca si las cabezas caben entre las franjas y sobre el cuadro de diálogo; si no, se queda más abierto.
 *
 * Entra la posición del personaje, la sala, la vista física y el momento; sale el centro (px de mundo) y el zoom.
 * Entre un plano y otro la escena viaja con `enViaje` (arranque y llegada suaves, zoom geométrico); el viaje puede
 * pasar por factores intermedios, y la escena lo dibuja escalando el lienzo ya compuesto, no cada dibujo.
 */
import { integerZoom } from '../pixel-scale.util';

/** Mundo mínimo (px) que deja ver el plano de caminar: algo más de media sala de 960 × 528. */
export const MIN_CAMINAR = { ancho: 560, alto: 280 } as const;
/** Mundo mínimo libre (px) para que la vista cercana manual (Z) suba un paso. */
export const MIN_CERCA = { ancho: 300, alto: 140 } as const;
/** Fracción del mundo visible, en cada eje, que ocupa la zona muerta al explorar. */
export const ZONA_MUERTA = 0.2;
/** La cámara mira este tanto por encima de los pies de una persona: el centro del cuerpo, no el piso. */
export const FOCO_PERSONA = 34;
/** Y por encima de la base de un objeto. */
export const FOCO_OBJETO = 16;
/** Aire a los lados y arriba/abajo de los cuerpos al encuadrar. */
export const MARGEN_LADO = 16;
export const MARGEN_ALTO = 12;
/** Medio ancho y alto del cuadro de un personaje del kit (48 × 72). */
export const MEDIO_CUERPO = 24;
export const ALTO_CUERPO = 72;
/** Aire entre los pies más bajos y el borde superior del cuadro de diálogo. */
export const MARGEN_PIES = 8;
/** Suavidad del seguimiento al caminar: cada cuadro recorre 1 − e^(−TASA·dt) de lo que falta (dt en segundos). */
export const TASA = 6;
/** Aire (px CSS) entre un cuerpo y la placa de la interfaz que lo taparía. */
export const AIRE_PLACA = 6;

export interface Punto { x: number; y: number }

/** Una placa de la interfaz sobre el lienzo (bloque U1), en px físicos desde la esquina superior izquierda de la vista. */
export interface Caja { x: number; y: number; ancho: number; alto: number }

/**
 * Lienzo en px físicos (cam.width/height), su devicePixelRatio y lo que la interfaz tapa (px físicos): abajo el cuadro
 * de diálogo o la franja inferior; arriba la franja superior. `placas`: las cajas de la interfaz que quedan sobre el
 * mundo al explorar (esquinas, carril y pie, bloque U1); el encuadre no deja cuerpos bajo ellas.
 */
export interface Vista {
  ancho: number; alto: number; dpr: number; cubiertoAbajo: number; cubiertoArriba?: number; placas?: readonly Caja[];
}

export interface Sala { ancho: number; alto: number }

export type Momento =
  | { tipo: 'explorar' }
  /** Plano general al entrar a una sala. */
  | { tipo: 'general' }
  /** Hablar y decidir con una persona: `con` son sus pies. */
  | { tipo: 'conversacion'; con: Punto }
  /** La reacción a una respuesta: la cámara va a quien reacciona (`de` son sus pies). */
  | { tipo: 'reaccion'; de: Punto }
  /** Revisar un objeto: `en` es su base. */
  | { tipo: 'objeto'; en: Punto };

export interface EntradaCamara {
  /** Pies del personaje del estudiante. */
  jugador: Punto;
  sala: Sala;
  vista: Vista;
  momento: Momento;
  /** Vista cercana manual (tecla Z): caminar un paso más cerca. */
  cercana: boolean;
  /** Acercamiento automático en los momentos (ajuste; encendido por defecto). */
  acercarAuto: boolean;
  /** Pies de lo que está al alcance (persona, puerta u objeto): tampoco queda bajo una placa. */
  cerca?: Punto | null;
}

export interface EstadoCamara { centro: Punto; zoom: number }

const tapadoAbajo = (v: Vista) => Math.max(0, v.cubiertoAbajo);
const tapadoArriba = (v: Vista) => Math.max(0, v.cubiertoArriba ?? 0);
const libre = (v: Vista) => Math.max(0, v.alto - tapadoAbajo(v) - tapadoArriba(v));

/** Zoom entero del plano general: el mayor que deja ver al menos el 75 % de la sala (spec §8.3). */
export function zoomGeneral(vista: Vista, sala: Sala): number {
  return integerZoom(vista.ancho, vista.alto, sala.ancho, sala.alto);
}

/** Zoom entero del plano de caminar: el mayor que aún deja ver `MIN_CAMINAR`; nunca más abierto que el general. */
export function zoomCaminar(vista: Vista, sala: Sala): number {
  const k = Math.min(Math.floor(vista.ancho / MIN_CAMINAR.ancho), Math.floor(vista.alto / MIN_CAMINAR.alto));
  return Math.max(1, zoomGeneral(vista, sala), k);
}

/** Zoom entero de la vista cercana manual: un paso más que caminar si aún se ve `MIN_CERCA`. */
export function zoomCercano(vista: Vista, caminar: number): number {
  const k = caminar + 1;
  return vista.ancho / k >= MIN_CERCA.ancho && vista.alto / k >= MIN_CERCA.alto ? k : caminar;
}

/** El mayor zoom entre `desde` y `minimo` (de a uno hacia abajo) en el que un recuadro de mundo cabe en lo libre de la vista. */
function mayorQueCabe(desde: number, minimo: number, ancho: number, alto: number, vista: Vista): number {
  for (let k = desde; k > minimo; k--) {
    if (ancho * k <= vista.ancho && alto * k <= libre(vista)) return k;
  }
  return minimo;
}

/** Mueve `centro` lo justo para que `foco` quede a menos de `margen` de él. */
function seguir(centro: number, foco: number, margen: number): number {
  if (foco > centro + margen) return foco - margen;
  if (foco < centro - margen) return foco + margen;
  return centro;
}

/** Recorta un centro para que la ventana de medio tamaño `mitad` no salga de [min, max]; si no cabe, el centro del tramo. */
function limitar(centro: number, mitad: number, min: number, max: number): number {
  if (max - min <= 2 * mitad) return (min + max) / 2;
  return Math.min(max - mitad, Math.max(min + mitad, centro));
}

/** Dónde debe mirar la cámara y con qué zoom. `previo` es el estado actual (para la zona muerta); null en un corte. */
export function objetivoCamara(e: EntradaCamara, previo: EstadoCamara | null): EstadoCamara {
  const { vista, sala, momento, jugador } = e;
  const general = zoomGeneral(vista, sala);
  const caminar = zoomCaminar(vista, sala);
  const base = e.cercana ? zoomCercano(vista, caminar) : caminar;
  // Con el acercamiento automático, un paso más cerca; siempre se abre lo que haga falta para que quepan las cabezas.
  const desde = e.acercarAuto ? base + 1 : base;

  let zoom = base;
  let foco: Punto = { x: jugador.x, y: jugador.y - FOCO_PERSONA };
  // Los pies más bajos del encuadre: el cuadro de diálogo nunca debe taparlos.
  let pies = jugador.y;
  if (momento.tipo === 'general') {
    zoom = general;
  } else if (momento.tipo === 'conversacion') {
    const otro = momento.con;
    pies = Math.max(jugador.y, otro.y);
    foco = { x: (jugador.x + otro.x) / 2, y: (jugador.y + otro.y) / 2 - FOCO_PERSONA };
    const ancho = Math.abs(otro.x - jugador.x) + 2 * (MEDIO_CUERPO + MARGEN_LADO);
    const alto = Math.abs(otro.y - jugador.y) + ALTO_CUERPO + 2 * MARGEN_ALTO;
    zoom = mayorQueCabe(desde, general, ancho, alto, vista);
  } else if (momento.tipo === 'reaccion') {
    pies = momento.de.y;
    foco = { x: momento.de.x, y: momento.de.y - FOCO_PERSONA };
    zoom = mayorQueCabe(desde, general, 2 * (MEDIO_CUERPO + MARGEN_LADO), ALTO_CUERPO + 2 * MARGEN_ALTO, vista);
  } else if (momento.tipo === 'objeto') {
    pies = momento.en.y;
    foco = { x: momento.en.x, y: momento.en.y - FOCO_OBJETO };
    zoom = mayorQueCabe(desde, general, 96, 96, vista);
  }

  const visibleAncho = vista.ancho / zoom;
  const visibleAlto = vista.alto / zoom;
  const abajo = tapadoAbajo(vista) / zoom;
  const arriba = tapadoArriba(vista) / zoom;
  // El foco va al centro de lo que las franjas y el cuadro de diálogo dejan libre.
  const corrimiento = (abajo - arriba) / 2;

  let x = foco.x;
  let y = foco.y + corrimiento;
  if (momento.tipo === 'explorar' && previo) {
    x = seguir(previo.centro.x, foco.x, (ZONA_MUERTA * visibleAncho) / 2);
    y = seguir(previo.centro.y - corrimiento, foco.y, (ZONA_MUERTA * (visibleAlto - abajo - arriba)) / 2) + corrimiento;
  }

  // La cámara se queda dentro de la sala; solo baja de su borde lo justo para que los pies queden sobre el cuadro.
  const fondo = Math.max(sala.alto, pies + MARGEN_PIES + abajo);
  const centro = {
    x: limitar(x, visibleAncho / 2, 0, sala.ancho),
    y: limitar(y, visibleAlto / 2, 0, fondo),
  };
  return { centro: esquivarPlacas(centro, zoom, vista, cuerposQueImportan(e)), zoom };
}

/** Los cuerpos que una placa no debe tapar: quien juega y lo que tiene al alcance, con quien habla, quien reacciona. */
function cuerposQueImportan(e: EntradaCamara): Punto[] {
  const m = e.momento;
  if (m.tipo === 'general') return [];
  if (m.tipo === 'conversacion') return [e.jugador, m.con];
  if (m.tipo === 'reaccion') return [m.de];
  if (m.tipo === 'objeto') return [e.jugador, m.en];
  return e.cerca ? [e.jugador, e.cerca] : [e.jugador];
}

/**
 * Zona segura (bloque U1): si un cuerpo (su cuadro de 48 × 72 sobre los pies) cae bajo una placa de la interfaz, el
 * encuadre se corre lo mínimo para sacarlo, en el eje y el sentido que pidan menos, sin que el cuerpo salga de lo que
 * dejan libre las franjas. Nunca se corre más que el tamaño de la placa: pasado el borde de la sala se ve el vacío, que
 * queda bajo la misma placa. Sin placas devuelve el centro tal cual.
 */
export function esquivarPlacas(centro: Punto, zoom: number, vista: Vista, cuerpos: readonly Punto[]): Punto {
  const placas = vista.placas ?? [];
  if (placas.length === 0 || cuerpos.length === 0 || !(zoom > 0)) return centro;
  const aire = AIRE_PLACA * vista.dpr;
  const arribaLibre = tapadoArriba(vista);
  const abajoLibre = vista.alto - tapadoAbajo(vista);
  let cx = centro.x;
  let cy = centro.y;
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    let movio = false;
    for (const pie of cuerpos) {
      const r = {
        x: (pie.x - MEDIO_CUERPO - cx) * zoom + vista.ancho / 2,
        y: (pie.y - ALTO_CUERPO - cy) * zoom + vista.alto / 2,
        ancho: 2 * MEDIO_CUERPO * zoom,
        alto: ALTO_CUERPO * zoom,
      };
      for (const p of placas) {
        const tapa = r.x < p.x + p.ancho + aire && r.x + r.ancho > p.x - aire
          && r.y < p.y + p.alto + aire && r.y + r.alto > p.y - aire;
        if (!tapa) continue;
        const salida = [
          { dx: p.x + p.ancho + aire - r.x, dy: 0 },
          { dx: p.x - aire - (r.x + r.ancho), dy: 0 },
          { dx: 0, dy: p.y + p.alto + aire - r.y },
          { dx: 0, dy: p.y - aire - (r.y + r.alto) },
        ].filter(o => r.x + o.dx >= 0 && r.x + r.ancho + o.dx <= vista.ancho
          && r.y + o.dy >= arribaLibre && r.y + r.alto + o.dy <= abajoLibre)
          .sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy)))[0];
        if (!salida) continue;
        // El contenido se mueve (dx, dy) en pantalla: la cámara, lo contrario en mundo.
        cx -= salida.dx / zoom;
        cy -= salida.dy / zoom;
        r.x += salida.dx;
        r.y += salida.dy;
        movio = true;
      }
    }
    if (!movio) break;
  }
  const topeX = Math.max(...placas.map(p => p.ancho)) / zoom;
  const topeY = Math.max(...placas.map(p => p.alto)) / zoom;
  return {
    x: centro.x + Math.max(-topeX, Math.min(topeX, cx - centro.x)),
    y: centro.y + Math.max(-topeY, Math.min(topeY, cy - centro.y)),
  };
}

/** Ya llegó: el zoom a menos de una centésima y el centro a menos de medio píxel. */
export function asentada(actual: EstadoCamara, objetivo: EstadoCamara): boolean {
  return Math.abs(actual.zoom - objetivo.zoom) < 0.01
    && Math.hypot(actual.centro.x - objetivo.centro.x, actual.centro.y - objetivo.centro.y) < 0.5;
}

/**
 * Seguimiento al caminar: un cuadro hacia el objetivo, rápido al principio y suave al llegar. Con movimiento reducido,
 * o tras una pausa de un segundo o más (pestaña oculta), es un corte. Al asentarse devuelve el objetivo exacto.
 */
export function avanzarCamara(actual: EstadoCamara, objetivo: EstadoCamara, dtMs: number, reducido: boolean): EstadoCamara {
  const exacto = { centro: { ...objetivo.centro }, zoom: objetivo.zoom };
  if (reducido || dtMs >= 1000) return exacto;
  if (!(dtMs > 0)) return actual;
  const f = 1 - Math.exp((-TASA * dtMs) / 1000);
  const siguiente: EstadoCamara = {
    centro: {
      x: actual.centro.x + (objetivo.centro.x - actual.centro.x) * f,
      y: actual.centro.y + (objetivo.centro.y - actual.centro.y) * f,
    },
    zoom: actual.zoom + (objetivo.zoom - actual.zoom) * f,
  };
  return asentada(siguiente, objetivo) ? exacto : siguiente;
}

// ── Viajes entre planos ────────────────────────────────────────────────────────────────────────────────────────────

/** Curva de un viaje de cámara: arranque y llegada suaves (cúbica de entrada y salida). */
export function suavizar(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/**
 * Punto `t` (0 a 1, ya sin suavizar) del viaje de `desde` a `hacia`: el centro avanza con la curva y el zoom lo hace
 * de forma geométrica (pasar de ×1 a ×2 se siente igual de rápido que de ×2 a ×4). En 1 devuelve `hacia` exacto.
 */
export function enViaje(desde: EstadoCamara, hacia: EstadoCamara, t: number): EstadoCamara {
  if (t >= 1) return { centro: { ...hacia.centro }, zoom: hacia.zoom };
  const e = suavizar(t);
  return {
    centro: {
      x: desde.centro.x + (hacia.centro.x - desde.centro.x) * e,
      y: desde.centro.y + (hacia.centro.y - desde.centro.y) * e,
    },
    zoom: desde.zoom * Math.pow(hacia.zoom / desde.zoom, e),
  };
}

/**
 * El viaje, sin mostrar nunca más fuera de la sala que lo que ya mostraban sus dos extremos: a un zoom intermedio el
 * centro interpolado podía asomar el vacío bajo la sala (los dos centros se recortaron cada uno para su propio zoom).
 */
export function enViajeDentro(desde: EstadoCamara, hacia: EstadoCamara, t: number, vista: Vista, sala: Sala): EstadoCamara {
  const e = enViaje(desde, hacia, t);
  if (t >= 1) return e;
  const borde = (s: EstadoCamara) => {
    const mx = vista.ancho / (2 * s.zoom);
    const my = vista.alto / (2 * s.zoom);
    return { x0: s.centro.x - mx, x1: s.centro.x + mx, y0: s.centro.y - my, y1: s.centro.y + my };
  };
  const a = borde(desde);
  const b = borde(hacia);
  return {
    zoom: e.zoom,
    centro: {
      x: limitar(e.centro.x, vista.ancho / (2 * e.zoom), Math.min(0, a.x0, b.x0), Math.max(sala.ancho, a.x1, b.x1)),
      y: limitar(e.centro.y, vista.alto / (2 * e.zoom), Math.min(0, a.y0, b.y0), Math.max(sala.alto, a.y1, b.y1)),
    },
  };
}

/** Cuánto dura (ms) el viaje de un momento a otro. */
export function duracionDeViaje(desde: Momento['tipo'], hacia: Momento['tipo']): number {
  if (desde === 'general') return 1400;          // el plano general se cierra sobre el personaje, sin prisa
  if (hacia === 'conversacion') return desde === 'reaccion' ? 700 : 1100;   // al hablar se acerca despacio
  if (hacia === 'reaccion') return 700;          // va a quien reacciona
  if (hacia === 'objeto') return 800;
  if (hacia === 'explorar') return 900;          // al volver a caminar la cámara se abre
  return 800;
}

/** Cuánto se sostiene (ms) el plano general al entrar a una sala: más la primera vez que se la ve. */
export function esperaDelGeneral(yaVisitada: boolean): number {
  return yaVisitada ? 350 : 900;
}

/**
 * Cómo se dibuja un zoom en viaje sin que los píxeles bailen: la escena se dibuja al entero de abajo (`base`) y el
 * lienzo ya compuesto se escala entero por `escala` (1 en reposo).
 */
export function comoDibujar(zoom: number): { base: number; escala: number } {
  const cerca = Math.round(zoom);
  if (Math.abs(zoom - cerca) < 0.001) return { base: Math.max(1, cerca), escala: 1 };
  const base = Math.max(1, Math.floor(zoom));
  return { base, escala: zoom / base };
}

// ── Sin saltos ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Lo más que la vista se mueve en pantalla, en píxeles del lienzo por milisegundo (V5). Un viaje entre planos o el
 * seguimiento al caminar quedan muy por debajo (unos 0,3 a 1 px/ms en su punto más rápido); solo un objetivo que cambia
 * de golpe (la placa que se esquiva, una persona que aparece) lo alcanza.
 */
export const VELOCIDAD_MAXIMA = 2;

/**
 * El cuadro siguiente sin saltos: si el centro se movería en pantalla más de `VELOCIDAD_MAXIMA × dt`, avanza solo eso en
 * la misma dirección (el encuadre final es el mismo; solo no se llega de golpe). El zoom no se toca. Con una pausa de un
 * segundo o más (pestaña oculta) no frena, igual que `avanzarCamara`; los cortes (sala nueva, movimiento reducido) no
 * pasan por aquí. Sin tiempo medido cuenta como un cuadro.
 */
export function sinSaltos(previo: EstadoCamara, siguiente: EstadoCamara, dtMs: number): EstadoCamara {
  if (dtMs >= 1000) return siguiente;
  const dt = dtMs > 0 ? dtMs : 16;
  const zoom = Math.max(siguiente.zoom, 0.0001);
  const dx = siguiente.centro.x - previo.centro.x;
  const dy = siguiente.centro.y - previo.centro.y;
  const enPantalla = Math.hypot(dx, dy) * zoom;
  const tope = VELOCIDAD_MAXIMA * dt;
  if (enPantalla <= tope) return siguiente;
  const f = tope / enPantalla;
  return { centro: { x: previo.centro.x + dx * f, y: previo.centro.y + dy * f }, zoom: siguiente.zoom };
}

