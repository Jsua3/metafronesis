/**
 * Sprites pixel-art del mobiliario de las salas del caso.
 *
 * Reemplazan las primitivas vectoriales de `case-pdf-rooms.renderer` (paintCounter,
 * paintGurney, …) por un mueble pixel-art del mismo lenguaje que las herramientas,
 * los objetos de escenario y las puertas. Si un mueble no tiene sprite (o el asset
 * no cargó), el resolver devuelve `null` y el `paintX` cae a su cuerpo vectorial —
 * degradación elegante.
 *
 * Se indexa por TIPO de mueble (no por id del seed): las funciones de pintado ya
 * están deduplicadas —un mismo `paintCounter` sirve a triage y a recepción—, así
 * que un asset por tipo cubre todas sus apariciones.
 */

/** Tipo de mueble → nombre base del asset. */
const FURNITURE_SPRITE = {
  counter: 'counter',
  gurney: 'gurney',
  waiting_chairs: 'waiting_chairs',
  plant: 'plant',
  sofa: 'sofa',
  coffee_table: 'coffee_table',
  shelf: 'shelf',
  chair: 'chair',
  file_cabinet: 'file_cabinet',
  desk: 'desk',
} as const;

export type FurnitureKey = keyof typeof FURNITURE_SPRITE;

/** Clave de textura Phaser para un sprite de mueble. */
export function furnitureTextureKey(assetName: string): string {
  return `furniture-${assetName}`;
}

/** { textureKey, assetPath } de todos los muebles, para precargar. */
export function furnitureSpriteSpecs(): { textureKey: string; assetPath: string }[] {
  return Object.values(FURNITURE_SPRITE).map(name => ({
    textureKey: furnitureTextureKey(name),
    assetPath: `/assets/game/furniture/${name}.png`,
  }));
}

/** Clave de textura Phaser para un tipo de mueble, o `null` (→ fallback vectorial). */
export function resolveFurnitureTextureKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const name = (FURNITURE_SPRITE as Record<string, string>)[key];
  return name ? furnitureTextureKey(name) : null;
}
