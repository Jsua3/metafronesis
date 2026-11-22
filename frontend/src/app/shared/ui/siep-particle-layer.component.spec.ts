import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SiepParticleLayerComponent } from './siep-particle-layer.component';

@Component({
  imports: [SiepParticleLayerComponent],
  template: `<div><app-siep-particle-layer [paused]="paused()" /></div>`,
})
class Host {
  paused = signal(false);
}

/**
 * Partículas con pausa (plan visual F4-4, H-22, VD-25; WCAG 2.2.2): lo que se mueve más de 5 s se puede pausar, y
 * con movimiento reducido no se anima, también si la preferencia cambia sin recargar. Se mide lo que se ve: si el
 * canvas se sigue repintando al pasar fotogramas (los rAF reales de jsdom). Canvas, observadores y matchMedia
 * simulados (jsdom no los trae).
 */
// req: BLOQUE-H (H-22)
describe('SiepParticleLayerComponent', () => {
  let fixture: ComponentFixture<Host>;
  let reduce: boolean;
  let mediaListener: ((event: { matches: boolean }) => void) | null;
  const ctx = { setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillStyle: '' };
  const draws = () => ctx.clearRect.mock.calls.length;
  const frames = async (count = 4) => {
    for (let i = 0; i < count; i += 1) await new Promise(resolve => requestAnimationFrame(resolve));
  };
  const originals = {
    matchMedia: window.matchMedia,
    getContext: HTMLCanvasElement.prototype.getContext,
    resize: (globalThis as { ResizeObserver?: unknown }).ResizeObserver,
    intersection: (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver,
  };

  beforeEach(() => {
    reduce = false;
    mediaListener = null;
    ctx.clearRect.mockClear();
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduced-motion') ? reduce : false,
      media: query,
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => { mediaListener = listener; },
      removeEventListener: () => { mediaListener = null; },
    })) as unknown as typeof window.matchMedia;
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class { observe() {} disconnect() {} };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    fixture?.destroy();
    window.matchMedia = originals.matchMedia;
    HTMLCanvasElement.prototype.getContext = originals.getContext;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = originals.resize;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = originals.intersection;
  });

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  }

  async function animating(): Promise<boolean> {
    const before = draws();
    await frames();
    return draws() > before;
  }

  it('anima; con «paused» se detiene (último cuadro quieto) y al reanudar vuelve a animar', async () => {
    await render();
    expect(await animating()).toBe(true);
    fixture.componentInstance.paused.set(true);
    await fixture.whenStable();
    expect(await animating()).toBe(false);
    fixture.componentInstance.paused.set(false);
    await fixture.whenStable();
    expect(await animating()).toBe(true);
  });

  it('al destruirse deja de pintar y suelta el oyente de la preferencia de movimiento (revisión de F4, M-11)', async () => {
    await render();
    expect(await animating()).toBe(true);
    fixture.destroy();
    expect(await animating()).toBe(false);
    expect(mediaListener).toBeNull();
  });

  it('con movimiento reducido arranca quieta; si la preferencia cambia en vivo, se detiene y se reanuda sin recargar', async () => {
    reduce = true;
    await render();
    expect(draws()).toBeGreaterThan(0); // pinta un cuadro quieto
    expect(await animating()).toBe(false);
    fixture.destroy();

    reduce = false;
    await render();
    expect(await animating()).toBe(true);
    mediaListener!({ matches: true });
    expect(await animating()).toBe(false);
    mediaListener!({ matches: false });
    expect(await animating()).toBe(true);
  });
});
