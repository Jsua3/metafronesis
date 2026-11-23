vi.mock('phaser', () => ({ __esModule: true, default: { Scale: { NONE: 0 } } }));

import type Phaser from 'phaser';

import { fitGameToHost, pixelScaleConfig, watchHostSize } from './pixel-canvas';

function host(width: number, height: number): HTMLElement {
  return { getBoundingClientRect: () => ({ width, height }) } as unknown as HTMLElement;
}

function fakeGame(width: number, height: number, zoom: number) {
  const scale = {
    width, height, zoom,
    resize: vi.fn((w: number, h: number) => { scale.width = w; scale.height = h; }),
    setZoom: vi.fn((z: number) => { scale.zoom = z; }),
  };
  return { game: { scale } as unknown as Phaser.Game, scale };
}

function setDpr(value: number): void {
  Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true });
}

describe('pixel-canvas', () => {
  afterEach(() => {
    setDpr(1);
    vi.unstubAllGlobals();
  });

  it('la config pide el lienzo en píxeles físicos con el CSS al tamaño del contenedor', () => {
    setDpr(1.5);
    expect(pixelScaleConfig(host(800, 450))).toEqual({ mode: 0, width: 1200, height: 675, zoom: 1 / 1.5 });
  });

  it('si cambia el contenedor o el dpr ajusta tamaño y zoom; si no cambió nada, no toca nada', () => {
    setDpr(1);
    const { game, scale } = fakeGame(800, 450, 1);
    expect(fitGameToHost(game, host(800, 450))).toBe(false);
    expect(scale.resize).not.toHaveBeenCalled();
    expect(fitGameToHost(game, host(1000, 500))).toBe(true);
    expect(scale.resize).toHaveBeenCalledWith(1000, 500);
    setDpr(2);
    expect(fitGameToHost(game, host(1000, 500))).toBe(true);
    expect(scale.resize).toHaveBeenLastCalledWith(2000, 1000);
    expect(scale.setZoom).toHaveBeenLastCalledWith(0.5);
  });

  it('watchHostSize reencaja al cambiar el contenedor o la ventana y deja de observar al soltarlo', () => {
    setDpr(1);
    const refits: Array<() => void> = [];
    const observeSpy = vi.fn();
    const disconnectSpy = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      observe = observeSpy;
      disconnect = disconnectSpy;
      constructor(callback: () => void) { refits.push(callback); }
    });
    const size = { width: 800, height: 450 };
    const el = { getBoundingClientRect: () => size } as unknown as HTMLElement;
    const { game, scale } = fakeGame(800, 450, 1);

    const stop = watchHostSize(game, el);
    expect(observeSpy).toHaveBeenCalledWith(el);

    size.width = 1000; // se abre o se cierra un panel: cambia el contenedor
    refits[0]();
    expect(scale.resize).toHaveBeenLastCalledWith(1000, 450);

    size.height = 500; // cambia la ventana o el zoom del navegador
    window.dispatchEvent(new Event('resize'));
    expect(scale.resize).toHaveBeenLastCalledWith(1000, 500);

    stop();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    size.width = 1200;
    window.dispatchEvent(new Event('resize'));
    expect(scale.resize).toHaveBeenCalledTimes(2); // soltado: ya no reencaja
  });
});
