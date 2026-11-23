import { NpcMotionBehavior } from '../../core/models/simulation.model';
import {
  AmbientMotionState,
  NPC_MOTION_STRATEGIES,
  NpcTargetContext,
  nextAmbientStep,
  npcMotionStrategyFor,
} from './motion-strategies';
import { AVOIDANT_STEP_MAX, MovementPattern, pickWanderTarget, pickZoneTarget } from './scene-motion.util';

/**
 * P-10 · Strategy del movimiento: cómo elige su siguiente destino cada comportamiento de las
 * personas (6) y cada patrón de los objetos con vida ambiental (3). Sin Phaser: el azar y los
 * obstáculos se inyectan, así que cada regla se prueba sola.
 */

const ZONE = { x: 50, y: 50, width: 100, height: 100 };

function ctx(over: Partial<NpcTargetContext> = {}): NpcTargetContext {
  return {
    zone: ZONE, anchors: undefined, anchorIdx: 0, from: { x: 100, y: 100 }, player: null,
    rand: () => 0.5, isBlocked: () => false, ...over,
  };
}

/** Azar determinista: devuelve la secuencia dada y luego repite el último valor. */
function seq(...values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const BEHAVIORS: NpcMotionBehavior[] = ['idle', 'attentive', 'subtle-wander', 'pace', 'patrol', 'avoidant'];

describe('NPC_MOTION_STRATEGIES', () => {
  it('hay una estrategia para cada comportamiento y para ninguno más', () => {
    expect(Object.keys(NPC_MOTION_STRATEGIES).sort()).toEqual([...BEHAVIORS].sort());
    for (const behavior of BEHAVIORS) expect(npcMotionStrategyFor(behavior)).toBe(NPC_MOTION_STRATEGIES[behavior]);
  });

  it('pace y patrol comparten la regla de las anclas; idle y attentive, la de quedarse quietos', () => {
    expect(NPC_MOTION_STRATEGIES.pace).toBe(NPC_MOTION_STRATEGIES.patrol);
    expect(NPC_MOTION_STRATEGIES.idle).toBe(NPC_MOTION_STRATEGIES.attentive);
    expect(NPC_MOTION_STRATEGIES.pace).not.toBe(NPC_MOTION_STRATEGIES.idle);
  });

  describe('idle y attentive', () => {
    it.each(['idle', 'attentive'] as const)('%s nunca pide destino, aunque haya zona, anclas y jugador', behavior => {
      const strategy = npcMotionStrategyFor(behavior);

      const target = strategy.nextTarget(ctx({
        anchors: [{ x: 1, y: 1 }], player: { x: 100, y: 100 }, rand: seq(0.1, 0.9),
      }));

      expect(target).toBeNull();
    });

    it.each(['idle', 'attentive'] as const)('%s no mueve el índice de ancla', behavior => {
      expect(npcMotionStrategyFor(behavior).anchorAfterArrival(1, 3)).toBe(1);
    });
  });

  describe('subtle-wander', () => {
    const strategy = NPC_MOTION_STRATEGIES['subtle-wander'];

    it('elige un punto de la zona con el azar recibido (x primero, y después)', () => {
      const target = strategy.nextTarget(ctx({ rand: seq(0.25, 0.75) }));

      expect(target).toEqual({ x: 75, y: 125 }); // 50 + 0,25·100 ; 50 + 0,75·100
    });

    it('pregunta por el punto elegido y devuelve null si está bloqueado', () => {
      const isBlocked = vi.fn(() => true);

      const blocked = strategy.nextTarget(ctx({ rand: seq(0.25, 0.75), isBlocked }));

      expect(isBlocked).toHaveBeenCalledWith(75, 125);
      expect(blocked).toBeNull();
      // control positivo: el mismo azar con el camino libre sí da destino
      expect(strategy.nextTarget(ctx({ rand: seq(0.25, 0.75) }))).not.toBeNull();
    });

    it('no usa las anclas ni mueve el índice', () => {
      const target = strategy.nextTarget(ctx({ anchors: [{ x: 5, y: 5 }], rand: seq(0, 0) }));

      expect(target).toEqual({ x: 50, y: 50 });
      expect(strategy.anchorAfterArrival(0, 1)).toBe(0);
    });
  });

  describe('pace y patrol (anclas)', () => {
    const strategy = NPC_MOTION_STRATEGIES.pace;
    const anchors = [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }];

    it('el destino es el ancla del índice actual', () => {
      expect(strategy.nextTarget(ctx({ anchors, anchorIdx: 0 }))).toEqual({ x: 10, y: 20 });
      expect(strategy.nextTarget(ctx({ anchors, anchorIdx: 2 }))).toEqual({ x: 50, y: 60 });
    });

    it('devuelve una copia: no entrega el objeto del ancla', () => {
      const target = strategy.nextTarget(ctx({ anchors, anchorIdx: 1 }))!;

      expect(target).toEqual({ x: 30, y: 40 });
      expect(target).not.toBe(anchors[1]);
    });

    it('sin anclas (ausentes o vacías) no hay destino', () => {
      expect(strategy.nextTarget(ctx({ anchors: undefined }))).toBeNull();
      expect(strategy.nextTarget(ctx({ anchors: [] }))).toBeNull();
      expect(strategy.nextTarget(ctx({ anchors }))).not.toBeNull(); // control positivo
    });

    it('no consulta obstáculos: la ruta autorada se recorre tal cual', () => {
      const isBlocked = vi.fn(() => true);

      expect(strategy.nextTarget(ctx({ anchors, isBlocked }))).toEqual({ x: 10, y: 20 });
      expect(isBlocked).not.toHaveBeenCalled();
    });

    it('al llegar avanza al ancla siguiente y, tras el último, vuelve al primero', () => {
      expect(strategy.anchorAfterArrival(0, 3)).toBe(1);
      expect(strategy.anchorAfterArrival(1, 3)).toBe(2);
      expect(strategy.anchorAfterArrival(2, 3)).toBe(0);
    });

    it('sin anclas deja el índice como está', () => {
      expect(strategy.anchorAfterArrival(0, 0)).toBe(0);
      expect(strategy.anchorAfterArrival(4, 0)).toBe(4);
    });
  });

  describe('avoidant', () => {
    const strategy = NPC_MOTION_STRATEGIES.avoidant;
    const near = { x: 160, y: 100 }; // a 60 px de (100, 100)

    it('sin jugador no reacciona', () => {
      expect(strategy.nextTarget(ctx({ player: null, rand: () => 0 }))).toBeNull();
      expect(strategy.nextTarget(ctx({ player: near, rand: () => 0 }))).not.toBeNull(); // control
    });

    it('solo reacciona con el jugador a 70 px o menos (70 incluido)', () => {
      expect(strategy.nextTarget(ctx({ player: { x: 171, y: 100 }, rand: () => 0 }))).toBeNull();   // 71
      expect(strategy.nextTarget(ctx({ player: { x: 170, y: 100 }, rand: () => 0 }))).not.toBeNull(); // 70
    });

    it('da un paso corto, dentro de la zona y más lejos del jugador', () => {
      const from = { x: 100, y: 100 };

      const target = strategy.nextTarget(ctx({ from, player: near, rand: () => 0 }))!;

      expect(Math.hypot(target.x - from.x, target.y - from.y)).toBeLessThanOrEqual(AVOIDANT_STEP_MAX + 1e-9);
      expect(Math.hypot(target.x - near.x, target.y - near.y)).toBeGreaterThan(Math.hypot(from.x - near.x, from.y - near.y));
      expect(target.x).toBeGreaterThanOrEqual(ZONE.x);
      expect(target.y).toBeGreaterThanOrEqual(ZONE.y);
    });

    it('si el punto elegido está bloqueado no hay destino', () => {
      const isBlocked = vi.fn(() => true);

      expect(strategy.nextTarget(ctx({ player: near, rand: () => 0, isBlocked }))).toBeNull();
      expect(isBlocked).toHaveBeenCalledTimes(1);
    });

    it('no mueve el índice de ancla', () => {
      expect(strategy.anchorAfterArrival(1, 3)).toBe(1);
    });
  });
});

describe('nextAmbientStep (patrones de los objetos con vida ambiental)', () => {
  const origin = { x: 200, y: 200 };
  const state = (patrolIdx = 0): AmbientMotionState => ({ origin, patrolIdx });

  describe('wander', () => {
    const pattern: MovementPattern = { type: 'wander', radius: 30 };

    it('elige un punto alrededor del origen con el azar recibido', () => {
      const step = nextAmbientStep(pattern, state(), seq(0.25, 0.5));
      const expected = pickWanderTarget(origin, 30, seq(0.25, 0.5));

      expect(step.target).toEqual(expected);
      expect(step.target!.y).toBeCloseTo(215, 6); // π/2 a la mitad del radio: 15 px hacia abajo
    });

    it('nunca queda a más de su radio del origen', () => {
      for (const a of [0, 0.3, 0.6, 0.99]) {
        for (const r of [0, 0.5, 0.999]) {
          const t = nextAmbientStep(pattern, state(), seq(a, r)).target!;
          expect(Math.hypot(t.x - origin.x, t.y - origin.y)).toBeLessThanOrEqual(30 + 1e-9);
        }
      }
    });

    it('no toca el índice de patrulla', () => {
      expect(nextAmbientStep(pattern, state(2), seq(0.5, 0.5)).patrolIdx).toBe(2);
    });
  });

  describe('patrol', () => {
    const points: Array<[number, number]> = [[10, 10], [50, 10], [50, 50]];
    const pattern: MovementPattern = { type: 'patrol', points };

    it('comportamiento actual: el índice avanza ANTES de elegir, así que el primer destino es el punto 1', () => {
      const step = nextAmbientStep(pattern, state(0), () => 0.5);

      expect(step).toEqual({ target: { x: 50, y: 10 }, patrolIdx: 1 });
    });

    it('recorre los puntos en orden cíclico: 1, 2, 0, 1…', () => {
      let current = state(0);
      const visited: Array<{ x: number; y: number } | null> = [];
      for (let i = 0; i < 4; i++) {
        const step = nextAmbientStep(pattern, current, () => 0.5);
        visited.push(step.target);
        current = { origin, patrolIdx: step.patrolIdx };
      }

      expect(visited).toEqual([{ x: 50, y: 10 }, { x: 50, y: 50 }, { x: 10, y: 10 }, { x: 50, y: 10 }]);
    });

    it('con un solo punto siempre devuelve ese punto', () => {
      const one: MovementPattern = { type: 'patrol', points: [[7, 8]] };

      expect(nextAmbientStep(one, state(0), () => 0.5)).toEqual({ target: { x: 7, y: 8 }, patrolIdx: 0 });
    });

    it('sin puntos no hay destino y el índice no cambia', () => {
      const empty: MovementPattern = { type: 'patrol', points: [] };

      expect(nextAmbientStep(empty, state(3), () => 0.5)).toEqual({ target: null, patrolIdx: 3 });
      // control positivo: con puntos sí hay destino
      expect(nextAmbientStep(pattern, state(3), () => 0.5).target).not.toBeNull();
    });
  });

  it('idle no tiene destino y conserva el índice', () => {
    expect(nextAmbientStep({ type: 'idle' }, state(2), () => 0.5)).toEqual({ target: null, patrolIdx: 2 });
  });

  it('no modifica el estado recibido', () => {
    const frozen = Object.freeze({ origin: Object.freeze({ x: 1, y: 2 }), patrolIdx: 0 });
    const pattern: MovementPattern = { type: 'patrol', points: [[1, 1], [2, 2]] };

    const step = nextAmbientStep(pattern, frozen, () => 0.5);

    expect(frozen.patrolIdx).toBe(0);
    expect(step.patrolIdx).toBe(1);
  });
});

describe('las estrategias de persona respetan pickZoneTarget', () => {
  it('subtle-wander equivale a pickZoneTarget con el mismo azar', () => {
    for (const [a, b] of [[0, 0], [0.5, 0.5], [0.999, 0.1]]) {
      const expected = pickZoneTarget(ZONE, seq(a, b));

      expect(NPC_MOTION_STRATEGIES['subtle-wander'].nextTarget(ctx({ rand: seq(a, b) }))).toEqual(expected);
    }
  });
});
