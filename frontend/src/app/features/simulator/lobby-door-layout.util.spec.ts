import { LOBBY_BADGE_HEIGHT, LOBBY_DOOR_HEIGHT_M, LOBBY_DOOR_Y, lobbyDoorLayout } from './lobby-door-layout.util';
import { CHARACTER_HEIGHT_PX, metersOf } from './world-scale.util';

/** Interlineado del título del caso: fuente de 15 px (game-menu.component.ts). */
const TITLE_LINE_HEIGHT = 18;

describe('lobby-door-layout — las puertas del lobby a la altura de los personajes (spec §13.1)', () => {
  const layout = lobbyDoorLayout();

  it('el marco es una puerta de 2,15 m a 39 px/m y supera al personaje en 16 px o más', () => {
    expect(layout.frame).toEqual({ width: 48, height: 84 });
    expect(metersOf(layout.frame.height)).toBeCloseTo(LOBBY_DOOR_HEIGHT_M, 1);
    expect(layout.frame.height - CHARACTER_HEIGHT_PX).toBeGreaterThanOrEqual(16);
  });

  it('la hoja, la manija y el candado caen dentro del marco', () => {
    expect(layout.leaf.width).toBeLessThan(layout.frame.width);
    expect(layout.leaf.height + layout.leaf.bottomInset).toBeLessThan(layout.frame.height);
    expect(layout.handle.dx + layout.handle.width / 2).toBeLessThan(layout.leaf.width / 2);
    expect(-layout.handle.dy).toBeGreaterThan(layout.leaf.bottomInset);
    expect(-layout.handle.dy + layout.handle.height / 2).toBeLessThan(layout.leaf.height);
    expect(-layout.lockDy).toBeGreaterThan(0);
    expect(-layout.lockDy).toBeLessThan(layout.frame.height);
  });

  it('la insignia queda sobre el marco y el título sobre la insignia, sin tocarse', () => {
    expect(layout.badgeDy).toBeLessThanOrEqual(-(layout.frame.height + 2));
    expect(layout.titleDy).toBeLessThanOrEqual(layout.badgeDy - LOBBY_BADGE_HEIGHT - 2);
  });

  it('un título largo (hasta 6 líneas) crece hacia arriba desde su base y no se sale de la sala', () => {
    const titleBase = LOBBY_DOOR_Y + layout.titleDy;
    expect(titleBase - 6 * TITLE_LINE_HEIGHT).toBeGreaterThanOrEqual(0);
  });
});
