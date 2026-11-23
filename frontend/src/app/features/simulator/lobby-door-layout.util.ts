/**
 * Puertas del lobby «CLÍNICA · SIEP» a la altura de los personajes (spec §13.1, decisión 12): una
 * puerta de 2,15 m a 39 px/m mide 84 px. Antes eran portales de 152 px (≈ 3,9 m) junto a un avatar
 * de 64 px. Geometría pura, sin Phaser: todas las medidas salen de la base de la puerta (x, doorY);
 * `dx` crece hacia la derecha y `dy` hacia abajo, así que lo que queda sobre la base es negativo.
 */
import { PX_PER_M } from './world-scale.util';

export interface LobbyDoorLayout {
  readonly frame: { readonly width: number; readonly height: number };
  /** La hoja se apoya `bottomInset` px sobre la base del marco. */
  readonly leaf: { readonly width: number; readonly height: number; readonly bottomInset: number };
  readonly handle: { readonly dx: number; readonly dy: number; readonly width: number; readonly height: number };
  /** Centro del candado de las puertas bloqueadas. */
  readonly lockDy: number;
  /** Base (origen 0.5, 1) de la insignia de estado, justo sobre el marco. */
  readonly badgeDy: number;
  /** Base (origen 0.5, 1) del título del caso, sobre la insignia. */
  readonly titleDy: number;
}

/** Alto de la puerta del lobby en metros: una puerta, no un portal. */
export const LOBBY_DOOR_HEIGHT_M = 2.15;
/** Alto de la insignia de estado («▶ Disponible», monoespaciada de 12 px) con su interlineado. */
export const LOBBY_BADGE_HEIGHT = 14;
/** Y de la base de las puertas; el piso del pasillo (y = 380) queda 60 px más abajo. */
export const LOBBY_DOOR_Y = 320;

export function lobbyDoorLayout(): LobbyDoorLayout {
  const height = Math.round(LOBBY_DOOR_HEIGHT_M * PX_PER_M);
  const badgeDy = -(height + 4);
  return {
    frame: { width: 48, height },
    leaf: { width: 38, height: height - 8, bottomInset: 3 },
    handle: { dx: 11, dy: 2 - Math.round(height / 2), width: 4, height: 8 },
    lockDy: -Math.round(height / 2),
    badgeDy,
    titleDy: badgeDy - LOBBY_BADGE_HEIGHT - 4,
  };
}
