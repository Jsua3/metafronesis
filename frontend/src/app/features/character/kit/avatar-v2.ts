/**
 * Avatar del estudiante, formato 2 (spec §9). Vive en `localStorage['psychosim_avatar']`.
 *
 * Dos modos: un jugable del elenco (`recipeId`) o un avatar personalizado con las
 * opciones del editor (spec §4.7). En los dos, la bata es un interruptor del
 * jugador (decisión 17). El uniforme no tiene color que elegir (decisión 18): por
 * eso el formato no guarda conjunto ni variante; la bata elige el conjunto.
 *
 * Las listas son el espejo de `catalog.editor` y `catalog.playables` de kit.json:
 * el almacén valida al cargar, antes de que llegue el paquete. avatar-v2.spec.ts
 * exige que coincidan.
 */

export const PLAYABLE_IDS = ['valentina', 'andres', 'camila', 'daniela', 'david', 'felipe', 'jorge', 'luisa', 'mariana', 'mateo', 'paula', 'samuel'] as const;
export const COMPLEXIONS = ['a', 'b'] as const;
export const SKINS = ['piel-1', 'piel-2', 'piel-3', 'piel-4', 'piel-5', 'piel-6'] as const;
export const HAIRS = ['rapado', 'corto-liso', 'corto-rizado', 'bob-flequillo', 'media-melena', 'largo-suelto', 'cola-caballo', 'mono', 'trenza', 'afro'] as const;
export const HAIR_COLORS = ['negro', 'castano-oscuro', 'castano', 'cobrizo', 'rubio', 'canoso'] as const;
export const ACCESSORIES = ['gafas', 'gafete'] as const;
/** Conjunto del editor según la bata (decisión 18). */
export const OUTFIT_IDS = Object.freeze({ sinBata: 'uniforme', conBata: 'uniforme-bata' });

export type PlayableId = (typeof PLAYABLE_IDS)[number];
export type Complexion = (typeof COMPLEXIONS)[number];
export type SkinId = (typeof SKINS)[number];
export type HairId = (typeof HAIRS)[number];
export type HairColorId = (typeof HAIR_COLORS)[number];
export type AccessoryId = (typeof ACCESSORIES)[number];

export interface AvatarElenco {
  schemaVersion: 2;
  mode: 'elenco';
  recipeId: PlayableId;
  bata: boolean;
}

export interface AvatarPersonalizado {
  schemaVersion: 2;
  mode: 'personalizado';
  complexion: Complexion;
  skin: SkinId;
  hair: HairId;
  hairColor: HairColorId;
  accessories: AccessoryId[];
  bata: boolean;
}

export type AvatarV2 = AvatarElenco | AvatarPersonalizado;

/** Etiquetas del editor, en el orden de las listas. */
export const AVATAR_LABELS = Object.freeze({
  complexion: { a: 'Complexión A', b: 'Complexión B' } as Record<Complexion, string>,
  hair: {
    rapado: 'Rapado', 'corto-liso': 'Corto liso', 'corto-rizado': 'Corto rizado', 'bob-flequillo': 'Bob con flequillo',
    'media-melena': 'Media melena', 'largo-suelto': 'Largo suelto', 'cola-caballo': 'Cola de caballo', mono: 'Moño',
    trenza: 'Trenza', afro: 'Afro',
  } as Record<HairId, string>,
  hairColor: {
    negro: 'Negro', 'castano-oscuro': 'Castaño oscuro', castano: 'Castaño', cobrizo: 'Cobrizo', rubio: 'Rubio', canoso: 'Canoso',
  } as Record<HairColorId, string>,
  accessory: { gafas: 'Gafas', gafete: 'Gafete' } as Record<AccessoryId, string>,
});

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

const asRecord = (x: unknown): Record<string, unknown> | null =>
  x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;

const pick = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (isOneOf(list, value) ? value : fallback);

/** Accesorios válidos, sin repetir y en el orden del editor. */
function accessoriesFrom(value: unknown): AccessoryId[] {
  const given: unknown[] = Array.isArray(value) ? value : [];
  return ACCESSORIES.filter(id => given.includes(id));
}

export function defaultAvatarV2(): AvatarElenco {
  return { schemaVersion: 2, mode: 'elenco', recipeId: 'valentina', bata: false };
}

export function defaultPersonalizado(): AvatarPersonalizado {
  return { schemaVersion: 2, mode: 'personalizado', complexion: 'a', skin: 'piel-2', hair: 'corto-liso', hairColor: 'negro', accessories: [], bata: false };
}

/** Un objeto que dice ser v2: cada campo inválido toma su valor por defecto (spec §9.1). */
export function coerceAvatarV2(x: unknown): AvatarV2 {
  const a = asRecord(x);
  if (!a || a['schemaVersion'] !== 2) return defaultAvatarV2();
  const bata = a['bata'] === true;
  if (a['mode'] === 'elenco') {
    return { schemaVersion: 2, mode: 'elenco', recipeId: pick(PLAYABLE_IDS, a['recipeId'], 'valentina'), bata };
  }
  if (a['mode'] === 'personalizado') {
    const d = defaultPersonalizado();
    return {
      schemaVersion: 2,
      mode: 'personalizado',
      complexion: pick(COMPLEXIONS, a['complexion'], d.complexion),
      skin: pick(SKINS, a['skin'], d.skin),
      hair: pick(HAIRS, a['hair'], d.hair),
      hairColor: pick(HAIR_COLORS, a['hairColor'], d.hairColor),
      accessories: accessoriesFrom(a['accessories']),
      bata,
    };
  }
  return defaultAvatarV2();
}

// Equivalencias v1 → v2 (spec §9.3).
const SKIN_FROM_V1: Record<string, SkinId> = { porcelana: 'piel-1', clara: 'piel-2', media: 'piel-3', morena: 'piel-5', oscura: 'piel-6' };
const HAIR_FROM_V1: Record<string, HairId> = { corto: 'corto-liso', medio: 'media-melena', largo: 'largo-suelto', recogido: 'mono', ninguno: 'rapado' };
const HAIR_COLOR_FROM_V1: Record<string, HairColorId> = { negro: 'negro', castano: 'castano', rubio: 'rubio', rojizo: 'cobrizo', gris: 'canoso' };
const ACCESSORY_FROM_V1: Record<string, AccessoryId[]> = { gafas: ['gafas'], pin: ['gafete'] };

function fromTable<T>(table: Record<string, T>, value: unknown): T | undefined {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(table, value) ? table[value] : undefined;
}

/**
 * Un `AvatarConfig` v1 (o lo que haya quedado de él) en formato 2. Pura e
 * idempotente: aplicada a su propia salida devuelve lo mismo (vía toAvatarV2).
 * Rasgos, ojos, cejas, boca y color de ropa se descartan (spec §9.3).
 */
export function migrateAvatarV1(x: unknown): AvatarV2 {
  const a = asRecord(x);
  if (!a) return defaultAvatarV2();
  const bata = a['uniform'] === 'con-bata';
  if (isOneOf(PLAYABLE_IDS, a['castId'])) return { schemaVersion: 2, mode: 'elenco', recipeId: a['castId'], bata };
  const d = defaultPersonalizado();
  const hair = a['hairStyle'] === 'medio' && a['fringe'] === true ? 'bob-flequillo' : fromTable(HAIR_FROM_V1, a['hairStyle']) ?? d.hair;
  return {
    schemaVersion: 2,
    mode: 'personalizado',
    complexion: a['gender'] === 'male' ? 'b' : 'a',
    skin: fromTable(SKIN_FROM_V1, a['skinTone']) ?? d.skin,
    hair,
    hairColor: fromTable(HAIR_COLOR_FROM_V1, a['hairColor']) ?? d.hairColor,
    accessories: [...(fromTable(ACCESSORY_FROM_V1, a['accessory']) ?? [])],
    bata,
  };
}

/**
 * Avatar de un NPC autorado en el editor de mundo (spec §9.2): siempre un personalizado. En v1
 * se ignora `castId`: el editor viejo lo copiaba de defaultAvatar() (`'valentina'`) en todo avatar
 * y el render de las personas del caso nunca lo usó. Lo que no es un avatar (o es del elenco)
 * devuelve null, y el NPC cae a la receta de su clave o al figurante.
 */
export function authoredAvatarV2(x: unknown): AvatarPersonalizado | null {
  const a = asRecord(x);
  if (!a) return null;
  if (a['schemaVersion'] === undefined) {
    const traits = { ...a };
    delete traits['castId'];
    const migrated = migrateAvatarV1(traits);
    return migrated.mode === 'personalizado' ? migrated : null;
  }
  if (a['schemaVersion'] !== 2 || a['mode'] !== 'personalizado') return null;
  const coerced = coerceAvatarV2(a);
  return coerced.mode === 'personalizado' ? coerced : null;
}

/** Punto de entrada único: acepta v1 o v2; una versión desconocida cae al valor por defecto. */
export function toAvatarV2(x: unknown): AvatarV2 {
  const a = asRecord(x);
  if (!a) return defaultAvatarV2();
  if (a['schemaVersion'] === undefined) return migrateAvatarV1(a);
  return coerceAvatarV2(a);
}

export interface StoredAvatar {
  avatar: AvatarV2;
  /** Texto v1 original cuando hubo que migrarlo (para la copia `psychosim_avatar_v1`). */
  legacyRaw: string | null;
}

export function parseStoredAvatar(raw: string | null): StoredAvatar {
  if (!raw) return { avatar: defaultAvatarV2(), legacyRaw: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { avatar: defaultAvatarV2(), legacyRaw: null };
  }
  const record = asRecord(parsed);
  const legacy = record !== null && record['schemaVersion'] === undefined;
  return { avatar: toAvatarV2(parsed), legacyRaw: legacy ? raw : null };
}

export function serializeAvatarV2(avatar: AvatarV2): string {
  return JSON.stringify(avatar);
}

/** Huella corta (FNV-1a de 32 bits) de lo que se ve: clave de textura y de caché del avatar compuesto. */
export function avatarFingerprint(avatar: AvatarV2): string {
  const canonical = avatar.mode === 'elenco'
    ? `e|${avatar.recipeId}|${avatar.bata ? 1 : 0}`
    : `p|${avatar.complexion}|${avatar.skin}|${avatar.hair}|${avatar.hairColor}|${[...avatar.accessories].sort().join('+')}|${avatar.bata ? 1 : 0}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
