import {
  doorFacing,
  doorSpriteSpecs,
  doorTextureKey,
  resolveDoorSideTextureKey,
  resolveDoorTextureKey,
} from './door-sprite.util';

/** Ancho del lienzo de las salas del caso (case-pdf-rooms: 960×528). */
const ROOM_W = 960;

describe('door-sprite.util', () => {
  it('resolveDoorTextureKey mapea cada object_key de puerta a su textura', () => {
    expect(resolveDoorTextureKey('puerta-urgencias')).toBe('door-door_urgencias');
    expect(resolveDoorTextureKey('salida-institucional')).toBe('door-door_salida_institucional');
    expect(resolveDoorTextureKey('puerta-recepcion')).toBe('door-door_recepcion');
    expect(resolveDoorTextureKey('puerta-sala-escucha')).toBe('door-door_sala_escucha');
    expect(resolveDoorTextureKey('puerta-consultorio')).toBe('door-door_consultorio');
  });

  it('devuelve null para una puerta desconocida o nula (→ fallback)', () => {
    expect(resolveDoorTextureKey('puerta-inexistente')).toBeNull();
    expect(resolveDoorTextureKey('')).toBeNull();
    expect(resolveDoorTextureKey(null)).toBeNull();
    expect(resolveDoorTextureKey(undefined)).toBeNull();
  });

  it('doorSpriteSpecs lista las 10 puertas (5 frontales + 5 laterales)', () => {
    const specs = doorSpriteSpecs();
    expect(specs).toHaveLength(10);
    expect(specs).toContainEqual({
      textureKey: 'door-door_urgencias',
      assetPath: '/assets/game/doors/door_urgencias.png',
    });
    expect(specs).toContainEqual({
      textureKey: 'door-door_salida_institucional_side',
      assetPath: '/assets/game/doors/door_salida_institucional_side.png',
    });
  });

  it('doorTextureKey prefija con door- para no chocar con las texturas de objeto', () => {
    expect(doorTextureKey('door_recepcion')).toBe('door-door_recepcion');
  });

  it('resolveDoorSideTextureKey mapea a la variante en 3/4', () => {
    expect(resolveDoorSideTextureKey('puerta-urgencias')).toBe('door-door_urgencias_side');
    expect(resolveDoorSideTextureKey('puerta-consultorio')).toBe('door-door_consultorio_side');
    expect(resolveDoorSideTextureKey('puerta-inexistente')).toBeNull();
    expect(resolveDoorSideTextureKey(null)).toBeNull();
  });

  describe('doorFacing', () => {
    it('las puertas reales del seed caen en el muro que les toca', () => {
      // Posiciones exactas de seed_caso_pdf: muro izquierdo x=122, derecho x=838.
      expect(doorFacing(122, ROOM_W)).toBe('right');
      expect(doorFacing(838, ROOM_W)).toBe('left');
    });

    it('una puerta hacia el centro se dibuja de frente (muro del fondo)', () => {
      expect(doorFacing(ROOM_W / 2, ROOM_W)).toBeNull();
      expect(doorFacing(400, ROOM_W)).toBeNull();
      expect(doorFacing(560, ROOM_W)).toBeNull();
    });

    it('la banda lateral es proporcional al ancho, no absoluta', () => {
      expect(doorFacing(60, 480)).toBe('right');   // mismo 12.5% en una sala mitad de ancha
      expect(doorFacing(419, 480)).toBe('left');
    });

    it('devuelve null con un ancho o una x no utilizables', () => {
      expect(doorFacing(122, 0)).toBeNull();
      expect(doorFacing(122, -960)).toBeNull();
      expect(doorFacing(Number.NaN, ROOM_W)).toBeNull();
    });
  });
});
