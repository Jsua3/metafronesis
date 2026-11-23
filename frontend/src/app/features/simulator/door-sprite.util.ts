/**
 * Sprites pixel-art de las puertas (objetos `EXIT` del mapa).
 *
 * Reemplazan las dos representaciones previas —la puerta dibujada de las salas
 * de autoría (marco + hoja + pomo) y el tile `DOOR` de Kenney— por una puerta
 * propia por destino. Si el asset no cargó, el resolver devuelve `null` y el
 * marcador cae a su representación previa — degradación elegante.
 *
 * Se indexa por `object.key` y no por `shortCode` como TOOL/OBJECT: el seed no
 * define `short` para las puertas, así que todas comparten `short_code = "EXIT"`.
 */

/** object_key → nombre base del asset frontal. Las puertas son retrato (48×64). */
const DOOR_SPRITE: Record<string, string> = {
  'puerta-urgencias': 'door_urgencias',
  'salida-institucional': 'door_salida_institucional',
  'puerta-recepcion': 'door_recepcion',
  'puerta-sala-escucha': 'door_sala_escucha',
  'puerta-consultorio': 'door_consultorio',
};

/**
 * object_key → asset en 3/4, con la cara girada hacia la DERECHA (puerta del muro
 * izquierdo). La del muro derecho es su espejo exacto: se resuelve con `flipX`,
 * no con un segundo asset.
 */
const DOOR_SIDE_SPRITE: Record<string, string> = {
  'puerta-urgencias': 'door_urgencias_side',
  'salida-institucional': 'door_salida_institucional_side',
  'puerta-recepcion': 'door_recepcion_side',
  'puerta-sala-escucha': 'door_sala_escucha_side',
  'puerta-consultorio': 'door_consultorio_side',
};

/** Hacia dónde mira la cara de la puerta: al interior de la sala. */
export type DoorFacing = 'right' | 'left';

/** Fracción del ancho del mapa que ocupa cada banda de muro lateral. */
const SIDE_WALL_BAND = 0.35;

/**
 * Muro lateral al que pertenece la puerta, deducido de su posición, o `null` si
 * no está pegada a ninguno (muro del fondo → se dibuja de frente).
 *
 * Las salas del caso son cajas de un punto de fuga: la puerta del muro izquierdo
 * enseña la cara hacia la derecha, y la del derecho hacia la izquierda.
 */
export function doorFacing(x: number, mapWidth: number): DoorFacing | null {
  if (!(mapWidth > 0) || !Number.isFinite(x)) return null;
  const t = x / mapWidth;
  if (t <= SIDE_WALL_BAND) return 'right';
  if (t >= 1 - SIDE_WALL_BAND) return 'left';
  return null;
}

/** Clave de textura Phaser para un sprite de puerta. */
export function doorTextureKey(assetName: string): string {
  return `door-${assetName}`;
}

/** { textureKey, assetPath } de todas las puertas (frontales + laterales), para precargar. */
export function doorSpriteSpecs(): { textureKey: string; assetPath: string }[] {
  return [...Object.values(DOOR_SPRITE), ...Object.values(DOOR_SIDE_SPRITE)].map(name => ({
    textureKey: doorTextureKey(name),
    assetPath: `/assets/game/doors/${name}.png`,
  }));
}

/** Clave de textura de la puerta de frente, o `null` (→ fallback). */
export function resolveDoorTextureKey(objectKey: string | null | undefined): string | null {
  if (!objectKey) return null;
  const name = DOOR_SPRITE[objectKey];
  return name ? doorTextureKey(name) : null;
}

/** Clave de textura de la puerta en 3/4, o `null` (→ fallback a la frontal). */
export function resolveDoorSideTextureKey(objectKey: string | null | undefined): string | null {
  if (!objectKey) return null;
  const name = DOOR_SIDE_SPRITE[objectKey];
  return name ? doorTextureKey(name) : null;
}
