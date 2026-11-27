import { pasoSalida } from './caso/guia';
import { screenClass, textoSegunPantalla } from './screen-class.util';

describe('clases de pantalla del simulador', () => {
  it.each([
    [390, 844, 'phone'], [599, 500, 'phone'], [844, 390, 'low-landscape'],
    [599, 390, 'low-landscape'], [600, 500, 'tablet'], [820, 1180, 'tablet'],
    [1023, 500, 'tablet'], [1024, 499, 'other'], [1180, 820, 'other'],
  ])('clasifica %i × %i como %s', (width, height, expected) => {
    expect(screenClass(width, height)).toBe(expected);
  });

  it('con menú, el paso de salida no manda a buscar «Ir a…» arriba a la derecha; sin menú queda igual', () => {
    const paso = pasoSalida('Volver a la entrada');
    expect(textoSegunPantalla(paso, false)).toBe(paso);
    expect(textoSegunPantalla(paso, true)).toBe('Cuando termines en esta sala: Volver a la entrada. También llegas con «Ir a…», en el menú.');
    expect(textoSegunPantalla(null, true)).toBeNull();
  });
});
