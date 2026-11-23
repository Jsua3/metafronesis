export interface RoomPlayerPoint {
  x: number;
  y: number;
}

interface ResolveRoomPlayerPositionInput {
  /** Posición persistida por la autoridad del mundo (backend). */
  authoritative: RoomPlayerPoint | null;
  /** Actor que puede pertenecer a un render transicional ya obsoleto. */
  live: RoomPlayerPoint | null;
  fallback: RoomPlayerPoint;
  collides: (point: RoomPlayerPoint) => boolean;
}

function isFinitePoint(point: RoomPlayerPoint | null): point is RoomPlayerPoint {
  return point !== null && Number.isFinite(point.x) && Number.isFinite(point.y);
}

/**
 * Resuelve el punto de aparición en una sala autorada.
 *
 * `world.player` es la autoridad tras una puerta o cambio de nodo. La posición
 * visual solo es un respaldo para configuraciones que llegan de forma asíncrona
 * o datos persistidos que ya no son jugables con la geometría actual.
 */
export function resolveRoomPlayerPosition(
  input: ResolveRoomPlayerPositionInput,
): RoomPlayerPoint {
  for (const candidate of [input.authoritative, input.live]) {
    if (isFinitePoint(candidate) && !input.collides(candidate)) return candidate;
  }
  return input.fallback;
}
