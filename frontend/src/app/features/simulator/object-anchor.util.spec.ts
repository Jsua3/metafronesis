import { isPaintedDoor, LEGACY_FEET_OFFSET_Y, markerFeetOffsetY, markerLabelOffsetY, standsOnFeet } from './object-anchor.util';
import { KEY_PERSON_TIP_OFFSET_Y, keyPersonTipOffsetY } from './key-person.util';

/**
 * El punto de apoyo de lo que el editor coloca (revisión final · B2): la posición (x, y) de una pieza de la biblioteca es
 * donde apoya en el suelo, y el objeto lo dice con `metadata.apoyo = "pies"`. Lo que no lo dice (casos hechos antes) se
 * dibuja como siempre: centrado en (x, y), con los pies 16 px más abajo.
 */
describe('object-anchor: el punto de apoyo', () => {
  it('«pies» es la única marca que cambia el apoyo', () => {
    expect(standsOnFeet({ metadata: { apoyo: 'pies' } })).toBe(true);
    for (const metadata of [undefined, {}, { apoyo: 'centro' }, { apoyo: true }, { apoyo: 'Pies' }, { apoyo: null }]) {
      expect(standsOnFeet({ metadata })).toBe(false);
    }
  });

  it('con apoyo en los pies, el contacto con el suelo es la posición misma; sin él, 16 px más abajo', () => {
    expect(LEGACY_FEET_OFFSET_Y).toBe(16);
    expect(markerFeetOffsetY({ metadata: { apoyo: 'pies' } })).toBe(0);
    expect(markerFeetOffsetY({ metadata: {} })).toBe(16);
    expect(markerFeetOffsetY({})).toBe(16);
  });

  it('el rótulo queda 12 px bajo el contacto con el suelo: 28 como siempre, o 12 con apoyo en los pies', () => {
    expect(markerLabelOffsetY({ metadata: {} })).toBe(28);
    expect(markerLabelOffsetY({ metadata: { apoyo: 'pies' } })).toBe(12);
  });

  it('el chevrón de la persona clave sigue a sus pies: 66 px sobre ellos', () => {
    expect(keyPersonTipOffsetY(16)).toBe(KEY_PERSON_TIP_OFFSET_Y);
    expect(keyPersonTipOffsetY(0)).toBe(KEY_PERSON_TIP_OFFSET_Y - 16);
  });
});

describe('object-anchor: la puerta pintada en el fondo (revisión final · B3)', () => {
  it('solo una puerta con metadata.pintada === true cuenta', () => {
    expect(isPaintedDoor({ type: 'EXIT', metadata: { pintada: true } })).toBe(true);
    expect(isPaintedDoor({ type: 'EXIT', metadata: {} })).toBe(false);
    expect(isPaintedDoor({ type: 'EXIT', metadata: { pintada: 'sí' } })).toBe(false);
    expect(isPaintedDoor({ type: 'EXIT' })).toBe(false);
    expect(isPaintedDoor({ type: 'OBJECT', metadata: { pintada: true } })).toBe(false);
  });
});
