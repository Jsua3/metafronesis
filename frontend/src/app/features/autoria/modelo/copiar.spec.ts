import { universidad } from '../testing/universidad';
import { copiarEscenarioAlCaso } from './copiar';
import type { Escenario } from './escenario';

const ELEGIDAS = ['pasillo', 'sala-espera', 'consultorio'];

describe('copiarEscenarioAlCaso', () => {
  it('copia solo las salas elegidas, en el orden elegido', () => {
    const caso = copiarEscenarioAlCaso(universidad, ELEGIDAS, 'Primera escucha');
    expect(caso.salas.map((s) => s.id)).toEqual(ELEGIDAS);
    expect(caso.escenas.map((e) => e.salaId)).toEqual(ELEGIDAS);
    expect(caso.escenas.map((e) => e.titulo)).toEqual([
      'Pasillo de facultad', 'Sala de espera de Bienestar', 'Consultorio de atención psicológica',
    ]);
    expect(caso.titulo).toBe('Primera escucha');
    expect(caso.lugarId).toBe('universidad');
    expect(caso.modoFinales).toBe('automatico');
    expect(caso.escenas.map((e) => e.posicion)).toEqual([{ x: 0, y: 0 }, { x: 240, y: 0 }, { x: 480, y: 0 }]);
  });

  it('no modifica el escenario de origen', () => {
    const antes = structuredClone(universidad);
    const caso = copiarEscenarioAlCaso(universidad, ELEGIDAS, 'Caso');
    caso.salas[0].muebles.pop();
    caso.salas[0].nombre = 'Otro nombre';
    caso.catalogo.muebles.pop();
    caso.personajes[0].nombre = 'Otra persona';
    expect(universidad).toEqual(antes);
  });

  it('cada sala conserva su origen para poder volver a la original', () => {
    const caso = copiarEscenarioAlCaso(universidad, ELEGIDAS, 'Caso');
    expect(caso.salas.map((s) => s.origen)).toEqual(ELEGIDAS.map((salaId) => ({ lugarId: 'universidad', salaId })));
  });

  it('una puerta hacia una sala no elegida queda sin destino', () => {
    const caso = copiarEscenarioAlCaso(universidad, ELEGIDAS, 'Caso');
    const pasillo = caso.salas.find((s) => s.id === 'pasillo')!;
    expect(pasillo.puertas.find((p) => p.id === 'puerta-aula')!.hacia).toBeNull();
    expect(pasillo.puertas.find((p) => p.id === 'puerta-sala-espera')!.hacia).toBe('sala-espera');
  });

  it('la primera sala elegida es el inicio', () => {
    const caso = copiarEscenarioAlCaso(universidad, ELEGIDAS, 'Caso');
    expect(caso.inicioId).toBe(caso.escenas[0].id);
    expect(new Set(caso.escenas.map((e) => e.id)).size).toBe(3);
  });

  it('ningún elemento copiado lleva marcaIa en true', () => {
    const caso = copiarEscenarioAlCaso(universidad, ELEGIDAS, 'Caso');
    expect(JSON.stringify(caso)).not.toContain('"marcaIa":true');
  });

  it('una sala que no existe en el lugar es un error', () => {
    expect(() => copiarEscenarioAlCaso(universidad, ['azotea'], 'Caso')).toThrow(/azotea/);
  });
});
