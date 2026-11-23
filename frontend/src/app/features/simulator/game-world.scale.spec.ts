import { readFileSync } from 'fs';
import { join } from 'path';

// Phaser toca canvas/WebGL al importarse (jsdom no lo soporta); la escena y el componente nunca arrancan aquí.
vi.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Math: { Clamp: (value: number) => value },
    Input: { Keyboard: { JustDown: () => false } },
    Game: class {},
  },
}));

import { DataDrivenWorldScene, GameWorldComponent } from './game-world.component';
import { LABEL_MAX_SCREEN_WIDTH_PX, LABEL_MIN_SCREEN_PX, labelScaleFor } from './interaction-priority.util';
import type { Mock } from 'vitest';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

/**
 * T0.3: tras cerrar un diálogo el canvas quedaba 17 % más pequeño porque se reencajaba con el tamaño viejo del
 * contenedor. Con el lienzo en píxeles físicos (spec §8.3) `fitGameToHost` mide el contenedor en cada llamada
 * antes de reencajar, y `watchHostSize` (ResizeObserver + resize de la ventana) lo llama solo.
 */
describe('game-world: escala del canvas (T5.4)', () => {
  /** Un contenedor cuyo tamaño CSS se puede cambiar y el lienzo de Phaser que lo refleja. */
  function canvasAndHost(width: number, height: number) {
    const rect = { width, height };
    const host = { getBoundingClientRect: () => rect } as unknown as HTMLElement;
    const scale = {
      width, height, zoom: 1,
      resize: vi.fn((w: number, h: number) => { scale.width = w; scale.height = h; }),
      setZoom: vi.fn((z: number) => { scale.zoom = z; }),
    };
    return { rect, host, scale };
  }

  function componentWith(game: unknown, host?: HTMLElement): GameWorldComponent {
    const component = Object.create(GameWorldComponent.prototype) as { phaserGame?: unknown; gameHost?: unknown };
    component.phaserGame = game;
    component.gameHost = host ? { nativeElement: host } : undefined;
    return component as unknown as GameWorldComponent;
  }

  it('refreshScale vuelve a medir el contenedor y reencaja el lienzo a su tamaño nuevo', () => {
    const { rect, host, scale } = canvasAndHost(800, 450);
    const component = componentWith({ scale }, host);
    component.refreshScale();
    expect(scale.resize).not.toHaveBeenCalled();
    rect.width = 640;
    rect.height = 360;
    component.refreshScale();
    expect(scale.resize).toHaveBeenCalledWith(640, 360);
    expect(scale.width).toBe(640);
  });

  it('refreshScale no falla antes de que Phaser exista ni sin contenedor', () => {
    expect(() => componentWith(undefined).refreshScale()).not.toThrow();
    expect(() => componentWith({ scale: {} }).refreshScale()).not.toThrow();
  });

  it('el contenedor se sigue con watchHostSize y refreshScale reencaja con fitGameToHost, sin Scale.FIT', () => {
    expect(source).toMatch(/this\.detachHostWatch = watchHostSize\(this\.phaserGame, this\.gameHost!\.nativeElement\);/);
    expect(source).toMatch(/refreshScale\(\): void \{\s*const host = this\.gameHost\?\.nativeElement;\s*if \(this\.phaserGame && host\) fitGameToHost\(this\.phaserGame, host\);\s*\}/);
    expect(source).not.toMatch(/scale\??\.refresh\(\)/);
    expect(source).not.toContain('Phaser.Scale.FIT');
  });

  it('ngOnDestroy suelta el observador del contenedor antes de destruir Phaser, y una sola vez', () => {
    const order: string[] = [];
    const detach = vi.fn(() => { order.push('detach'); });
    const destroy = vi.fn(() => { order.push('destroy'); });
    const component = componentWith({ destroy }) as unknown as { detachHostWatch?: () => void; ngOnDestroy(): void };
    component.detachHostWatch = detach;
    component.ngOnDestroy();
    expect(order).toEqual(['detach', 'destroy']);
    component.ngOnDestroy();
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('retryLoad suelta el observador del contenedor antes de reiniciar Phaser', () => {
    const order: string[] = [];
    const detach = vi.fn(() => { order.push('detach'); });
    const destroy = vi.fn(() => { order.push('destroy'); });
    const state = () => ({ set: vi.fn() });
    const component = componentWith({ destroy }) as unknown as Record<string, unknown> & { retryLoad(): void };
    Object.assign(component, {
      detachHostWatch: detach,
      renderReady: state(), renderedMapKey: state(), renderedScenarioKey: state(),
      assetsReady: state(), loadPercent: state(), criticalLoadFailed: state(),
      boot: vi.fn(() => { order.push('boot'); }),
    });
    component.retryLoad();
    expect(order).toEqual(['detach', 'destroy', 'boot']);
  });
});

describe('game-world: rótulos legibles en cualquier tamaño (T5.3)', () => {
  interface LabelProbe {
    scale: { displayScale: { x: number }; on: Mock };
    cameras: { main: { zoom: number } };
    labelScale: number;
    labelWrap: number;
    markerLabels: Map<string, { setScale: Mock; setWordWrapWidth: Mock }>;
    doorHints: Map<string, { x?: number; __doorX?: number; __doorHalfWidth?: number; setScale: Mock }>;
    npcMarkers: Map<string, unknown>;
    onScaleResize(): void;
    syncLabelScale(): boolean;
  }

  function sceneAt(displayScale: number, zoom = 1): LabelProbe {
    const scene = new DataDrivenWorldScene({} as never) as unknown as LabelProbe;
    scene.scale = { displayScale: { x: displayScale }, on: vi.fn() };
    scene.cameras = { main: { zoom } };
    const label = { setScale: vi.fn(function (this: unknown) { return this; }), setWordWrapWidth: vi.fn(function (this: unknown) { return this; }) };
    scene.markerLabels = new Map([['tool-pap', label]]);
    scene.doorHints = new Map([['puerta', { setScale: vi.fn() }]]);
    scene.npcMarkers = new Map();
    return scene;
  }

  it('a 1366x768 (canvas de 1143 px, escala 0,84) no agranda los rótulos: 11 px de canvas ya son 13 de pantalla', () => {
    const scene = sceneAt(960 / 1143);
    scene.onScaleResize();
    expect(scene.labelScale).toBe(1);
    expect(scene.markerLabels.get('tool-pap')!.setScale).not.toHaveBeenCalled();
  });

  it('a 844x390 (canvas de 478 px) los rótulos se agrandan hasta medir 12 px de pantalla y no pasan de 168 px de ancho', () => {
    const displayScale = 960 / 478;
    const scene = sceneAt(displayScale);
    scene.onScaleResize();
    expect(scene.labelScale).toBeGreaterThan(2);
    expect((11 * scene.labelScale) / displayScale).toBeGreaterThanOrEqual(LABEL_MIN_SCREEN_PX - 1e-9);
    const label = scene.markerLabels.get('tool-pap')!;
    expect(label.setScale).toHaveBeenCalledWith(scene.labelScale);
    expect(scene.doorHints.get('puerta')!.setScale).toHaveBeenCalledWith(scene.labelScale);
    const wrapLocal = label.setWordWrapWidth.mock.calls[0][0] as number;
    expect((wrapLocal * scene.labelScale) / displayScale).toBeLessThanOrEqual(LABEL_MAX_SCREEN_WIDTH_PX + 1e-9);
  });

  it('el rótulo de una puerta pegada al borde se corre hacia dentro para no cortarse con el canvas', () => {
    const scene = sceneAt(960 / 478);
    const hint = { x: 838, __doorX: 838, __doorHalfWidth: 99, setScale: vi.fn() };
    scene.doorHints = new Map([['puerta-sala-escucha', hint]]);
    scene.onScaleResize();
    const reach = 99 * scene.labelScale + 6;
    expect(hint.x).toBeLessThanOrEqual(960 - reach);
    expect(hint.x).toBeLessThan(838);
    // una puerta del borde izquierdo se corre hacia la derecha
    const left = { x: 122, __doorX: 122, __doorHalfWidth: 99, setScale: vi.fn() };
    scene.doorHints = new Map([['puerta-urgencias', left]]);
    scene.labelScale = 1;
    scene.onScaleResize();
    expect(left.x).toBeGreaterThanOrEqual(99 * scene.labelScale + 6);
  });

  it('el zoom de cámara de cada sala cuenta: con zoom 2 (salas Tiled) los rótulos no se duplican', () => {
    const scene = sceneAt(960 / 478, 1);
    expect(scene.syncLabelScale()).toBe(true);
    const atZoom1 = scene.labelScale;
    scene.cameras.main.zoom = 2;
    expect(scene.syncLabelScale()).toBe(true); // el render de otra sala cambió el zoom: se recalcula al repintar
    expect(scene.labelScale).toBeCloseTo(atZoom1 / 2, 5);
    expect(scene.syncLabelScale()).toBe(false);
  });

  it('sin escala ni cámara (antes de create o tras destruir la escena) no falla ni toca nada', () => {
    const scene = new DataDrivenWorldScene({} as never) as unknown as LabelProbe;
    expect(scene.syncLabelScale()).toBe(false);
    expect(scene.labelScale).toBe(1);
  });

  it('recalcular con el mismo tamaño no vuelve a tocar los rótulos', () => {
    const scene = sceneAt(960 / 478);
    scene.onScaleResize();
    const label = scene.markerLabels.get('tool-pap')!;
    const calls = label.setScale.mock.calls.length;
    scene.onScaleResize();
    expect(label.setScale.mock.calls.length).toBe(calls);
  });

  it('el reescalado se engancha al evento resize del canvas, no al cuadro', () => {
    expect(source).toMatch(/this\.scale\.on\('resize', this\.onScaleResize, this\);/);
  });

  // req: REGLA-009 (F0-8, PHA-2: rótulos nítidos con zoom de cámara)
  // Regla 7 de la vara (bloque M1): los rótulos no crecen con el zoom; antes, a ×2 o ×3 salían al doble o al triple.
  it('los rótulos miden lo mismo en pantalla con cualquier zoom y la resolución de los textos sigue al zoom', () => {
    const scene = sceneAt(1, 2) as LabelProbe & { pixelRender: { refreshTexts: Mock } };
    scene.pixelRender = { refreshTexts: vi.fn() };
    const enPantallaA1 = labelScaleFor(1, 1);
    scene.syncLabelScale();
    expect(scene.labelScale * 2).toBeCloseTo(enPantallaA1, 6);
    expect(scene.pixelRender.refreshTexts).toHaveBeenLastCalledWith(2);
    scene.cameras.main.zoom = 3;
    scene.syncLabelScale();
    expect(scene.labelScale * 3).toBeCloseTo(enPantallaA1, 6);
    expect(scene.pixelRender.refreshTexts).toHaveBeenLastCalledWith(3);
  });

  it('al fijar el zoom entero de una sala, los textos toman la resolución de ese zoom', () => {
    const scene = new DataDrivenWorldScene({} as never) as unknown as {
      cameras: { main: Record<string, unknown> };
      pixelRender: { refreshTexts: Mock };
      player: { x: number; y: number };
      callbacks: { reduceMotion: boolean };
      applyPixelCamera(width: number, height: number): void;
    };
    const cam = {
      width: 1920, height: 1080, zoom: 1, setZoom: vi.fn((k: number) => { cam.zoom = k; }),
      stopFollow: vi.fn(), removeBounds: vi.fn(), centerOn: vi.fn(), fadeEffect: { isRunning: false },
    };
    scene.cameras = { main: cam };
    scene.player = { x: 480, y: 300 };
    scene.callbacks = { reduceMotion: false };
    scene.pixelRender = { refreshTexts: vi.fn() };
    scene.applyPixelCamera(960, 540);
    // Plano de caminar a 1920×1080 (bloque M1): ×3, entero.
    expect(cam.setZoom).toHaveBeenCalledWith(3);
    expect(scene.pixelRender.refreshTexts).toHaveBeenCalledWith(3);
  });

  it('cuando cambia la escala de los rótulos, la resolución se recalcula después de reescalarlos', () => {
    const scene = sceneAt(960 / 478) as LabelProbe & { pixelRender: { refreshTexts: Mock } };
    const order: string[] = [];
    scene.markerLabels.get('tool-pap')!.setScale.mockImplementation(function (this: unknown) { order.push('escala'); return this; });
    scene.pixelRender = { refreshTexts: vi.fn(() => { order.push('resolución'); return 0; }) };
    expect(scene.syncLabelScale()).toBe(true);
    expect(order).toEqual(['escala', 'resolución']);
  });
});
