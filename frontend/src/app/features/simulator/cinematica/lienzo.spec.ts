import { LienzoDeCinematica, medirVista } from './lienzo';

describe('cinematica/lienzo', () => {
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
});
