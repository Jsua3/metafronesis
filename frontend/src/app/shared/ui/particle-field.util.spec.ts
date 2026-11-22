import { MAX_FRAME_MS, Particle, REFERENCE_FRAME_MS, frameScale, stepParticles } from './particle-field.util';

const particle = (over: Partial<Particle> = {}): Particle => ({
  x: 50, y: 50, vx: 1, vy: 0.5, radius: 2, alpha: 0.3, ...over,
});
const bounds = { width: 200, height: 100 };

describe('frameScale', () => {
  it('vale 1 para un cuadro de 60 fps y 0,5 para uno de 120 fps', () => {
    expect(frameScale(REFERENCE_FRAME_MS)).toBeCloseTo(1);
    expect(frameScale(REFERENCE_FRAME_MS / 2)).toBeCloseTo(0.5);
  });

  it('limita los saltos largos (pestaña en segundo plano) y los deltas negativos', () => {
    expect(frameScale(5_000)).toBeCloseTo(MAX_FRAME_MS / REFERENCE_FRAME_MS);
    expect(frameScale(-10)).toBe(0);
  });
});

describe('stepParticles', () => {
  it('avanza en proporción al tiempo transcurrido', () => {
    const p = particle();
    stepParticles([p], 2, bounds, null);
    expect(p.x).toBeCloseTo(52);
    expect(p.y).toBeCloseTo(51);
  });

  it('amortigua según el tiempo transcurrido', () => {
    const p = particle();
    stepParticles([p], 2, bounds, null);
    expect(p.vx).toBeCloseTo(Math.pow(0.995, 2));
  });

  it('rebota al salir del área', () => {
    const p = particle({ x: 199.5, vx: 1 });
    stepParticles([p], 1, bounds, null);
    expect(p.vx).toBeLessThan(0);
  });

  it('el puntero cercano empuja la partícula y el lejano no', () => {
    const near = particle({ x: 110, y: 50, vx: 0, vy: 0 });
    const far = particle({ x: 110, y: 50, vx: 0, vy: 0 });
    stepParticles([near], 1, bounds, { x: 100, y: 50 });
    stepParticles([far], 1, bounds, { x: -1000, y: -1000 });
    expect(near.vx).toBeGreaterThan(0);
    expect(far.vx).toBe(0);
  });
});
