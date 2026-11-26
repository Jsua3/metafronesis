import { readFileSync } from 'fs';
import { join } from 'path';
import { cuadroDelPlano } from './escenas';
import { leerCinematica } from './lectura';
import { LienzoDeCinematica, medirVista } from './lienzo';

describe('cinematica/lienzo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const planos = (...p: object[]) => leerCinematica({ cinematica: { planos: p } })!.planos;

  function capturarImagenes(): HTMLImageElement[] {
    const imagenes: HTMLImageElement[] = [];
    vi.stubGlobal('Image', function () {
      const img = document.createElement('img');
      imagenes.push(img);
      return img;
    });
    return imagenes;
  }

  function contextoFalso() {
    const contexto = {
      drawImage: vi.fn(), setTransform: vi.fn(), fillRect: vi.fn(), clearRect: vi.fn(), putImageData: vi.fn(),
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(contexto as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('ImageData', class {
      constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {}
    });
    return contexto;
  }

  describe('medirVista: escala entera de píxeles físicos', () => {
    it.each([
      // ancho CSS, alto CSS, dpr → k, ancho y alto en píxeles del arte
      [1920, 803, 1, 3, 640, 268],
      [1366, 571, 1, 2, 683, 286],
      [1280, 535, 1.5, 3, 640, 268],
      [375, 312, 3, 2, 563, 468],
      [800, 335, 1, 1, 800, 335],
    ])('%i × %i a dpr %f → k %i, %i × %i', (w, h, dpr, k, ancho, alto) => {
      const m = medirVista(w, h, dpr);
      expect(m).toEqual({ k, dpr, ancho, alto });
      // El arte, a k píxeles físicos por píxel, cubre la banda entera.
      expect(m.ancho * m.k).toBeGreaterThanOrEqual(Math.round(w * dpr));
      expect(m.alto * m.k).toBeGreaterThanOrEqual(Math.round(h * dpr));
    });

    it('valores raros no rompen la medida', () => {
      expect(medirVista(0, 0, 0)).toEqual({ k: 1, dpr: 1, ancho: 1, alto: 1 });
      expect(medirVista(Number.NaN, 100, Number.NaN).k).toBe(1);
    });
  });

  it('sin contexto 2D (jsdom) no pinta, no lanza y la preparación termina igual', async () => {
    const canvas = { getContext: () => null, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const lienzo = new LienzoDeCinematica(canvas);
    expect(lienzo.disponible).toBe(false);
    lienzo.ajustar(medirVista(640, 268, 1));
    expect(lienzo.pintar({
      decorado: 'calle', momento: 'tarde', camara: { x: 500, y: 176, zoom: 1 }, actores: [], muebles: [], ventana: null, luces: { rojo: 0, azul: 0 },
    }, null, 1)).toEqual({ dx: 0, dy: 0 });
    lienzo.destruir();
  });

  it('al destruir aborta el manifiesto y libera las solicitudes de hojas y camilla', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const imagenes = capturarImagenes();
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, opciones?: RequestInit) => {
      signal = opciones?.signal;
      return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal?.reason)));
    }));
    const lienzo = new LienzoDeCinematica(document.createElement('canvas'));
    const primero = vi.fn();
    const pendiente = lienzo.preparar(planos({ escena: 'urgencias-llegada' }), primero);
    expect(imagenes).toHaveLength(5);
    lienzo.destruir();
    expect(signal?.aborted).toBe(true);
    for (const img of imagenes) {
      expect([img.onload, img.onerror, img.getAttribute('src')]).toEqual([null, null, null]);
    }
    await pendiente;
    expect(primero).not.toHaveBeenCalled();
  });

  it('una pieza que termina de cargar al cerrar no llega a extraer sus píxeles', async () => {
    const contextos = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const imagenes = capturarImagenes();
    const manifiesto = JSON.parse(readFileSync(join(__dirname, '../../../../assets/biblioteca/piezas/manifiesto.json'), 'utf-8'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(manifiesto) }));
    const lienzo = new LienzoDeCinematica(document.createElement('canvas'));
    const pendiente = lienzo.preparar(planos({ escena: 'casa-ventana' }));
    await vi.waitFor(() => expect(imagenes.some(img => img.getAttribute('src')?.includes('/piezas/'))).toBe(true));
    contextos.mockClear();
    imagenes.find(img => img.getAttribute('src')?.includes('/piezas/'))!.dispatchEvent(new Event('load'));
    lienzo.destruir();
    await pendiente;
    expect(contextos).not.toHaveBeenCalled();
    expect(imagenes.every(img => img.onload === null && img.onerror === null)).toBe(true);
  });

  it('dibuja al familiar con sus hojas genéricas si falta alguna hoja de la receta escrita', async () => {
    const ctx = contextoFalso();
    const imagenes = capturarImagenes();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const lienzo = new LienzoDeCinematica(document.createElement('canvas'));
    const reparto = ['abuela-familia', 'sin-hojas', 'adolescente'];
    const guion = planos({ escena: 'urgencias-familia', personas: reparto });
    const pendiente = lienzo.preparar(guion);
    for (const img of imagenes) img.dispatchEvent(new Event(img.src.includes('/sin-hojas/walk.png') ? 'error' : 'load'));
    await pendiente;
    lienzo.pintar(cuadroDelPlano(guion[0], 0, lienzo.vista, true), null, 1);
    const hojasDibujadas = ctx.drawImage.mock.calls.map(([img]) => (img as HTMLImageElement).src).filter(Boolean);
    expect(hojasDibujadas).toHaveLength(3);
    expect(hojasDibujadas.some(src => src.endsWith('/estudiante-consultante/idle.png'))).toBe(true);
    lienzo.destruir();
  });

  it('prepara el resplandor recortado antes de pintar y lo reutiliza con el mismo tamaño', async () => {
    const ctx = contextoFalso();
    const imagenes = capturarImagenes();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const lienzo = new LienzoDeCinematica(document.createElement('canvas'));
    const medida = medirVista(1019, 426, 1);
    lienzo.ajustar(medida);
    const guion = planos({ escena: 'urgencias-llegada' });
    const pendiente = lienzo.preparar(guion);
    for (const img of imagenes) img.dispatchEvent(new Event('error'));
    await pendiente;
    expect(ctx.putImageData).toHaveBeenLastCalledWith(expect.objectContaining({ width: 753, height: 528 }), 0, 0);
    ctx.putImageData.mockClear();
    lienzo.pintar(cuadroDelPlano(guion[0], 0, lienzo.vista, true), null, 1);
    lienzo.ajustar(medida);
    expect(ctx.putImageData).not.toHaveBeenCalled();
    lienzo.destruir();
  });

  it('la caché del decorado conserva la luz y los lienzos sin las matrices de los píxeles compuestos', () => {
    contextoFalso();
    const lienzo = new LienzoDeCinematica(document.createElement('canvas'));
    const cache = lienzo as unknown as {
      guardarDecorado(datos: import('./decorados').DecoradoPintado): void;
      decorados: Map<string, { datos: Record<string, unknown> }>;
    };
    const ambiente = new Uint8ClampedArray(4);
    const imagen = { ancho: 1, alto: 1, rgba: new Uint8ClampedArray(4) };
    cache.guardarDecorado({
      clave: 'calle:noche', ancho: 1, alto: 1, ambiente, imagen, grado: [255, 255, 255],
      derrame: imagen, vidrio: { x: 0, y: 0, w: 1, h: 1, mascara: new Uint8Array([1]) },
    });
    expect(cache.decorados.get('calle:noche')?.datos).toEqual({
      ancho: 1, alto: 1, ambiente, grado: [255, 255, 255], vidrio: { x: 0, y: 0, w: 1, h: 1 },
    });
    lienzo.destruir();
  });
});
