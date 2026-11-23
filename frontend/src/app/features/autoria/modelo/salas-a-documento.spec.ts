import { describe, expect, it } from 'vitest';
import { trasladarChoque } from './choques-mueble';
import { CASO_HOSPITAL } from '../testing/hospital';
import { anclaDeElemento, documentoDeSalas, elementoDeRuta, faltasPorSala } from './salas-a-documento';
import { CASOS_DE_REGLAS_DE_SALA } from './reglas-salas-casos.fixture';

describe('documento de salas', () => {
  function casoConMuebleEnLlegada() {
    const caso = structuredClone(CASO_HOSPITAL);
    const destino = caso.salas[1];
    destino.choques['mueble-prueba'] = { x: 500, y: 300, ancho: 50, alto: 50 };
    trasladarChoque(destino, 'mueble-prueba', 1000, 80);
    return caso;
  }

  it('un mueble que la docente mueve encima de la llegada de una puerta dispara OCL-16', () => {
    const caso = casoConMuebleEnLlegada();
    expect(faltasPorSala(caso, CASOS_DE_REGLAS_DE_SALA.catalogo).get(caso.salas[0].id)
      ?.some(f => f.regla === 'OCL-16' && f.elemento.id === 'a-pasillo')).toBe(true);
  });

  it('al sacarlo de ah?, OCL-16 desaparece', () => {
    const caso = casoConMuebleEnLlegada();
    trasladarChoque(caso.salas[1], 'mueble-prueba', -1000, -80);
    expect(faltasPorSala(caso, CASOS_DE_REGLAS_DE_SALA.catalogo).get(caso.salas[0].id)
      ?.some(f => f.regla === 'OCL-16' && f.elemento.id === 'a-pasillo') ?? false).toBe(false);
  });

  it('OCL-14 marca las dos piezas del par (el servidor señala solo la primera)', () => {
    const caso = structuredClone(CASO_HOSPITAL);
    const sala = caso.salas.find(s => s.estructura && caso.escenas.some(e => e.salaId === s.id))!;
    sala.estructura!.piezas = [
      { id: 'cuadro-1', tipo: 'cuadro', modelo: 'a', muro: 'fondo', pos: 300 },
      { id: 'cuadro-2', tipo: 'cuadro', modelo: 'a', muro: 'fondo', pos: 350 },
    ];
    const marcadas = (faltasPorSala(caso, CASOS_DE_REGLAS_DE_SALA.catalogo).get(sala.id) ?? [])
      .filter(f => f.regla === 'OCL-14').map(f => `${f.elemento.tipo}:${f.elemento.id}`);
    expect(marcadas.sort()).toEqual(['pieza:cuadro-1', 'pieza:cuadro-2']);
  });

  it('con el ejemplo 7.2 del contrato, umbral y llegada de cada puerta son los de la tabla', () => {
    const mapa = documentoDeSalas(CASO_HOSPITAL)['x-siep'].escenas[0].mapa!;
    const pasillo = mapa.objetos!.find(o => o['clave'] === 'a-pasillo')!;
    const triaje = mapa.objetos!.find(o => o['clave'] === 'a-triaje')!;
    expect([pasillo['x'], pasillo['y'], pasillo['metadatos'].entryX, pasillo['metadatos'].entryY])
      .toEqual([150, 406, 1511, 390]);
    expect([triaje['x'], triaje['y']]).toEqual([1270, 260]);
  });

  it('las colisiones de pared son las del contrato a 1440', () => {
    const mapa = documentoDeSalas(CASO_HOSPITAL)['x-siep'].escenas[0].mapa!;
    expect(mapa.colisiones!.slice(0, 4).map(({ x, y, ancho, alto }) => [x, y, ancho, alto]))
      .toEqual([[0, 0, 1440, 236], [0, 236, 134, 250], [1306, 236, 134, 250], [0, 486, 1440, 42]]);
  });

  it('mover la puerta par cambia la llegada de la puerta que lleva a ella', () => {
    const caso = structuredClone(CASO_HOSPITAL);
    caso.salas[1].puertas.find(p => p.id === 'a-sala-espera')!.pos = 200;
    const objetos = documentoDeSalas(caso)['x-siep'].escenas[0].mapa!.objetos!;
    expect(objetos.find(o => o['clave'] === 'a-pasillo')!['metadatos'].entryY).toBe(430);
  });

  it('dos escenas de la misma sala dan una sola falta', () => {
    const caso = structuredClone(CASO_HOSPITAL);
    caso.escenas.push({ ...caso.escenas[0], id: 'otra' });
    caso.salas[0].puertas[0].hacia = null;
    const faltas = faltasPorSala(caso, CASOS_DE_REGLAS_DE_SALA.catalogo).get(caso.salas[0].id)!;
    expect(faltas.filter(f => f.regla === 'OCL-15' && f.elemento.id === 'a-pasillo')).toHaveLength(1);
  });

  it('elementoDeRuta resuelve piezas[k] y objetos[k] al id de la pieza y de la puerta', () => {
    const caso = CASO_HOSPITAL;
    const objetos = documentoDeSalas(caso)['x-siep'].escenas[0].mapa!.objetos!;
    const indice = objetos.findIndex(o => o['clave'] === 'a-pasillo');
    const salaId = caso.salas[0].id;
    expect(elementoDeRuta('x-siep.escenas[0].mapa.estructura.piezas[0]', caso))
      .toEqual({ salaId, elemento: { tipo: 'pieza', id: 'v1' } });
    expect(elementoDeRuta(`x-siep.escenas[0].mapa.objetos[${indice}].metadatos`, caso))
      .toEqual({ salaId, elemento: { tipo: 'puerta', id: 'a-pasillo' } });
    expect(anclaDeElemento(salaId, { tipo: 'aparicion', id: null })).toBe(`sala-${salaId}`);
  });

  it('usa la puerta de regreso o la aparición cuando no hay par', () => {
    const caso = structuredClone(CASO_HOSPITAL);
    const puerta = caso.salas[0].puertas[0];
    delete puerta.par;
    const salida = () => documentoDeSalas(caso)['x-siep'].escenas[0].mapa!.objetos!
      .find(o => o['clave'] === puerta.id)!['metadatos'];
    expect([salida().entryX, salida().entryY]).toEqual([1511, 390]);
    caso.salas[1].puertas = [];
    expect([salida().entryX, salida().entryY]).toEqual([caso.salas[1].entrada.x, caso.salas[1].entrada.y]);
  });

  it('asigna a cada sala utilizada el aviso de catálogo ausente', () => {
    const faltas = faltasPorSala(CASO_HOSPITAL, null);
    for (const sala of CASO_HOSPITAL.salas) {
      expect(faltas.get(sala.id)?.filter(f => f.regla === 'OCL-18')).toHaveLength(1);
    }
  });
});
