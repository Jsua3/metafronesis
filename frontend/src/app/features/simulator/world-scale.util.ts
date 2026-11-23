/**
 * Escala del mundo (spec §13.1, decisión 12): muebles, puertas y objetos recogibles se dibujan a
 * ESCALA 1, con el tamaño exacto de su PNG, a la misma densidad de píxel que los personajes del
 * kit (cuerpo de 64 px ≈ 1,65 m ⇒ 39 px/m). Esta tabla es la fuente única de esos tamaños: la
 * leen el renderer de las salas, el mundo, el generador de arte (scripts/world-art) y sus pruebas.
 *
 * Sin imports y con sintaxis borrable: Node 24 la importa tal cual desde los scripts.
 */

/** Píxeles de mundo por metro: el cuerpo de un personaje del kit mide 64 px y representa 1,65 m. */
export const PX_PER_M = 39;
/** Calibración anterior de muebles y puertas (spec §13.1): ~46 px/m para un personaje de ~82 px. */
export const PREVIOUS_PX_PER_M = 46;
/** Alto del cuerpo opaco de un personaje del kit (spec §4.2). */
export const CHARACTER_HEIGHT_PX = 64;

export type WorldSpriteGroup = 'furniture' | 'doors' | 'objects';

export interface WorldSpriteSpec {
  readonly group: WorldSpriteGroup;
  /** Nombre del PNG sin extensión: `/assets/game/<group>/<name>.png`. */
  readonly name: string;
  /** Tamaño exacto del PNG recortado al cuerpo opaco, en píxeles de mundo. */
  readonly width: number;
  readonly height: number;
  /** Alto de la sombra de contacto de un mueble (el ancho es el del sprite más 8 px). */
  readonly shadowHeight?: number;
}

const furniture = (name: string, width: number, height: number, shadowHeight: number): WorldSpriteSpec =>
  ({ group: 'furniture', name, width, height, shadowHeight });
const door = (name: string, width: number, height: number): WorldSpriteSpec => ({ group: 'doors', name, width, height });
const pickup = (name: string, width: number, height: number): WorldSpriteSpec => ({ group: 'objects', name, width, height });

/**
 * Tamaños = el que se veía en el juego (arte × escala fraccionaria de antes) × 39/46 para muebles
 * y puertas. Los objetos recogibles son iconos de lectura, no objetos a escala: se reducen 2:1
 * exactos (el 64×64 original pasa a 32×32), que es el reescalado más limpio y queda a un 5 % de la
 * calibración.
 */
export const WORLD_SPRITES: readonly WorldSpriteSpec[] = Object.freeze([
  furniture('counter', 181, 56, 19),
  furniture('gurney', 103, 39, 14),
  furniture('waiting_chairs', 93, 34, 14),
  furniture('plant', 36, 47, 10),
  furniture('sofa', 87, 44, 19),
  furniture('coffee_table', 35, 22, 12),
  furniture('shelf', 62, 74, 12),
  furniture('chair', 22, 34, 8),
  furniture('file_cabinet', 68, 51, 14),
  furniture('desk', 122, 58, 20),

  door('door_urgencias', 54, 59),
  door('door_urgencias_side', 37, 74),
  door('door_salida_institucional', 44, 74),
  door('door_salida_institucional_side', 27, 71),
  door('door_recepcion', 44, 74),
  door('door_recepcion_side', 27, 71),
  door('door_sala_escucha', 37, 74),
  door('door_sala_escucha_side', 22, 71),
  door('door_consultorio', 39, 74),
  door('door_consultorio_side', 25, 71),

  pickup('tool_pap', 28, 21),
  pickup('tool_spikes', 23, 28),
  pickup('tool_reflection_journal', 22, 28),
  pickup('tool_safety_route', 26, 28),
  pickup('tool_risk_meter', 28, 26),
  pickup('object_expediente', 28, 22),
  pickup('object_marco_normativo', 22, 28),
  pickup('object_registro', 28, 25),
  pickup('object_acceso_restringido', 15, 28),
  pickup('object_cierre', 26, 28),
]);

/** La ficha de un sprite del mundo; lanza si el nombre no está en la tabla. */
export function worldSprite(group: WorldSpriteGroup, name: string): WorldSpriteSpec {
  const spec = WORLD_SPRITES.find(entry => entry.group === group && entry.name === name);
  if (!spec) throw new Error(`sprite del mundo desconocido: ${group}/${name}`);
  return spec;
}

/** Prefijo de la clave de textura de Phaser de cada grupo (furniture-sofa, door-door_urgencias, object-tool_pap). */
const TEXTURE_PREFIX = { furniture: 'furniture-', doors: 'door-', objects: 'object-' } as const;

/** La ficha del sprite que carga una textura de Phaser, o `null` si la textura no es del mundo. */
export function worldSpriteForTexture(textureKey: string): WorldSpriteSpec | null {
  return WORLD_SPRITES.find(spec => textureKey === `${TEXTURE_PREFIX[spec.group]}${spec.name}`) ?? null;
}

/** Metros que representa una altura en píxeles de mundo. */
export function metersOf(px: number): number {
  return px / PX_PER_M;
}

export interface FurniturePlacement {
  /** Esquina inferior izquierda de la imagen (origen 0, 1), en píxeles enteros. */
  readonly image: { readonly x: number; readonly y: number };
  /** Sombra de contacto: elipse centrada en los pies del mueble. */
  readonly shadow: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/**
 * Dónde se dibuja un mueble de centro `cx` y pies en `feetY`: la imagen a escala 1 con la base
 * apenas bajo los pies (15 % del alto de la sombra) y la sombra de contacto sobre ellos.
 */
export function furniturePlacement(name: string, cx: number, feetY: number): FurniturePlacement {
  const spec = worldSprite('furniture', name);
  const shadowHeight = spec.shadowHeight ?? 10;
  const feet = Math.round(feetY);
  return {
    image: { x: Math.round(cx - spec.width / 2), y: feet + Math.round(shadowHeight * 0.15) },
    shadow: { x: Math.round(cx), y: feet, width: spec.width + 8, height: shadowHeight },
  };
}

/**
 * Tamaño al que forzar una textura que no mide lo que dice la tabla (un PNG viejo en la caché del
 * navegador tras un despliegue); `null` si coincide y se dibuja a escala 1.
 */
export function staleSpriteSize(
  spec: WorldSpriteSpec,
  textureWidth: number,
  textureHeight: number,
): { width: number; height: number } | null {
  return textureWidth === spec.width && textureHeight === spec.height ? null : { width: spec.width, height: spec.height };
}

/** Base de una puerta: asentada en la sombra de contacto de su marcador (y + 16). */
export const DOOR_SPRITE_FEET_Y = 16;
/** El aviso de puerta flota con su centro a esta distancia sobre el borde alto de la puerta. */
export const DOOR_HINT_GAP = 13;
/** Alto de las puertas de respaldo (la hoja dibujada de la sala de autoría y el tile de Kenney a ×3). */
export const DOOR_FALLBACK_HEIGHT = 48;

/** Y (en mundo) del centro del aviso de una puerta de alto `doorHeight` cuyo marcador está en `objectY`. */
export function doorHintY(objectY: number, doorHeight: number): number {
  return objectY + DOOR_SPRITE_FEET_Y - doorHeight - DOOR_HINT_GAP;
}
