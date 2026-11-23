import { VignetteSpec, paintVignette, vignetteBands, vignetteTextureKey } from './vignette-texture.util';

/**
 * Viñeta del mundo como UNA textura de lienzo (plan visual F6-8): la misma banda de siempre (opacidad en el borde que
 * cae al cuadrado hacia dentro), pintada una sola vez por tamaño en vez de decenas de `strokeRect` por sala y por
 * cuadro de re-render. Pura: las bandas y la clave se prueban sin Phaser; el pintado, con un contexto de mentira.
 */
// req: RNF-04 (REGLA-009 parte)

const SPEC: VignetteSpec = { width: 480, height: 270, tint: 0x141a2e, bandRatio: 0.12, edgeAlpha: 0.3 };

describe('vignette-texture: las bandas', () => {
  it('hay una banda por píxel de grosor: round(lado corto × proporción)', () => {
    expect(vignetteBands(480, 270, 0.12, 0.3)).toHaveLength(Math.round(270 * 0.12));
    expect(vignetteBands(200, 800, 0.18, 1)).toHaveLength(Math.round(200 * 0.18));
  });

  it('la primera banda lleva la opacidad del borde y cada una cae al cuadrado hacia dentro', () => {
    const bands = vignetteBands(480, 270, 0.12, 0.3);
    expect(bands[0]).toEqual({ inset: 0, alpha: 0.3 });
    const count = bands.length;
    bands.forEach((band, i) => {
      expect(band.inset).toBe(i);
      expect(band.alpha).toBeCloseTo(0.3 * (1 - i / count) ** 2, 10);
    });
    for (let i = 1; i < count; i += 1) expect(bands[i].alpha).toBeLessThan(bands[i - 1].alpha);
  });

  it('un tamaño sin área o una proporción vacía no genera bandas', () => {
    expect(vignetteBands(0, 100, 0.12, 0.3)).toEqual([]);
    expect(vignetteBands(100, 100, 0, 0.3)).toEqual([]);
  });
});

describe('vignette-texture: la clave de la textura', () => {
  it('es estable para el mismo tamaño y forma y cambia con el tamaño o el tinte', () => {
    expect(vignetteTextureKey(SPEC)).toBe(vignetteTextureKey({ ...SPEC }));
    expect(vignetteTextureKey(SPEC)).not.toBe(vignetteTextureKey({ ...SPEC, width: 481 }));
    expect(vignetteTextureKey(SPEC)).not.toBe(vignetteTextureKey({ ...SPEC, tint: 0x2a1420 }));
    expect(vignetteTextureKey(SPEC)).not.toBe(vignetteTextureKey({ ...SPEC, edgeAlpha: 1 }));
  });
});

describe('vignette-texture: el pintado', () => {
  function fakeContext() {
    const calls: Array<{ style: string; rect: [number, number, number, number] }> = [];
    const ctx = {
      strokeStyle: '',
      lineWidth: 0,
      clearRect: vi.fn(),
      strokeRect: (x: number, y: number, w: number, h: number) => { calls.push({ style: ctx.strokeStyle, rect: [x, y, w, h] }); },
    };
    return { ctx, calls };
  }

  it('limpia el lienzo y dibuja cada banda como un marco que se encoge hacia dentro, con el tinte y la opacidad de la banda', () => {
    const { ctx, calls } = fakeContext();
    paintVignette(ctx, SPEC);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 480, 270);
    const bands = vignetteBands(480, 270, 0.12, 0.3);
    expect(calls).toHaveLength(bands.length);
    // Trazo de 1 px centrado en el píxel: medio píxel hacia dentro para que cada marco cubra su fila y columna.
    expect(ctx.lineWidth).toBe(1);
    expect(calls[0].rect).toEqual([0.5, 0.5, 479, 269]);
    expect(calls[1].rect).toEqual([1.5, 1.5, 477, 267]);
    expect(calls[0].style).toBe('rgba(20,26,46,0.3)');
  });
});
