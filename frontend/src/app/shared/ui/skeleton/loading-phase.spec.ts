import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { loadingPhase } from './loading-phase';

/**
 * loadingPhase() (plan visual §2.5, F2-4; Review Focus 3 «parpadeo del esqueleto»): una respuesta en menos de 150 ms
 * no muestra nada especial; pasado el umbral aparece el esqueleto y, una vez visible, se queda al menos 300 ms.
 */
describe('loadingPhase', () => {
  const loading = signal(false);
  let phase: () => string;

  beforeEach(() => {
    vi.useFakeTimers();
    loading.set(false);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    phase = TestBed.runInInjectionContext(() => loadingPhase(loading));
    TestBed.tick();
  });

  afterEach(() => vi.useRealTimers());

  const set = (value: boolean) => {
    loading.set(value);
    TestBed.tick();
  };

  it('sin carga está listo', () => {
    expect(phase()).toBe('ready');
  });

  it('una respuesta en menos de 150 ms nunca pasa por el esqueleto', () => {
    set(true);
    expect(phase()).toBe('pending');
    vi.advanceTimersByTime(149);
    expect(phase()).toBe('pending');
    set(false);
    expect(phase()).toBe('ready');
    vi.advanceTimersByTime(500);
    expect(phase()).toBe('ready');
  });

  it('pasados 150 ms muestra el esqueleto y lo mantiene al menos 300 ms', () => {
    set(true);
    vi.advanceTimersByTime(150);
    expect(phase()).toBe('skeleton');
    vi.advanceTimersByTime(10);
    set(false);
    expect(phase()).toBe('skeleton');
    vi.advanceTimersByTime(289);
    expect(phase()).toBe('skeleton');
    vi.advanceTimersByTime(1);
    expect(phase()).toBe('ready');
  });

  it('si el esqueleto ya estuvo 300 ms, se va en cuanto llegan los datos', () => {
    set(true);
    vi.advanceTimersByTime(150 + 400);
    set(false);
    expect(phase()).toBe('ready');
  });

  it('si la carga vuelve durante la permanencia mínima, el esqueleto sigue sin parpadear', () => {
    set(true);
    vi.advanceTimersByTime(150);
    set(false);
    vi.advanceTimersByTime(100);
    set(true);
    vi.advanceTimersByTime(1000);
    expect(phase()).toBe('skeleton');
    set(false);
    expect(phase()).toBe('ready');
  });

  it('acepta umbrales propios', () => {
    const custom = TestBed.runInInjectionContext(() => loadingPhase(loading, { delayMs: 50, minMs: 100 }));
    TestBed.tick();
    set(true);
    vi.advanceTimersByTime(50);
    expect(custom()).toBe('skeleton');
    set(false);
    vi.advanceTimersByTime(99);
    expect(custom()).toBe('skeleton');
    vi.advanceTimersByTime(1);
    expect(custom()).toBe('ready');
  });
});
