import { clipsDe, cuadroDelClip, piezaDelObjeto } from './mueble-vivo';
import type { ManifiestoDePiezas } from './catalogo';

/** Muebles y objetos de O1 en el juego: su pieza del manifiesto y sus animaciones por pasos enteros (regla 6 de calidad). */
describe('mueble vivo', () => {
  const manifiesto = {
    muebles: {
      'hospital/monitor': { ruta: 'piezas/muebles/hospital/monitor.png', ancho: 30, alto: 40, cuadros: 4, fps: 4, apoyo: [15, 40] },
      'hospital/camilla': { ruta: 'piezas/muebles/hospital/camilla.png', ancho: 98, alto: 44, cuadros: 1, apoyo: [49, 44] },
    },
    objetos: {
      'casa/televisor': {
        ruta: 'piezas/objetos/casa/televisor.png', ancho: 40, alto: 30, cuadros: 12, fps: 6, apoyo: [20, 30],
        reemplaza: 'escenarios/casa/arte/objetos/televisor.png',
        animaciones: {
          reposo: { bucle: true, de: 0, hasta: 7, fps: 6 },
          cerca: { bucle: false, de: 8, hasta: 11, fps: 10, luego: 'reposo' },
          revisar: { bucle: false, de: 8, hasta: 11, fps: 10, sostener: true },
        },
      },
    },
    herramientas: {},
  } as unknown as ManifiestoDePiezas;
  const ficha = (seccion: 'muebles' | 'objetos', clave: string) =>
    (manifiesto as unknown as Record<string, Record<string, never>>)[seccion][clave];

  it('la pieza de un objeto: por su ruta o por el arte viejo que reemplaza', () => {
    expect(piezaDelObjeto('/assets/biblioteca/piezas/muebles/hospital/monitor.png', manifiesto)?.clave).toBe('hospital/monitor');
    expect(piezaDelObjeto('/assets/biblioteca/escenarios/casa/arte/objetos/televisor.png', manifiesto)?.clave).toBe('casa/televisor');
    expect(piezaDelObjeto('/assets/biblioteca/escenarios/otra.png', manifiesto)).toBeNull();
    expect(piezaDelObjeto(undefined, manifiesto)).toBeNull();
  });

  it('sin animaciones declaradas pero con varios cuadros, el reposo los recorre todos en bucle', () => {
    expect(clipsDe(ficha('muebles', 'hospital/monitor'))['reposo']).toEqual({ de: 0, hasta: 3, fps: 4, bucle: true });
    expect(clipsDe(ficha('muebles', 'hospital/camilla'))['reposo']).toEqual({ de: 0, hasta: 0, fps: 1, bucle: true });
  });

  it('en bucle avanza por pasos enteros y vuelve a empezar', () => {
    const reposo = clipsDe(ficha('objetos', 'casa/televisor'))['reposo'];
    expect(cuadroDelClip(reposo, 0, false)).toEqual({ cuadro: 0, termino: false });
    expect(cuadroDelClip(reposo, 170, false).cuadro).toBe(1);          // 6 fps: un cuadro cada 166,7 ms
    expect(cuadroDelClip(reposo, 1340, false).cuadro).toBe(0);         // 8 cuadros después, de nuevo el primero
  });

  it('una vez: llega al último cuadro y termina', () => {
    const cerca = clipsDe(ficha('objetos', 'casa/televisor'))['cerca'];
    expect(cuadroDelClip(cerca, 150, false)).toEqual({ cuadro: 9, termino: false });
    expect(cuadroDelClip(cerca, 400, false)).toEqual({ cuadro: 11, termino: true });
  });

  it('con movimiento reducido no se anima: el reposo queda en su primer cuadro y lo de una vez salta al final', () => {
    const clips = clipsDe(ficha('objetos', 'casa/televisor'));
    expect(cuadroDelClip(clips['reposo'], 900, true)).toEqual({ cuadro: 0, termino: false });
    expect(cuadroDelClip(clips['revisar'], 0, true)).toEqual({ cuadro: 11, termino: true });
  });
});
