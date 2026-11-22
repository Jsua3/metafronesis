import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PERF_MAX_SAMPLES, percentile, perfCancel, perfEnd, perfEndNextPaint, perfReset, perfStart, perfSummary } from './perf-marks';

/**
 * Instrumentación del cliente para RNF-05 (plan visual F9-3): cuánto pasa de «decisión elegida» a «escena visible» y de
 * «interacción» a «respuesta visible». Aquí se fija la aritmética (percentiles) y que medir NUNCA rompe la pantalla.
 */
describe('perf-marks', () => {
  beforeEach(() => {
    perfReset();
    vi.restoreAllMocks();
  });

  // Un aserto fallido no puede dejar el fotograma simulado puesto para las demás pruebas.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // req: RNF-05, RNF-005
  it('percentile: mediana y p95 de una lista (vecino más cercano), sin tocar el original', () => {
    const values = [50, 10, 40, 20, 30];
    expect(percentile(values, 50)).toBe(30);
    expect(percentile(values, 95)).toBe(50);
    expect(percentile(values, 0)).toBe(10);
    expect(values).toEqual([50, 10, 40, 20, 30]);
    expect(percentile([], 50)).toBeNull();
  });

  it('mide el tiempo entre perfStart y perfEnd y lo resume por nombre (cuenta, p50, p95)', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    perfStart('decision-to-scene');
    now += 120;
    expect(perfEnd('decision-to-scene')).toBe(120);
    perfStart('decision-to-scene');
    now += 80;
    perfEnd('decision-to-scene');

    expect(perfSummary()['decision-to-scene']).toEqual({ count: 2, p50: 80, p95: 120 });
  });

  it('perfEnd sin perfStart no mide nada y no falla', () => {
    expect(perfEnd('nunca-empezo')).toBeNull();
    expect(perfSummary()['nunca-empezo']).toBeUndefined();
  });

  it('un segundo perfStart reinicia la medición (la decisión que no cambió de escena no se arrastra)', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    perfStart('interaction-to-response');
    now += 900;
    perfStart('interaction-to-response');
    now += 40;

    expect(perfEnd('interaction-to-response')).toBe(40);
  });

  it('conserva solo las últimas PERF_MAX_SAMPLES muestras de cada medida', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    for (let i = 0; i < PERF_MAX_SAMPLES + 25; i++) {
      perfStart('x');
      now += 10;
      perfEnd('x');
    }
    expect(perfSummary()['x'].count).toBe(PERF_MAX_SAMPLES);
  });

  it('descarta una medida de más de 30 s: una decisión que no cambió de escena no se mide contra otra puerta', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    perfStart('decision-to-scene');
    now = 31_000;

    expect(perfEnd('decision-to-scene')).toBeNull();
    expect(perfSummary()['decision-to-scene']).toBeUndefined();
  });

  it('perfEndNextPaint termina en el segundo fotograma DESPUÉS de llamarla, contando desde el perfStart (la respuesta ya estaba puesta)', () => {
    const frames: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback));
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    perfStart('interaction-to-response');   // el clic
    now = 250;                               // la respuesta llegó por la red y se puso en pantalla
    perfEndNextPaint('interaction-to-response');
    now = 266;
    frames.shift()!();                       // el primer fotograma aún pinta lo de antes
    expect(perfSummary()['interaction-to-response']).toBeUndefined();
    now = 283;
    frames.shift()!();

    expect(perfSummary()['interaction-to-response']).toEqual({ count: 1, p50: 283, p95: 283 });
  });

  it('perfEndNextPaint sin perfStart no mide nada (el diálogo que no nació de una interacción no cuenta)', () => {
    const frames: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback));

    perfEndNextPaint('interaction-to-response');

    expect(frames).toHaveLength(0);
    expect(perfSummary()['interaction-to-response']).toBeUndefined();
  });

  it('perfCancel descarta una medida empezada que ya no va a terminar', () => {
    perfStart('decision-to-scene');
    perfCancel('decision-to-scene');

    expect(perfEnd('decision-to-scene')).toBeNull();
    expect(perfSummary()['decision-to-scene']).toBeUndefined();
  });

  it('si el navegador no tiene performance.now, medir no rompe nada', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => { throw new Error('sin reloj'); });
    expect(() => perfStart('x')).not.toThrow();
    expect(perfEnd('x')).toBeNull();
  });
});
