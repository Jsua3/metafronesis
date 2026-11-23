import { COARSE_POINTER_QUERY, matchesMedia, watchMedia } from './pointer-modality.util';

/** jsdom no implementa matchMedia: cada prueba instala el suyo y lo retira al terminar. */
function installMatchMedia(matches: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const list = {
    matches,
    addEventListener: vi.fn((_type: string, cb: (event: { matches: boolean }) => void) => listeners.add(cb)),
    removeEventListener: vi.fn((_type: string, cb: (event: { matches: boolean }) => void) => listeners.delete(cb)),
  };
  const mm = vi.fn(() => list);
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: mm });
  return { list, listeners, mm };
}

describe('pointer-modality', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');

  afterEach(() => {
    if (original) Object.defineProperty(window, 'matchMedia', original);
    else delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('la consulta de puntero grueso es la del CSS del juego', () => {
    expect(COARSE_POINTER_QUERY).toBe('(pointer: coarse)');
  });

  it('matchesMedia devuelve false si el navegador no implementa matchMedia', () => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    expect(matchesMedia(COARSE_POINTER_QUERY)).toBe(false);
  });

  it('matchesMedia devuelve false si matchMedia lanza', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => { throw new Error('bloqueado'); },
    });
    expect(matchesMedia(COARSE_POINTER_QUERY)).toBe(false);
  });

  it('matchesMedia refleja la consulta', () => {
    installMatchMedia(true);
    expect(matchesMedia(COARSE_POINTER_QUERY)).toBe(true);
    installMatchMedia(false);
    expect(matchesMedia(COARSE_POINTER_QUERY)).toBe(false);
  });

  it('watchMedia avisa de los cambios y devuelve la función que deja de escuchar', () => {
    const { list, listeners } = installMatchMedia(false);
    const seen: boolean[] = [];
    const stop = watchMedia(COARSE_POINTER_QUERY, matches => seen.push(matches));
    expect(listeners.size).toBe(1);
    listeners.forEach(cb => cb({ matches: true }));
    expect(seen).toEqual([true]);
    stop();
    expect(listeners.size).toBe(0);
    expect(list.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('watchMedia sin soporte devuelve una función inerte', () => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    const stop = watchMedia(COARSE_POINTER_QUERY, () => { throw new Error('no debería llamarse'); });
    expect(() => stop()).not.toThrow();
  });
});
