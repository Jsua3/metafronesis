import { WORLD_FONT_FAMILY, WORLD_FONT_TIMEOUT_MS, whenWorldFontsReady } from './world-typography.util';

/**
 * Tipografía del lienzo (plan visual F6-8): los textos de Phaser usan Poppins (con respaldo) y se crean con la fuente
 * ya disponible, porque el lienzo mide el texto al crearlo y con una fuente que aún no llegó queda mal medido. Si la
 * fuente no llega nunca (red, bloqueo) no se rompe nada: pasado un plazo el texto usa el respaldo.
 */
// req: RNF-04 (REGLA-009 parte)
describe('world-typography', () => {
  afterEach(() => vi.useRealTimers());

  it('la pila de fuentes empieza por Poppins y termina en una genérica de respaldo', () => {
    expect(WORLD_FONT_FAMILY.startsWith('Poppins')).toBe(true);
    expect(WORLD_FONT_FAMILY.trim().endsWith('sans-serif')).toBe(true);
  });

  it('espera a que se carguen los pesos usados y luego a document.fonts.ready', async () => {
    const order: string[] = [];
    const fonts = {
      load: vi.fn((font: string) => { order.push('load ' + font); return Promise.resolve([]); }),
      ready: Promise.resolve().then(() => { order.push('ready'); }),
    } as unknown as FontFaceSet;
    await whenWorldFontsReady(fonts);
    expect(fonts.load).toHaveBeenCalled();
    expect((fonts.load as unknown as { mock: { calls: string[][] } }).mock.calls.every(([font]) => /Poppins|JetBrains Mono/.test(font))).toBe(true);
    expect(order[order.length - 1]).toBe('ready');
  });

  it('si la carga falla se resuelve igual: nunca rompe la escena', async () => {
    const fonts = {
      load: vi.fn(() => Promise.reject(new Error('sin red'))),
      ready: Promise.resolve(),
    } as unknown as FontFaceSet;
    await expect(whenWorldFontsReady(fonts)).resolves.toBeUndefined();
  });

  it('si la fuente nunca llega, pasado el plazo se resuelve con el respaldo', async () => {
    vi.useFakeTimers();
    const fonts = {
      load: vi.fn(() => new Promise<FontFace[]>(() => undefined)),
      ready: new Promise<FontFaceSet>(() => undefined),
    } as unknown as FontFaceSet;
    let done = false;
    const pending = whenWorldFontsReady(fonts).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(WORLD_FONT_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await pending;
    expect(done).toBe(true);
  });

  it('sin FontFaceSet (jsdom, WebView antiguo) se resuelve de inmediato', async () => {
    await expect(whenWorldFontsReady(undefined)).resolves.toBeUndefined();
  });
});
