import { NpcMotionBehavior } from '../../core/models/simulation.model';
import {
  AmbientMotionState,
  NPC_MOTION_STRATEGIES,
  NpcTargetContext,
  nextAmbientStep,
} from './motion-strategies';
import { MovementPattern } from './scene-motion.util';

/**
 * L-01 · Principio de sustitución de Liskov (SOLID) sobre las estrategias de movimiento.
 *
 * La escena trata a todas las estrategias por igual: pide un destino y da el paso. Esa confianza
 * solo es legítima si **cada** estrategia cumple el mismo contrato, no solo la que alguien miró.
 * Estas pruebas recorren el registro completo (`NPC_MOTION_STRATEGIES`): una conducta nueva que se
 * sume ahí entra sola a la lista y tiene que cumplirlas. Lo propio de cada regla (a dónde va) lo
 * prueban `motion-strategies.spec.ts` y `game-world.npc-motion.spec.ts`.
 */

const ZONE = { x: 50, y: 50, width: 100, height: 100 };
const BEHAVIORS = Object.keys(NPC_MOTION_STRATEGIES) as NpcMotionBehavior[];

/** Azar determinista: devuelve la secuencia dada y luego repite el último valor. */
function seq(...values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as object)) deepFreeze(inner);
  }
  return value;
}

function finitePoint(point: { x: number; y: number } | null): boolean {
  return point === null || (Number.isFinite(point.x) && Number.isFinite(point.y));
}

/** Una malla de situaciones: con y sin anclas, jugador lejos / cerca / ausente, camino libre / bloqueado. */
function contexts(): Array<[string, () => NpcTargetContext]> {
  const out: Array<[string, () => NpcTargetContext]> = [];
  const anchorSets: Array<[string, NpcTargetContext['anchors']]> = [
    ['sin anclas', undefined], ['anclas vacías', []], ['dos anclas', [{ x: 60, y: 60 }, { x: 140, y: 140 }]],
  ];
  const players: Array<[string, NpcTargetContext['player']]> = [
    ['sin jugador', null], ['jugador cerca', { x: 102, y: 100 }], ['jugador lejos', { x: 900, y: 900 }],
  ];
  const rands: Array<[string, () => number]> = [
    ['azar 0', () => 0], ['azar medio', () => 0.5], ['azar casi 1', () => 0.999999],
  ];
  const blocked: Array<[string, boolean]> = [['camino libre', false], ['todo bloqueado', true]];
  for (const [anchorName, anchors] of anchorSets) {
    for (const [playerName, player] of players) {
      for (const [randName, rand] of rands) {
        for (const [blockedName, isBlocked] of blocked) {
          out.push([
            `${anchorName}, ${playerName}, ${randName}, ${blockedName}`,
            () => ({
              zone: ZONE, anchors, anchorIdx: 0, from: { x: 100, y: 100 }, player,
              rand, isBlocked: () => isBlocked,
            }),
          ]);
        }
      }
    }
  }
  return out;
}

describe('L-01 · cada estrategia de movimiento de personas cumple el mismo contrato', () => {
  it('el registro cubre toda la unión de comportamientos (no queda ninguno sin estrategia)', () => {
    expect(BEHAVIORS.length).toBeGreaterThanOrEqual(6);
    for (const behavior of BEHAVIORS) {
      expect(typeof NPC_MOTION_STRATEGIES[behavior].nextTarget).toBe('function');
      expect(typeof NPC_MOTION_STRATEGIES[behavior].anchorAfterArrival).toBe('function');
    }
  });

  describe.each(BEHAVIORS)('%s', behavior => {
    const strategy = NPC_MOTION_STRATEGIES[behavior];

    it(`devuelve un punto finito o null en las ${contexts().length} situaciones de la malla`, () => {
      for (const [name, build] of contexts()) {
        expect(finitePoint(strategy.nextTarget(build())), name).toBe(true);
      }
    });

    it('no modifica el contexto que recibe (se congela antes de llamar)', () => {
      for (const [name, build] of contexts()) {
        const frozen = deepFreeze(build());

        expect(() => strategy.nextTarget(frozen), name).not.toThrow();
      }
    });

    it('es determinista: el mismo contexto y el mismo azar dan el mismo destino', () => {
      const make = () => ({
        zone: ZONE, anchors: [{ x: 60, y: 60 }, { x: 140, y: 140 }], anchorIdx: 1, from: { x: 100, y: 100 },
        player: { x: 102, y: 100 }, rand: seq(0.3, 0.8, 0.1, 0.9, 0.4, 0.6, 0.2, 0.7), isBlocked: () => false,
      });

      expect(strategy.nextTarget(make())).toEqual(strategy.nextTarget(make()));
    });

    it('solo pregunta por obstáculos con coordenadas finitas', () => {
      const asked: Array<[number, number]> = [];
      const ctx: NpcTargetContext = {
        zone: ZONE, anchors: [{ x: 60, y: 60 }], anchorIdx: 0, from: { x: 100, y: 100 }, player: { x: 102, y: 100 },
        rand: seq(0.2, 0.7), isBlocked: (x, y) => { asked.push([x, y]); return false; },
      };

      strategy.nextTarget(ctx);

      for (const [x, y] of asked) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      }
    });

    it.each([0, 1, 3])('anchorAfterArrival devuelve un índice entero válido con %i anclas', count => {
      for (let idx = 0; idx < Math.max(count, 1); idx++) {
        const next = strategy.anchorAfterArrival(idx, count);

        expect(Number.isInteger(next)).toBe(true);
        if (count > 0) {
          expect(next).toBeGreaterThanOrEqual(0);
          expect(next).toBeLessThan(count);
        } else {
          expect(next).toBe(idx);
        }
      }
    });
  });
});

const PATTERNS: Array<[string, MovementPattern]> = [
  ['idle', { type: 'idle' }],
  ['wander de radio 0', { type: 'wander', radius: 0 }],
  ['wander de radio 28', { type: 'wander', radius: 28 }],
  ['patrol sin puntos', { type: 'patrol', points: [] }],
  ['patrol de un punto', { type: 'patrol', points: [[10, 20]] }],
  ['patrol de tres puntos', { type: 'patrol', points: [[10, 20], [30, 40], [50, 60]] }],
];

describe('L-01 · cada patrón de los objetos con vida ambiental cumple el mismo contrato', () => {
  const origin = { x: 200, y: 300 };

  it.each(PATTERNS)('%s: devuelve un destino finito o null y un índice entero no negativo', (_name, pattern) => {
    for (const patrolIdx of [0, 1, 2, 7]) {
      const step = nextAmbientStep(pattern, { origin, patrolIdx }, seq(0.1, 0.9));

      expect(finitePoint(step.target)).toBe(true);
      expect(Number.isInteger(step.patrolIdx)).toBe(true);
      expect(step.patrolIdx).toBeGreaterThanOrEqual(0);
    }
  });

  it.each(PATTERNS)('%s: no modifica el patrón ni el estado que recibe', (_name, pattern) => {
    const state: AmbientMotionState = { origin, patrolIdx: 1 };

    expect(() => nextAmbientStep(deepFreeze(structuredClone(pattern)), deepFreeze({ ...state }), seq(0.3, 0.6)))
      .not.toThrow();
  });

  it.each(PATTERNS)('%s: es determinista con el mismo azar', (_name, pattern) => {
    const state: AmbientMotionState = { origin, patrolIdx: 1 };

    expect(nextAmbientStep(pattern, state, seq(0.3, 0.6))).toEqual(nextAmbientStep(pattern, state, seq(0.3, 0.6)));
  });

  it('solo la patrulla mueve el índice, y lo deja dentro de sus puntos', () => {
    for (const [, pattern] of PATTERNS) {
      const step = nextAmbientStep(pattern, { origin, patrolIdx: 1 }, seq(0.5, 0.5));

      if (pattern.type === 'patrol' && pattern.points.length > 0) {
        expect(step.patrolIdx).toBeLessThan(pattern.points.length);
        expect(pattern.points.map(([x, y]) => `${x},${y}`)).toContain(`${step.target!.x},${step.target!.y}`);
      } else {
        expect(step.patrolIdx).toBe(1);
      }
    }
  });

  it('idle nunca da destino y wander no se aleja de su origen más que su radio', () => {
    expect(nextAmbientStep({ type: 'idle' }, { origin, patrolIdx: 0 }, seq(0.2, 0.8)).target).toBeNull();
    for (const radius of [0, 28, 100]) {
      for (const rand of [seq(0, 0), seq(0.25, 0.5), seq(0.75, 0.999999)]) {
        const target = nextAmbientStep({ type: 'wander', radius }, { origin, patrolIdx: 0 }, rand).target!;

        expect(Math.hypot(target.x - origin.x, target.y - origin.y)).toBeLessThanOrEqual(radius + 1e-9);
      }
    }
  });
});
