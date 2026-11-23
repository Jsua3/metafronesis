/**
 * Estrategias de movimiento del mundo vivo (P-10 · Strategy).
 *
 * Cada comportamiento de las personas (`NpcMotionBehavior`) y cada patrón de los objetos con vida
 * ambiental (`MovementPattern`) decide aquí su siguiente destino. La escena (Phaser) solo aporta el
 * azar, la posición de los actores y los obstáculos, y se ocupa de dar los pasos: este archivo no
 * importa Phaser, así que cada regla se prueba sola.
 *
 * Agregar un comportamiento nuevo es sumar una entrada al registro: el compilador exige que
 * `NPC_MOTION_STRATEGIES` cubra toda la unión `NpcMotionBehavior`, y la escena no cambia.
 */
import { NpcMotionAnchor, NpcMotionBehavior, NpcMovementZone } from '../../core/models/simulation.model';
import {
  AVOIDANT_TRIGGER_RANGE, MovementPattern, avoidantTarget, nextAnchorIndex, pickWanderTarget, pickZoneTarget,
} from './scene-motion.util';

export interface Point { x: number; y: number }

// ─── Personas (NPC) ───────────────────────────────────────────────────────────

/** Lo que una estrategia necesita saber para elegir el destino de una persona. */
export interface NpcTargetContext {
  readonly zone: NpcMovementZone;
  readonly anchors: readonly NpcMotionAnchor[] | undefined;
  /** Ancla en curso (solo la usan los comportamientos por anclas). */
  readonly anchorIdx: number;
  /** Dónde está la persona ahora. */
  readonly from: Point;
  /** Dónde está el jugador (null si todavía no hay). */
  readonly player: Point | null;
  readonly rand: () => number;
  readonly isBlocked: (x: number, y: number) => boolean;
}

export interface NpcMotionStrategy {
  /** Siguiente destino, o null si por ahora no lo hay (la persona espera). */
  nextTarget(ctx: NpcTargetContext): Point | null;
  /** Índice de ancla que sigue al llegar a un destino (solo las rutas por anclas lo avanzan). */
  anchorAfterArrival(anchorIdx: number, anchorCount: number): number;
}

/** Misma fórmula que `Phaser.Math.Distance.Between`, para decidir igual en el umbral exacto. */
function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

const keepAnchor = (anchorIdx: number): number => anchorIdx;

/** idle y attentive: la persona no se traslada (attentive solo gira), así que nunca hay destino. */
const stationary: NpcMotionStrategy = {
  nextTarget: () => null,
  anchorAfterArrival: keepAnchor,
};

/** subtle-wander: un punto cualquiera de su zona, si el camino está libre. */
const subtleWander: NpcMotionStrategy = {
  nextTarget({ zone, rand, isBlocked }) {
    const candidate = pickZoneTarget(zone, rand);
    return isBlocked(candidate.x, candidate.y) ? null : candidate;
  },
  anchorAfterArrival: keepAnchor,
};

/** pace y patrol: recorren las anclas autoradas en orden cíclico (sin consultar obstáculos). */
const anchorRoute: NpcMotionStrategy = {
  nextTarget({ anchors, anchorIdx }) {
    if (!anchors?.length) return null;
    const anchor = anchors[anchorIdx];
    return { x: anchor.x, y: anchor.y };
  },
  anchorAfterArrival: (anchorIdx, anchorCount) =>
    anchorCount > 0 ? nextAnchorIndex(anchorIdx, anchorCount) : anchorIdx,
};

/** avoidant: con el jugador cerca, un paso corto hacia el punto de su zona que más se aleja de él. */
const avoidant: NpcMotionStrategy = {
  nextTarget({ zone, from, player, rand, isBlocked }) {
    if (!player) return null;
    if (distance(player, from) > AVOIDANT_TRIGGER_RANGE) return null;
    const candidate = avoidantTarget(zone, from, player, rand);
    return isBlocked(candidate.x, candidate.y) ? null : candidate;
  },
  anchorAfterArrival: keepAnchor,
};

export const NPC_MOTION_STRATEGIES: Record<NpcMotionBehavior, NpcMotionStrategy> = {
  idle: stationary,
  attentive: stationary,
  'subtle-wander': subtleWander,
  pace: anchorRoute,
  patrol: anchorRoute,
  avoidant,
};

export function npcMotionStrategyFor(behavior: NpcMotionBehavior): NpcMotionStrategy {
  return NPC_MOTION_STRATEGIES[behavior];
}

// ─── Objetos con vida ambiental ───────────────────────────────────────────────

/** Lo que una estrategia ambiental lee del objeto que se mueve. */
export interface AmbientMotionState {
  readonly origin: Point;
  /** Punto de la patrulla en el que va (solo lo usa `patrol`). */
  readonly patrolIdx: number;
}

/** Resultado: el destino y el índice de patrulla con el que queda el objeto. */
export interface AmbientStep {
  readonly target: Point | null;
  readonly patrolIdx: number;
}

type PatternOf<K extends MovementPattern['type']> = Extract<MovementPattern, { type: K }>;

interface AmbientMotionStrategy<P extends MovementPattern> {
  nextTarget(pattern: P, state: AmbientMotionState, rand: () => number): AmbientStep;
}

const AMBIENT_STRATEGIES: { [K in MovementPattern['type']]: AmbientMotionStrategy<PatternOf<K>> } = {
  idle: {
    nextTarget: (_pattern, state) => ({ target: null, patrolIdx: state.patrolIdx }),
  },
  wander: {
    nextTarget: (pattern, state, rand) => ({
      target: pickWanderTarget(state.origin, pattern.radius, rand),
      patrolIdx: state.patrolIdx,
    }),
  },
  patrol: {
    nextTarget(pattern, state) {
      if (!pattern.points.length) return { target: null, patrolIdx: state.patrolIdx };
      // El índice avanza ANTES de elegir: el primer destino es el punto 1 y el 0 queda para el
      // final de la primera vuelta (comportamiento heredado; ver CAMBIOS_ADSI.md, P-10).
      const patrolIdx = (state.patrolIdx + 1) % pattern.points.length;
      const [x, y] = pattern.points[patrolIdx];
      return { target: { x, y }, patrolIdx };
    },
  },
};

/** Siguiente destino de un objeto con vida ambiental según su patrón (idle, wander o patrol). */
export function nextAmbientStep(pattern: MovementPattern, state: AmbientMotionState, rand: () => number): AmbientStep {
  const strategy = AMBIENT_STRATEGIES[pattern.type] as AmbientMotionStrategy<MovementPattern>;
  return strategy.nextTarget(pattern, state, rand);
}
