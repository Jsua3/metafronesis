import { objetivoCamara, Vista } from './camara';

import { limitarASala } from './camara';

describe('cámara con cobertura de pantalla', () => {
  it.each([[390, 844], [820, 1180]])('cubre %i por %i con zoom entero', (ancho, alto) => {
    const vista = { ancho, alto, dpr: 1, cubiertoAbajo: 0, cubrir: true } as Vista;
    const estado = objetivoCamara({ vista, sala: { ancho: 1200, alto: 528 },
      jugador: { x: 600, y: 300 }, momento: { tipo: 'explorar' }, cercana: false, acercarAuto: true }, null);
    expect(Number.isInteger(estado.zoom)).toBe(true);
    expect(estado.zoom * 528).toBeGreaterThanOrEqual(alto);
    expect(estado.zoom * 1200).toBeGreaterThanOrEqual(ancho);
  });
  it('permite acercarse más en vertical aunque la ventana sea estrecha', () => {
    const vista: Vista = { ancho: 390, alto: 844, dpr: 1, cubiertoAbajo: 0, cubrir: true };
    const entrada = { vista, sala: { ancho: 1200, alto: 528 }, jugador: { x: 600, y: 300 },
      momento: { tipo: 'explorar' } as const, acercarAuto: true };
    expect(objetivoCamara({ ...entrada, cercana: true }, null).zoom)
      .toBeGreaterThan(objetivoCamara({ ...entrada, cercana: false }, null).zoom);
  });
  it('mantiene a quien habla fuera de la hoja lateral incluso cerca del borde de la sala', () => {
    const vista: Vista = { ancho: 844, alto: 390, dpr: 1, cubiertoAbajo: 0, cubrir: true,
      placas: [{ x: 355, y: 0, ancho: 489, alto: 390 }] };
    const persona = { x: 1150, y: 270, cuerpo: { mitad: 20, alto: 64 } };
    const estado = objetivoCamara({ vista, sala: { ancho: 1200, alto: 528 }, jugador: { x: 1100, y: 270 },
      momento: { tipo: 'conversacion', con: persona }, cercana: false, acercarAuto: false }, null);
    const bordeDerecho = vista.ancho / 2 + (persona.x + 20 - estado.centro.x) * estado.zoom;
    expect(bordeDerecho).toBeLessThanOrEqual(355);
  });
  it('limita también el centro después de esquivar placas al explorar', () => {
    const vista: Vista = { ancho: 390, alto: 844, dpr: 1, cubiertoAbajo: 0, cubrir: true };
    expect(limitarASala({ centro: { x: 700, y: 602 }, zoom: 2 }, vista, { ancho: 1440, alto: 528 }).centro.y).toBe(317);
  });
});
