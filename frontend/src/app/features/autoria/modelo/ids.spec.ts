import { afterEach, describe, expect, it, vi } from 'vitest';

import { hexAleatorio, nuevoId } from './ids';

describe('ids sin contexto seguro (modo aula por http://<ip>)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('nuevoId funciona aunque no exista crypto.randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(171) });
    expect(nuevoId('escena')).toBe('escena-abababab');
    expect(hexAleatorio(6)).toBe('ababab');
  });

  it('con randomUUID usa sus caracteres hexadecimales', () => {
    expect(nuevoId('linea')).toMatch(/^linea-[0-9a-f]{8}$/);
  });
});
