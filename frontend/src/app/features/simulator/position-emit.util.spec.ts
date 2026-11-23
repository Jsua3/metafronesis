import { POSITION_EMIT_INTERVAL_MS, shouldEmitPosition } from './position-emit.util';

describe('shouldEmitPosition', () => {
  const last = { x: 100, y: 100, at: 1000 };

  it('usa un intervalo de 125 ms (≈ 8 avisos por segundo al caminar)', () => {
    expect(POSITION_EMIT_INTERVAL_MS).toBe(125);
  });

  it('emite la primera posición conocida', () => {
    expect(shouldEmitPosition(null, 5, 5, 0)).toBe(true);
  });

  it('no emite si la posición no cambió, pase el tiempo que pase', () => {
    expect(shouldEmitPosition(last, 100, 100, 60_000)).toBe(false);
  });

  it('retiene los pasos dentro del intervalo', () => {
    expect(shouldEmitPosition(last, 118, 100, 1000 + POSITION_EMIT_INTERVAL_MS - 1)).toBe(false);
  });

  it('emite en cuanto vence el intervalo', () => {
    expect(shouldEmitPosition(last, 101, 100, 1000 + POSITION_EMIT_INTERVAL_MS)).toBe(true);
  });
});
