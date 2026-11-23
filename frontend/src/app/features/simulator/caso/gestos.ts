/**
 * Gestos de la reacción del personaje como estrategias puras (P-10 · Strategy), sobre los sprites actuales y sin arte
 * nuevo: cada gesto es una lista de tramos cortos que solo mueven posición y ángulo. La escena (Phaser) solo los
 * reproduce; este archivo no la importa. Agregar un gesto es sumar una entrada al registro: el compilador exige cubrir
 * toda la unión `Gesto`.
 */
import { type Gesto } from './vocabulario';

/**
 * Un tramo: `dx`/`dy` son el delta en px del mundo respecto del tramo anterior (la posición del tramo i es el origen
 * más la suma de dx/dy hasta i); `angulo` es la inclinación absoluta en grados; si se voltea el sprite; cuánto dura.
 */
export interface GestoPaso {
  dx: number;
  dy: number;
  angulo: number;
  voltear: boolean;
  ms: number;
}

export interface ContextoGesto {
  /** Hacia dónde queda el jugador respecto de la persona, por eje. */
  haciaJugador: { x: -1 | 0 | 1; y: -1 | 0 | 1 };
}

export interface EstrategiaGesto {
  pasos(ctx: ContextoGesto): readonly GestoPaso[];
}

/** Evita el cero negativo (`-8 * 0`) en los desplazamientos. */
const px = (n: number): number => n + 0;

function paso(dx: number, dy: number, angulo: number, ms: number): GestoPaso {
  return { dx: px(dx), dy: px(dy), angulo: px(angulo), voltear: false, ms };
}

function pasoYVuelta(distancia: number, ctx: ContextoGesto, sentido: 1 | -1): GestoPaso[] {
  const dx = distancia * ctx.haciaJugador.x * sentido;
  const dy = distancia * ctx.haciaJugador.y * sentido;
  return [paso(dx, dy, 0, 200), paso(-dx, -dy, 0, 200)];
}

export const ESTRATEGIAS_GESTO: Readonly<Record<Gesto, EstrategiaGesto>> = {
  'se-acerca': { pasos: ctx => pasoYVuelta(6, ctx, 1) },
  'se-aparta': { pasos: ctx => pasoYVuelta(8, ctx, -1) },
  asiente: {
    pasos: () => [
      paso(0, 2, 4, 120), paso(0, -2, 0, 120),
      paso(0, 2, 4, 120), paso(0, -2, 0, 120),
    ],
  },
  'baja-la-mirada': {
    pasos: () => [paso(0, 0, -6, 250), paso(0, 0, -6, 300), paso(0, 0, 0, 250)],
  },
  'se-agita': {
    pasos: () => [2, -4, 4, -4, 4, -4, 4, -2].map(dx => paso(dx, 0, 0, 50)),
  },
};

export function pasosDeGesto(gesto: Gesto, ctx: ContextoGesto, reduceMotion: boolean): readonly GestoPaso[] {
  return reduceMotion ? [] : ESTRATEGIAS_GESTO[gesto].pasos(ctx);
}

const SIN_DIRECCION: ContextoGesto = { haciaJugador: { x: 0, y: 0 } };

/** Lo que dura el gesto entero (no depende de la dirección). */
export function msDeGesto(gesto: Gesto): number {
  return ESTRATEGIAS_GESTO[gesto].pasos(SIN_DIRECCION).reduce((s, p) => s + p.ms, 0);
}
