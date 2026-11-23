import { describe, expect, it } from 'vitest';
import { CASOS_DE_REGLAS_DE_SALA } from './reglas-salas-casos.fixture';
import { catalogoDeReglas, revisarSalas, type DocumentoDeSalas, type HallazgoDeSala } from './reglas-de-sala';
import type { ManifiestoDePiezas } from '../../simulator/sala/catalogo';

// Se compara lo que dice el servidor (regla, ruta, mensaje); `otra` es solo del editor.
const ordenar = (hallazgos: readonly HallazgoDeSala[]) => hallazgos.map(({ regla, ruta, mensaje }) => ({ regla, ruta, mensaje })).sort((a, b) =>
  a.regla.localeCompare(b.regla) || a.ruta.localeCompare(b.ruta) || a.mensaje.localeCompare(b.mensaje));
const { catalogo, casos } = CASOS_DE_REGLAS_DE_SALA;

describe('reglas de sala', () => {
  it.each(casos)('$nombre da lo mismo que el servidor', c => {
    expect(ordenar(revisarSalas(c.documento as DocumentoDeSalas, 'sinCatalogo' in c ? null : catalogo)))
      .toEqual(ordenar(c.hallazgos));
  });
  it('catalogoDeReglas saca del manifiesto las mismas claves que el servidor', () => {
    const manifiesto = { geometria: { anchos: catalogo.anchos }, piezas: catalogo.piezas,
      pisos: { 'vinilo-a': {} }, muros: { 'liso/blanco': {} }, propios: ['propio.png'], tapetes: ['tapete.png'] } as unknown as ManifiestoDePiezas;
    expect(catalogoDeReglas(manifiesto)).toEqual(catalogo);
  });
  it('OCL-17 en una sala de 1920 con 40 muebles tarda menos de 150 ms', () => {
    const doc = structuredClone(casos.find(c => c.nombre === 'sala ancha accesible')!.documento) as DocumentoDeSalas;
    const mapa = doc['x-siep'].escenas[0].mapa!;
    mapa.objetos = Array.from({ length: 40 }, (_, i) => ({ tipo: 'PROP', colision: true, x: 500 + i * 25, y: 350, ancho: 12, alto: 20 }));
    const inicio = performance.now();
    revisarSalas(doc, catalogo);
    expect(performance.now() - inicio).toBeLessThan(150);
  });
});
