import { PlaceCandidate, selectPlaces } from './world-places.util';

/**
 * Qué ofrece «Ir a…» (plan visual F6-11; VD-19, borrador de Psicología): las personas y las puertas de la sala y los
 * objetos que el jugador YA examinó. Nunca evidencia por descubrir ni objetos de otra sala (el mundo solo entrega los
 * de la sala actual). Pura: sin Phaser ni datos clínicos.
 */

const person = (key: string, label = key): PlaceCandidate => ({ key, label, kind: 'person' });
const door = (key: string, label = key): PlaceCandidate => ({ key, label, kind: 'door' });
const object = (key: string, label = key): PlaceCandidate => ({ key, label, kind: 'object' });

describe('world-places: qué entra en la lista', () => {
  // req: BLOQUE-H H-06, RNF-04 (VD-19)
  it('las personas y las puertas de la sala entran siempre', () => {
    const places = selectPlaces([person('npc:enfermera', 'Enfermera de urgencias'), door('puerta-sala', 'Sala de escucha')], new Set());
    expect(places.map(place => place.key)).toEqual(['npc:enfermera', 'puerta-sala']);
  });

  it('un objeto solo entra si ya se examinó', () => {
    const candidates = [object('historia-clinica', 'Historia clínica'), object('carpeta', 'Carpeta')];
    const places = selectPlaces(candidates, new Set(['historia-clinica']));
    expect(places.map(place => place.key)).toEqual(['historia-clinica']);
  });

  it('la evidencia por descubrir no aparece ni delata que existe', () => {
    const places = selectPlaces([object('evidencia-oculta', 'Evidencia')], new Set(['otra-cosa']));
    expect(places).toEqual([]);
  });

  it('sin nada que ofrecer la lista queda vacía', () => {
    expect(selectPlaces([], new Set())).toEqual([]);
  });
});

describe('world-places: orden y limpieza', () => {
  it('personas primero, luego puertas y al final objetos, conservando el orden dado dentro de cada grupo', () => {
    const places = selectPlaces([
      object('o1'), door('d1'), person('p1'), door('d2'), person('p2'), object('o2'),
    ], new Set(['o1', 'o2']));
    expect(places.map(place => place.key)).toEqual(['p1', 'p2', 'd1', 'd2', 'o1', 'o2']);
  });

  it('una clave repetida sale una sola vez y un rótulo vacío no entra', () => {
    const places = selectPlaces([person('p1', 'Enfermera'), person('p1', 'Otra vez'), door('d1', '   ')], new Set());
    expect(places).toEqual([person('p1', 'Enfermera')]);
  });

  it('el rótulo se entrega sin espacios sobrantes', () => {
    expect(selectPlaces([person('p1', '  Familia en crisis  ')], new Set())[0].label).toBe('Familia en crisis');
  });
});
