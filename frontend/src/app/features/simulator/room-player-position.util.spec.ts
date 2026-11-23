import { resolveRoomPlayerPosition } from './room-player-position.util';

describe('resolveRoomPlayerPosition', () => {
  const fallback = { x: 480, y: 420 };

  it('prefiere la posición autoritativa del mundo sobre un actor visual obsoleto', () => {
    const resolved = resolveRoomPlayerPosition({
      authoritative: { x: 160, y: 452 },
      live: { x: 480, y: 430 },
      fallback,
      collides: () => false,
    });

    expect(resolved).toEqual({ x: 160, y: 452 });
  });

  it('conserva la posición visual si la autoritativa no es jugable', () => {
    const resolved = resolveRoomPlayerPosition({
      authoritative: { x: 10, y: 10 },
      live: { x: 420, y: 430 },
      fallback,
      collides: point => point.x === 10,
    });

    expect(resolved).toEqual({ x: 420, y: 430 });
  });

  it('usa el fallback cuando ninguna posición candidata es jugable', () => {
    const resolved = resolveRoomPlayerPosition({
      authoritative: { x: 10, y: 10 },
      live: { x: 20, y: 20 },
      fallback,
      collides: point => point !== fallback,
    });

    expect(resolved).toEqual(fallback);
  });
});
