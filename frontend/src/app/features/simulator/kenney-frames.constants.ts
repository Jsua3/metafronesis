/**
 * Kenney.nl asset frame indices for Phaser spritesheets.
 *
 * Tiny Dungeon (tilemap_packed.png): 192×176 → 12 cols × 11 rows, 16×16 px tiles.
 *   Frame index = row * 12 + col
 */
export const KenneyDungeonFrames = {
  /** Door / gate icon for EXIT markers — row 0, col 6 (0×12+6=6) */
  DOOR: 6,
  /** Desk / table marker — row 6, col 0 (6×12+0=72) */
  DESK: 72,
  /** Chair / medical-cross marker — row 5, col 4 (5×12+4=64) */
  CHAIR: 64,
  /** Cabinet / chest marker — row 5, col 3 (5×12+3=63) */
  CABINET: 63,
  /** Plant / green decoration — row 9, col 0 (9×12+0=108) */
  PLANT: 108,
} as const;
