import { altoTapado } from './cubierta';

const caja = (top: number, height: number, width = 300) => ({ top, bottom: top + height, width, height });

describe('altoTapado (lo que la interfaz tapa del lienzo, en vivo)', () => {
  it('sin nada visible no tapa', () => {
    expect(altoTapado(700, [])).toBe(0);
  });

  it('cuenta lo que se monta encima del cuadro, no solo su caja', () => {
    // Cuadro de diálogo desde 560; «Puedes conocer más…» en 450 y la fila «Volver al mapa» en 345, por fuera de él.
    expect(altoTapado(700, [caja(560, 140), caja(450, 30), caja(345, 40)])).toBe(355);
  });

  it('ignora lo que no se ve (sin tamaño, la línea oculta para lector de pantalla) y lo que queda bajo el lienzo', () => {
    expect(altoTapado(700, [caja(560, 140), caja(100, 0), caja(120, 1, 1), caja(720, 30)])).toBe(140);
  });
});
