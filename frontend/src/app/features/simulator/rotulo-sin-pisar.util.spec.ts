import { ALTO_DE_PERSONA_PX, cajaDelCuerpo, SEPARACION_BAJO_LOS_PIES_PX, SEPARACION_SOBRE_LA_CABEZA_PX, yDelRotulo } from './rotulo-sin-pisar.util';

/**
 * El rótulo con el nombre va bajo los pies, como siempre; si ahí pisa el cuerpo de otra persona o un rótulo ya puesto, sube
 * sobre la cabeza, separado de ella. Caso de la captura del juego real: «Enfermera de urgencias» tapaba la cabeza del
 * hermano mayor, que estaba justo debajo.
 */
describe('rótulo sin pisar', () => {
  const ANCHO = 120, ALTO = 18;
  const abajo = (pies: number) => pies + SEPARACION_BAJO_LOS_PIES_PX;
  const arriba = (pies: number) => pies - ALTO_DE_PERSONA_PX - SEPARACION_SOBRE_LA_CABEZA_PX - ALTO;

  it('sin nadie cerca, bajo los pies como siempre', () => {
    expect(yDelRotulo(300, 200, ANCHO, ALTO, ALTO_DE_PERSONA_PX, [])).toBe(abajo(200));
  });

  it('si debajo hay otra persona, sube sobre la cabeza sin tocarla', () => {
    const hermano = cajaDelCuerpo(310, 250);   // sus pies 50 px más abajo: su cabeza cae donde iría el rótulo
    const y = yDelRotulo(300, 200, ANCHO, ALTO, ALTO_DE_PERSONA_PX, [hermano]);
    expect(y).toBe(arriba(200));
    expect(y + ALTO).toBeLessThan(200 - ALTO_DE_PERSONA_PX);   // el rótulo termina antes de la cabeza propia
  });

  it('si debajo pisa un rótulo ya puesto, también sube', () => {
    const otro = { x0: 260, y0: abajo(200) + 4, x1: 380, y1: abajo(200) + 4 + ALTO };
    expect(yDelRotulo(300, 200, ANCHO, ALTO, ALTO_DE_PERSONA_PX, [otro])).toBe(arriba(200));
  });

  it('una persona lejos a un lado no lo mueve', () => {
    expect(yDelRotulo(300, 200, ANCHO, ALTO, ALTO_DE_PERSONA_PX, [cajaDelCuerpo(500, 250)])).toBe(abajo(200));
  });

  it('si pisa arriba y abajo, se queda donde pisa menos', () => {
    const debajo = cajaDelCuerpo(300, 250);
    const encimaChico = { x0: 350, y0: arriba(200), x1: 360, y1: arriba(200) + 4 };
    expect(yDelRotulo(300, 200, ANCHO, ALTO, ALTO_DE_PERSONA_PX, [debajo, encimaChico])).toBe(arriba(200));
    const encimaGrande = { x0: 200, y0: arriba(200) - 20, x1: 400, y1: arriba(200) + 40 };
    expect(yDelRotulo(300, 200, ANCHO, ALTO, ALTO_DE_PERSONA_PX, [cajaDelCuerpo(360, 250), encimaGrande])).toBe(abajo(200));
  });

  it('un objeto sin cuerpo de persona (alto 0) sube solo lo justo sobre su marca', () => {
    const y = yDelRotulo(300, 200, ANCHO, ALTO, 0, [cajaDelCuerpo(300, 250)]);
    expect(y).toBe(200 - SEPARACION_SOBRE_LA_CABEZA_PX - ALTO);
  });
});
