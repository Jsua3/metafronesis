import { Signal, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiDataStateSource, UiDataStateValue, errorKindFromStatus, uiDataState } from './ui-data-state';

/**
 * uiDataState() (plan visual §2.5, F2-5; Review Focus 3 y 4): UN solo estado por bloque de datos, con la regla de
 * tiempos del esqueleto INTEGRADA (revisión de F2, I3): mientras la respuesta pueda ser rápida (< 150 ms) el estado
 * es «pending» (se sigue viendo lo que había, sin vacío ni esqueleto); pasado el umbral, «loading» al menos 300 ms.
 * El vacío y el error nunca coexisten.
 */
describe('uiDataState', () => {
  const loading = signal(false);
  const error = signal<unknown>(null);
  const isEmpty = signal(true);
  let state: Signal<UiDataStateValue>;

  const create = (source: UiDataStateSource = { loading, error, isEmpty }) =>
    TestBed.runInInjectionContext(() => uiDataState(source));
  const set = (apply: () => void) => {
    apply();
    TestBed.tick();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    loading.set(false);
    error.set(null);
    isEmpty.set(true);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    state = create();
    TestBed.tick();
  });

  afterEach(() => vi.useRealTimers());

  it('nunca devuelve vacío y error a la vez: el error gana al vacío', () => {
    set(() => error.set(new Error('500')));
    expect(state()).toBe('error');
  });

  it('sin error ni carga: vacío o listo según los datos, y sigue a las señales', () => {
    expect(state()).toBe('empty');
    set(() => isEmpty.set(false));
    expect(state()).toBe('ready');
    set(() => error.set({ status: 0 }));
    expect(state()).toBe('error');
  });

  it('una carga que responde en menos de 150 ms pasa por «pending» y nunca por el vacío ni por el esqueleto', () => {
    set(() => loading.set(true));
    expect(state()).toBe('pending');
    vi.advanceTimersByTime(149);
    expect(state()).toBe('pending');
    set(() => {
      loading.set(false);
      isEmpty.set(false);
    });
    expect(state()).toBe('ready');
  });

  it('pasados 150 ms es «loading» y se queda al menos 300 ms aunque los datos lleguen antes', () => {
    set(() => loading.set(true));
    vi.advanceTimersByTime(150);
    expect(state()).toBe('loading');
    set(() => loading.set(false));
    expect(state()).toBe('loading');
    vi.advanceTimersByTime(300);
    expect(state()).toBe('empty');
  });

  it('al reintentar con el error anterior aún puesto se ve la carga, no el error', () => {
    set(() => error.set('fallo previo'));
    set(() => loading.set(true));
    expect(state()).toBe('pending');
    vi.advanceTimersByTime(150);
    expect(state()).toBe('loading');
  });
});

describe('errorKindFromStatus', () => {
  it('traduce el código HTTP a la clase de error que se muestra', () => {
    expect(errorKindFromStatus(0)).toBe('network');
    expect(errorKindFromStatus(401)).toBe('forbidden');
    expect(errorKindFromStatus(403)).toBe('forbidden');
    expect(errorKindFromStatus(404)).toBe('not-found');
    expect(errorKindFromStatus(500)).toBe('server');
    expect(errorKindFromStatus(undefined)).toBe('server');
  });
});
