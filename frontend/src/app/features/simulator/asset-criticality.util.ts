/** Tilesets de Kenney sobre los que se dibujan las salas Tiled. */
export const CRITICAL_TILESET_KEYS = ['dungeon-img', 'town-img', 'rpg-img'] as const;

/**
 * Recursos cuya falta degrada la sala a paneles planos (mapas Tiled y sus
 * tilesets). Todos existen en disco: si fallan, es la red y vale la pena
 * reintentar. El resto (personajes, objetos, audio) tiene respaldo propio.
 */
export function isCriticalAsset(key: string): boolean {
  return key.startsWith('map-') || (CRITICAL_TILESET_KEYS as readonly string[]).includes(key);
}
