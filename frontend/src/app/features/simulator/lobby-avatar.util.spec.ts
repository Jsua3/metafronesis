import {
  LOBBY_BLEED, LOBBY_ROOM, lobbyDoorCursor, lobbyFacadeBand, lobbyMotion, lobbyPose, nearestLobbyDoor,
} from './lobby-avatar.util';

// req: BLOQUE-H (H-22: movimiento reducido), RNF-04 (plan visual F5-3)
describe('lobby: movimiento y puntero (F5-3)', () => {
  it('con movimiento reducido las puertas no pulsan ni la cámara se sacude; sin él, sí', () => {
    expect(lobbyMotion(true)).toEqual({ doorPulse: false, lockedShake: false });
    expect(lobbyMotion(false)).toEqual({ doorPulse: true, lockedShake: true });
  });

  it('el cursor sobre una puerta dice si se puede entrar: mano en la abierta, prohibido en la bloqueada', () => {
    expect(lobbyDoorCursor({ unlocked: true })).toBe('pointer');
    expect(lobbyDoorCursor({ unlocked: false })).toBe('not-allowed');
  });
});

describe('lobby-avatar.util', () => {
  it('camina mirando hacia su lado; quieto conserva la vista', () => {
    expect(lobbyPose(-0.3)).toEqual({ view: 'left', walking: true });
    expect(lobbyPose(0.3)).toEqual({ view: 'right', walking: true });
    expect(lobbyPose(0)).toEqual({ view: null, walking: false });
  });

  it('la puerta más cercana dentro del radio, o ninguna', () => {
    const doors = [{ x: 220 }, { x: 480 }, { x: 740 }];
    expect(nearestLobbyDoor(doors, 250)).toBe(doors[0]);
    expect(nearestLobbyDoor(doors, 470)).toBe(doors[1]);
    expect(nearestLobbyDoor(doors, 350)).toBeNull();
    expect(nearestLobbyDoor(doors, 350, 200)).toBe(doors[0]);
    expect(nearestLobbyDoor([], 0)).toBeNull();
  });

  it('la fachada del lobby mide 960×540 para el zoom entero', () => {
    expect(LOBBY_ROOM).toEqual({ width: 960, height: 540 });
  });

  it('la fachada sangra más allá de la sala: con zoom ×1 la vista es mayor y no debe verse su borde', () => {
    // La vista más ancha a ×1: una ventana 4K apaisada y baja (3840 px); la cámara centra la sala.
    const view = 3840;
    for (const worldWidth of [960, 1500]) {
      const band = lobbyFacadeBand(worldWidth);
      expect(band.x).toBeLessThanOrEqual(Math.floor((worldWidth - view) / 2));
      expect(band.x + band.width).toBeGreaterThanOrEqual(worldWidth + Math.ceil((view - worldWidth) / 2));
    }
    expect(lobbyFacadeBand(960)).toEqual({ x: -LOBBY_BLEED, width: 960 + 2 * LOBBY_BLEED });
  });
});
