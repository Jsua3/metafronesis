/**
 * Lobby «CLÍNICA · SIEP»: la misma identidad que el editor, el mundo y el resultado,
 * dibujada con las hojas del kit (spec §8.2). Lógica pura separada de Phaser.
 */

/** Radio de proximidad a una puerta del lobby. */
export const LOBBY_DOOR_RANGE = 70;
/** Sala del lobby para el zoom entero: la vista base de 960 y la fachada de 540 px de alto. */
export const LOBBY_ROOM = Object.freeze({ width: 960, height: 540 });
/** Sangrado de la fachada: con zoom ×1 la vista es mayor que la sala y la cámara la centra. */
export const LOBBY_BLEED = 2000;

/** Tramo horizontal de las franjas de la fachada (muro, cornisa, piso): la sala más el sangrado a cada lado. */
export function lobbyFacadeBand(worldWidth: number): { x: number; width: number } {
  return { x: -LOBBY_BLEED, width: worldWidth + 2 * LOBBY_BLEED };
}

/** Movimiento decorativo de la sala (plan visual F5-3, H-22): con «reducir movimiento» ni pulso ni sacudida. */
export function lobbyMotion(reduceMotion: boolean): { doorPulse: boolean; lockedShake: boolean } {
  return { doorPulse: !reduceMotion, lockedShake: !reduceMotion };
}

/** Cursor sobre una puerta: la mano si se puede entrar, «prohibido» si está bloqueada. */
export function lobbyDoorCursor(item: { unlocked: boolean }): 'pointer' | 'not-allowed' {
  return item.unlocked ? 'pointer' : 'not-allowed';
}

export interface LobbyPose {
  /** Vista a la que mira al caminar; null = quieto (conserva la que tenía). */
  view: 'left' | 'right' | null;
  walking: boolean;
}

/** El lobby solo se mueve en horizontal; el kit trae las dos vistas laterales reales. */
export function lobbyPose(vx: number): LobbyPose {
  return { view: vx < 0 ? 'left' : vx > 0 ? 'right' : null, walking: vx !== 0 };
}

export interface LobbyDoorLike {
  x: number;
}

/** Puerta más cercana dentro del radio, o `null` si todas quedan lejos. */
export function nearestLobbyDoor<T extends LobbyDoorLike>(
  doors: readonly T[],
  playerX: number,
  range: number = LOBBY_DOOR_RANGE,
): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const door of doors) {
    const distance = Math.abs(door.x - playerX);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = door;
    }
  }
  return best !== null && bestDistance <= range ? best : null;
}
