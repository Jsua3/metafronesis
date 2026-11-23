import { describe, expect, it } from 'vitest';
import { CASO_HOSPITAL, MUNDO_HOSPITAL } from '../testing/hospital';
import { solicitudDeSala } from './hacia-api';
import { llegada } from './geometria';
import { salaPorClaveDeNodoDe } from './desde-api';

const preparar = () => {
  const caso = structuredClone(CASO_HOSPITAL);
  const previo = structuredClone(MUNDO_HOSPITAL[0]);
  const salaPorNodo = salaPorClaveDeNodoDe(MUNDO_HOSPITAL.map(m => ({ ...m.map, nodeId: m.nodeId, nodeKey: m.rooms.find(r => r.nodeId === m.nodeId)!.nodeKey })), MUNDO_HOSPITAL);
  const nodosPorSala = new Map<string, string>();
  for (const [nodo, id] of salaPorNodo) if (!nodosPorSala.has(id)) nodosPorSala.set(id, nodo);
  const contexto = { revision: caso.revision, catalogo: caso.catalogo, personajes: caso.personajes, personajesDelCaso: [], nodosPorSala, salaPorNodo };
  return { sala: caso.salas[0], previo, contexto };
};
describe('guardar estructura y puertas', () => {
  it('guardar un cambio ajeno conserva structure y los metadatos de las puertas byte a byte', () => {
    const { sala, previo, contexto } = preparar(); sala.muebles[0].x += 8;
    const solicitud = solicitudDeSala(sala, contexto, previo).solicitud;
    expect(JSON.stringify(solicitud.map.structure)).toBe(JSON.stringify(previo.map.structure));
    for (const base of previo.objects.filter(o => o.type === 'EXIT')) {
      expect(JSON.stringify(solicitud.objects.find(o => o.key === base.key)!.metadata)).toBe(JSON.stringify(base.metadata));
    }
  });
  it('conserva la escena original cuando varias escenas comparten la sala destino', () => {
    const { sala, previo, contexto } = preparar();
    previo.objects.find(o => o.key === 'a-pasillo')!.metadata['targetNodeKey'] = 'pasillo-otra-escena';
    const ampliado = { ...contexto, salaPorNodo: new Map([['pasillo', 'pasillo'], ['pasillo-otra-escena', 'pasillo']]) };
    expect(solicitudDeSala(sala, ampliado, previo).solicitud.objects.find(o => o.key === 'a-pasillo')!.metadata['targetNodeKey']).toBe('pasillo-otra-escena');
  });
  it('el mapeo usa los mapas y conserva su orden para salas compartidas', () => {
    const mundo = structuredClone(MUNDO_HOSPITAL[1]);
    const mapas = [
      { ...mundo.map, nodeId: mundo.nodeId, nodeKey: 'segundo-nombre' },
      { ...mundo.map, nodeId: mundo.nodeId + 100, nodeKey: 'otro-nodo' },
    ];
    const salas = salaPorClaveDeNodoDe(mapas, [mundo, { ...mundo, nodeId: mundo.nodeId + 100 }]);
    expect([...salas]).toEqual([['segundo-nombre', 'pasillo'], ['otro-nodo', 'pasillo']]);
  });
  it('una estructura cambiada viaja en map.structure', () => {
    const { sala, previo, contexto } = preparar(); sala.estructura!.acabados.piso = 'madera';
    expect(solicitudDeSala(sala, contexto, previo).solicitud.map.structure).toEqual(sala.estructura);
  });
  it('mover una puerta cambia metadata.pos y no toca x, y', () => {
    const { sala, previo, contexto } = preparar(); sala.puertas[0].pos = 184;
    const objeto = solicitudDeSala(sala, contexto, previo).solicitud.objects.find(o => o.key === 'a-pasillo')!;
    expect(objeto.metadata['pos']).toBe(184); expect([objeto.x, objeto.y]).toEqual([150, 406]);
  });
  it('una puerta nueva sale como EXIT con targetNodeKey de la primera escena de su sala destino, muro, pos y modelo', () => {
    const { sala, previo, contexto } = preparar();
    sala.puertas.push({ id: 'nueva', hacia: 'pasillo', x: 0, y: 0, etiqueta: 'Pasillo', muro: 'fondo', pos: 400, modelo: 'madera' });
    const objeto = solicitudDeSala(sala, contexto, previo).solicitud.objects.find(o => o.key === 'nueva')!;
    expect(objeto).toMatchObject({ type: 'EXIT', width: 24, height: 40, ...llegada('fondo', 400, sala.encuadre, 1440), metadata: { targetNodeKey: 'pasillo', muro: 'fondo', pos: 400, modelo: 'madera' } });
  });
  it('una puerta quitada no se envía', () => {
    const { sala, previo, contexto } = preparar(); sala.puertas = [];
    expect(solicitudDeSala(sala, contexto, previo).solicitud.objects.some(o => o.type === 'EXIT')).toBe(false);
  });
  it('una puerta existente sin destino resuelto se conserva con su targetNodeKey', () => {
    const { sala, previo, contexto } = preparar();
    const puerta = sala.puertas.find(p => p.id === 'a-triaje')!;
    expect(puerta.hacia).toBeNull();
    puerta.etiqueta = 'Otra etiqueta'; puerta.pos = 1200;
    const resultado = solicitudDeSala(sala, contexto, previo);
    expect(resultado.solicitud.objects.find(o => o.key === puerta.id)).toMatchObject({ label: 'Otra etiqueta', metadata: { targetNodeKey: 'triaje', pos: 1200 } });
  });
  it('guardar un cambio ajeno no cambia el targetNodeKey de ninguna puerta', () => {
    const { sala, previo, contexto } = preparar(); sala.muebles[0].x += 8;
    const objetos = solicitudDeSala(sala, contexto, previo).solicitud.objects;
    for (const puerta of previo.objects.filter(o => o.type === 'EXIT')) {
      expect(objetos.find(o => o.key === puerta.key)?.metadata['targetNodeKey']).toBe(puerta.metadata['targetNodeKey']);
    }
  });
  it('cambiar hacia a otra sala reescribe targetNodeKey al primer nodo de esa sala', () => {
    const { sala, previo, contexto } = preparar();
    sala.puertas[0].hacia = 'sala-espera';
    expect(solicitudDeSala(sala, contexto, previo).solicitud.objects.find(o => o.key === 'a-pasillo')!.metadata['targetNodeKey']).toBe('sala-espera');
  });
  it('una puerta nueva sin nodo de destino no se envía y sale en puertasSinGuardar', () => {
    const { sala, previo, contexto } = preparar();
    sala.puertas.push({ id: 'sin-nodo', hacia: 'inexistente', x: 0, y: 0, etiqueta: '' });
    const resultado = solicitudDeSala(sala, contexto, previo);
    expect(resultado.solicitud.objects.some(o => o.key === 'sin-nodo')).toBe(false);
    expect(resultado.puertasSinGuardar).toContain('sin-nodo');
  });
  it('un cambio de destino sin nodo conserva el anterior y se reporta', () => {
    const { sala, previo, contexto } = preparar(); sala.puertas[0].hacia = 'inexistente';
    const resultado = solicitudDeSala(sala, contexto, previo);
    expect(resultado.solicitud.objects.find(o => o.key === 'a-pasillo')!.metadata['targetNodeKey']).toBe('pasillo');
    expect(resultado.puertasSinGuardar).toContain('a-pasillo');
  });
  it('mover un mueble traslada su zona choque-* sin cambiar su forma', () => {
    const { sala, previo, contexto } = preparar(); sala.muebles[0].x += 24; sala.muebles[0].y -= 8;
    const zona = previo.collisionZones.find(z => z.key === 'choque-sillas-espera')!;
    expect(solicitudDeSala(sala, contexto, previo).solicitud.collisionZones.find(z => z.key === zona.key)).toEqual({ ...zona, x: zona.x + 24, y: zona.y - 8 });
  });
});
