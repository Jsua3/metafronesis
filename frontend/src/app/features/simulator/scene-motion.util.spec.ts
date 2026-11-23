import {
  AVOIDANT_STEP_MAX, avoidantTarget, clampToZone, defaultPatternForType,
  effectiveNpcBehavior, freeTileNear, nextAnchorIndex, npcPause, npcSpeed, npcZone,
  parseMovementPattern, pickWanderTarget, pickZoneTarget, reached,
  resolvePattern, stepToward,
} from './scene-motion.util';

describe('scene-motion.util', () => {
  describe('parseMovementPattern', () => {
    it('returns null for empty/blank/invalid input', () => {
      expect(parseMovementPattern(undefined)).toBeNull();
      expect(parseMovementPattern(null)).toBeNull();
      expect(parseMovementPattern({})).toBeNull();
      expect(parseMovementPattern({ type: 'nope' })).toBeNull();
    });
    it('parses idle/wander/patrol', () => {
      expect(parseMovementPattern({ type: 'idle' })).toEqual({ type: 'idle' });
      expect(parseMovementPattern({ type: 'wander', radius: 50 })).toEqual({ type: 'wander', radius: 50 });
      expect(parseMovementPattern({ type: 'wander' })).toEqual({ type: 'wander', radius: 28 });
      expect(parseMovementPattern({ type: 'patrol', points: [[1, 2], [3, 4]] }))
        .toEqual({ type: 'patrol', points: [[1, 2], [3, 4]] });
    });
    it('rejects malformed patrol points', () => {
      expect(parseMovementPattern({ type: 'patrol', points: 'x' })).toBeNull();
      expect(parseMovementPattern({ type: 'patrol', points: [[1]] })).toBeNull();
    });
  });

  describe('defaultPatternForType / resolvePattern', () => {
    it('PERSON wanders by default; others idle', () => {
      expect(defaultPatternForType('PERSON')).toEqual({ type: 'wander', radius: 28 });
      expect(defaultPatternForType('OBJECT')).toEqual({ type: 'idle' });
    });
    it('an explicit pattern overrides the default', () => {
      expect(resolvePattern({ type: 'PERSON', movementPattern: { type: 'idle' } })).toEqual({ type: 'idle' });
      expect(resolvePattern({ type: 'PERSON' })).toEqual({ type: 'wander', radius: 28 });
    });
  });

  describe('stepToward / reached', () => {
    it('moves partway when far', () => {
      expect(stepToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)).toEqual({ x: 4, y: 0 });
    });
    it('snaps to target when within one step', () => {
      expect(stepToward({ x: 0, y: 0 }, { x: 3, y: 0 }, 4)).toEqual({ x: 3, y: 0 });
    });
    it('reached respects epsilon', () => {
      expect(reached({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 1)).toBe(true);
      expect(reached({ x: 0, y: 0 }, { x: 5, y: 0 }, 1)).toBe(false);
    });
  });

  describe('pickWanderTarget', () => {
    it('stays within radius of the origin', () => {
      const t = pickWanderTarget({ x: 100, y: 100 }, 20, () => 0.5);
      expect(Math.hypot(t.x - 100, t.y - 100)).toBeLessThanOrEqual(20 + 1e-9);
    });
  });

  describe('freeTileNear', () => {
    it('returns the target itself when free', () => {
      expect(freeTileNear({ x: 50, y: 50 }, () => false)).toEqual({ x: 50, y: 50 });
    });
    it('returns an adjacent free offset when the target is blocked', () => {
      const blocked = (x: number, y: number) => x === 50 && y === 50;
      const spot = freeTileNear({ x: 50, y: 50 }, blocked, 24, 3);
      expect(blocked(spot.x, spot.y)).toBe(false);
      expect(spot).not.toEqual({ x: 50, y: 50 });
    });
  });

  describe('movimiento NPC por zonas (flujo competitivo)', () => {
    const zone = { x: 100, y: 200, width: 80, height: 40 };

    it('pickZoneTarget queda SIEMPRE dentro de la zona', () => {
      const rands = [0, 0.25, 0.5, 0.75, 0.999];
      for (const a of rands) for (const b of rands) {
        const seq = [a, b];
        const target = pickZoneTarget(zone, () => seq.shift() ?? 0.5);
        expect(target.x).toBeGreaterThanOrEqual(zone.x);
        expect(target.x).toBeLessThanOrEqual(zone.x + zone.width);
        expect(target.y).toBeGreaterThanOrEqual(zone.y);
        expect(target.y).toBeLessThanOrEqual(zone.y + zone.height);
      }
    });

    it('clampToZone delimita la zona: lo de dentro no se mueve y lo de fuera se pega al borde', () => {
      expect(clampToZone({ x: 120, y: 210 }, zone)).toEqual({ x: 120, y: 210 });
      expect(clampToZone({ x: 90, y: 210 }, zone)).toEqual({ x: 100, y: 210 });
      expect(clampToZone({ x: 0, y: 999 }, zone)).toEqual({ x: 100, y: 240 });
    });

    it('npcZone usa zone explícita o caja por radius alrededor del origen', () => {
      expect(npcZone({ behavior: 'pace', zone }, { x: 0, y: 0 })).toEqual(zone);
      expect(npcZone({ behavior: 'subtle-wander', radius: 20 }, { x: 50, y: 60 }))
        .toEqual({ x: 30, y: 40, width: 40, height: 40 });
    });

    it('pace/patrol recorren anchors en orden cíclico', () => {
      expect(nextAnchorIndex(0, 3)).toBe(1);
      expect(nextAnchorIndex(2, 3)).toBe(0);
    });

    it('avoidant elige un objetivo dentro de la zona y más lejos del jugador', () => {
      const player = { x: 100, y: 200 };  // esquina superior izquierda de la zona
      const from = { x: 110, y: 210 };
      const target = avoidantTarget(zone, from, player, Math.random);
      expect(clampToZone(target, zone)).toEqual(target);
      const before = Math.hypot(from.x - player.x, from.y - player.y);
      const after = Math.hypot(target.x - player.x, target.y - player.y);
      expect(after).toBeGreaterThanOrEqual(before);
      // paso corto, no huida arcade
      expect(Math.hypot(target.x - from.x, target.y - from.y)).toBeLessThanOrEqual(AVOIDANT_STEP_MAX + 1e-9);
    });

    it('velocidades/pausas: default por behavior y override por config', () => {
      expect(npcSpeed({ behavior: 'subtle-wander' })).toBe(18);
      expect(npcSpeed({ behavior: 'patrol', speed: 30 })).toBe(30);
      expect(npcPause({ behavior: 'pace' }, null)).toBe(1600);
      expect(npcPause({ behavior: 'pace', pauseMs: 500 }, { x: 0, y: 0, pauseMs: 900 })).toBe(900);
    });

    it('reduced motion fuerza idle salvo attentive (solo facing)', () => {
      expect(effectiveNpcBehavior('patrol', true)).toBe('idle');
      expect(effectiveNpcBehavior('subtle-wander', true)).toBe('idle');
      expect(effectiveNpcBehavior('attentive', true)).toBe('attentive');
      expect(effectiveNpcBehavior('pace', false)).toBe('pace');
    });
  });
});
