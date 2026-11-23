/**
 * Política de profundidad 2.5D del runtime Phaser.
 *
 * Los actores dinámicos (jugador, NPCs, guía, marcadores) comparten una banda
 * [ACTORS_BASE, ACTORS_BASE + maxY] y se ordenan por su coordenada Y: el que
 * está más abajo en pantalla se dibuja al frente. Las capas estructurales del
 * mapa y la UI usan bandas fijas por encima/por debajo.
 */
export const DEPTH = {
  FLOOR: 0,
  GRID: 1,
  BACKGROUND: 1,
  PROPS_BACK: 2,
  WALLS: 3,
  ENVIRONMENT: 4,
  /** Focos, viñetas y motas de las salas: debajo de los actores (spec §8.3, biblia §2-3). */
  LIGHTING_FLOOR: 4.5,
  ACTORS_BASE: 1000,
  PROPS_FRONT: 100000,
  LIGHTING: 200000,
  OVERLAY: 300000,
  UI: 500000,
} as const;

/** Profundidad de un actor dinámico según su Y (más abajo = más al frente). */
export function actorDepth(y: number): number {
  return DEPTH.ACTORS_BASE + Math.max(0, y);
}

const LAYER_BANDS: ReadonlyArray<readonly [string, number]> = [
  ['floor', DEPTH.FLOOR],
  ['walls_back', DEPTH.WALLS],
  ['walls', DEPTH.WALLS],
  ['props_back', DEPTH.PROPS_BACK],
  ['collision', DEPTH.WALLS],
  ['interactables', DEPTH.ENVIRONMENT],
  ['characters', DEPTH.ACTORS_BASE],
  ['props_front', DEPTH.PROPS_FRONT],
  ['lighting', DEPTH.LIGHTING_FLOOR],
  ['overlay', DEPTH.OVERLAY],
];

/**
 * Mapea un nombre de capa Tiled a su banda de profundidad.
 * Tolera prefijo numérico (`3_props_back`) y mayúsculas (`PROPS_BACK`, `Floor`).
 * Devuelve null si no es una capa 2.5D conocida.
 */
export function tiledLayerDepth(name: string): number | null {
  const norm = name.trim().toLowerCase().replace(/^\d+[_-]?/, '');
  for (const [key, depth] of LAYER_BANDS) {
    if (norm === key) return depth;
  }
  return null;
}
