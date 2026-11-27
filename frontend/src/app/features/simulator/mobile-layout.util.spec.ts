import { coberturaVertical, seSolapan } from './mobile-layout.util';

describe('medición del HUD', () => {
  it('suma solo una vez las franjas verticales que se superponen', () => {
    const boxes = [{ x: 4, y: 4, width: 44, height: 48 }, { x: 60, y: 8, width: 240, height: 44 },
      { x: 4, y: 780, width: 120, height: 56 }, { x: 128, y: 788, width: 100, height: 48 }];
    expect(coberturaVertical(boxes, 844)).toBeCloseTo(104 / 844);
    expect(coberturaVertical(boxes, 844)).toBeLessThanOrEqual(.30);
  });
  it('detecta intersecciones reales sin contar los bordes que solo se tocan', () => {
    const a = { x: 0, y: 0, width: 48, height: 48 };
    expect(seSolapan(a, { x: 47, y: 10, width: 10, height: 10 })).toBe(true);
    expect(seSolapan(a, { x: 48, y: 10, width: 10, height: 10 })).toBe(false);
  });
});
