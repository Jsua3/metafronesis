import { sheetSourceUrl } from './kit-raster';

describe('kit-raster', () => {
  afterEach(() => vi.restoreAllMocks());

  it('una URL pasa tal cual', () => {
    expect(sheetSourceUrl({ kind: 'url', url: '/assets/x.png' })).toBe('/assets/x.png');
  });

  it('una hoja compuesta pasa a data URL una sola vez', () => {
    const putImageData = vi.fn();
    const context = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAA');
    const image = { width: 2, height: 1, rgba: new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]) };
    expect(sheetSourceUrl({ kind: 'rgba', image })).toBe('data:image/png;base64,AAA');
    expect(sheetSourceUrl({ kind: 'rgba', image })).toBe('data:image/png;base64,AAA');
    expect(toDataURL).toHaveBeenCalledTimes(1);
    expect(putImageData).toHaveBeenCalledTimes(1);
  });

  it('sin contexto 2D (jsdom sin canvas) devuelve null en vez de romper', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(sheetSourceUrl({ kind: 'rgba', image: { width: 1, height: 1, rgba: new Uint8Array(4) } })).toBeNull();
  });
});
