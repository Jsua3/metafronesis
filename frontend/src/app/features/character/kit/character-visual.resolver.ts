/**
 * Punto único de resolución de personajes (spec §8.1): cualquier personaje del
 * juego (el jugador, una receta, un NPC autorado) pasa a un CharacterVisual.
 *
 * Las recetas fijas se dibujan con los PNG que publica `npm run kit:build`; el
 * avatar personalizado se compone aquí con el mismo motor del build (mismos
 * píxeles en el navegador y en CI) y se guarda en una caché pequeña por su huella.
 */
import { AvatarPersonalizado, AvatarV2, OUTFIT_IDS, authoredAvatarV2, avatarFingerprint } from './avatar-v2';
import {
  KitBundle,
  PORTRAIT_STATES,
  PortraitState,
  Recipe,
  RgbaImage,
  composeCharacter,
} from './kit-engine';

export const KIT_ASSETS = '/assets/characters/kit';
/** Variante de los jugables con la bata de Psicología (decisión 17). */
export const BATA_VARIANT = 'bata';

export type CharacterRef =
  | { kind: 'jugador'; avatar: AvatarV2 }
  | { kind: 'receta'; recipeId: string; variant?: string | null }
  | { kind: 'autorado'; avatar: unknown };

export type SheetSource =
  | { kind: 'url'; url: string }
  | { kind: 'rgba'; image: RgbaImage };

export interface CharacterVisual {
  /** Prefijo de texturas y animaciones: 'kit-valentina', 'kit-valentina-bata' o 'kit-avatar-1a2b3c4d'. */
  key: string;
  /** Receta publicada que lo dibuja; null para el avatar personalizado. */
  recipeId: string | null;
  idle: SheetSource;
  walk: SheetSource;
  portraits: Partial<Record<PortraitState, SheetSource>>;
}

export function resolveCharacter(bundle: KitBundle, ref: CharacterRef): CharacterVisual {
  if (ref.kind === 'receta') return recipeVisual(bundle, ref.recipeId, ref.variant ?? null);
  if (ref.kind === 'autorado') {
    // Un NPC autorado nunca es un jugable; lo que no es un avatar es el figurante (spec §9.2).
    const authored = authoredAvatarV2(ref.avatar);
    return (authored && composedOrNull(bundle, authored)) ?? recipeVisual(bundle, bundle.catalog.extras, null);
  }
  const avatar = ref.avatar;
  const variant = avatar.bata ? BATA_VARIANT : null;
  if (avatar.mode === 'elenco') return recipeVisual(bundle, avatar.recipeId, variant);
  return composedOrNull(bundle, avatar) ?? recipeVisual(bundle, bundle.catalog.defaultRecipe, variant);
}

/**
 * El motor lanza ante una pieza o rampa desconocida. Con un kit.json que no corresponde a este
 * código (caché vieja) eso no debe tumbar el lobby, el mundo ni el editor: se usa el respaldo.
 */
function composedOrNull(bundle: KitBundle, avatar: AvatarPersonalizado): CharacterVisual | null {
  try {
    return composedVisual(bundle, avatar);
  } catch {
    return null;
  }
}

function recipeVisual(bundle: KitBundle, recipeId: string, variant: string | null): CharacterVisual {
  const id = bundle.recipes[recipeId] ? recipeId : bundle.catalog.defaultRecipe;
  const recipe = bundle.recipes[id]!;
  const useVariant = variant !== null && recipe.kind === 'jugable' && bundle.catalog.playableVariants[variant] !== undefined;
  const base = useVariant ? `${KIT_ASSETS}/${id}/${variant}` : `${KIT_ASSETS}/${id}`;
  const png = (name: string): SheetSource => ({ kind: 'url', url: `${base}/${name}.png` });
  const portraits: CharacterVisual['portraits'] = {};
  for (const state of recipe.portraits ?? ['neutral']) portraits[state] = png(`portrait-${state}`);
  return { key: useVariant ? `kit-${id}-${variant}` : `kit-${id}`, recipeId: id, idle: png('idle'), walk: png('walk'), portraits };
}

/** Pocas entradas: en una sesión se ven el avatar propio y, en el editor de mundo, algún NPC. */
const COMPOSED_CACHE_LIMIT = 8;
const composedCaches = new WeakMap<KitBundle, Map<string, CharacterVisual>>();

function composedVisual(bundle: KitBundle, avatar: AvatarPersonalizado): CharacterVisual {
  let cache = composedCaches.get(bundle);
  if (!cache) {
    cache = new Map();
    composedCaches.set(bundle, cache);
  }
  const key = `kit-avatar-${avatarFingerprint(avatar)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const composed = composeCharacter(bundle, avatarRecipe(bundle, avatar));
  const portraits: CharacterVisual['portraits'] = {};
  for (const state of PORTRAIT_STATES) {
    const image = composed.portraits[state];
    if (image) portraits[state] = { kind: 'rgba', image };
  }
  const visual: CharacterVisual = {
    key,
    recipeId: null,
    idle: { kind: 'rgba', image: composed.idle },
    walk: { kind: 'rgba', image: composed.walk },
    portraits,
  };
  cache.set(key, visual);
  if (cache.size > COMPOSED_CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return visual;
}

/** Receta del avatar personalizado: sus rasgos con el uniforme (y la bata, si la lleva). */
export function avatarRecipe(bundle: KitBundle, avatar: AvatarPersonalizado): Recipe {
  const editor = bundle.catalog.editor;
  const outfitId = avatar.bata ? OUTFIT_IDS.conBata : OUTFIT_IDS.sinBata;
  const outfit = editor.outfits.find(o => o.id === outfitId) ?? editor.outfits[0]!;
  return {
    id: `avatar-${avatarFingerprint(avatar)}`,
    displayName: 'Avatar personalizado',
    complexion: avatar.complexion,
    pieces: {
      hair: avatar.hair,
      face: editor.face,
      top: outfit.top,
      ...(outfit.layer ? { layer: outfit.layer } : {}),
      bottom: outfit.bottom,
      shoes: outfit.shoes,
      accessories: [...avatar.accessories],
    },
    colors: { skin: avatar.skin, hair: avatar.hairColor, ...(outfit.variants[0]?.colors ?? {}) },
    portraits: ['neutral'],
  };
}

/** Claves con las que el juego nombra a un personaje, de la más precisa a la menos. */
export interface CharacterLookup {
  recipeId?: string | null;
  /** Clave de un objeto PERSON del mundo o `portraitKey` de un diálogo. */
  actor?: string | null;
  template?: string | null;
  speaker?: string | null;
}

/** Receta del personaje, o null si es una voz sin cuerpo (spec §7.2) o no tiene receta. */
export function resolveRecipeId(bundle: KitBundle, lookup: CharacterLookup): string | null {
  const { catalog, recipes } = bundle;
  const known = (id: string | null | undefined): string | null => (id && recipes[id] ? id : null);
  return known(lookup.recipeId)
    ?? known(lookup.actor ? catalog.actors[lookup.actor] ?? catalog.portraitKeys[lookup.actor] : null)
    ?? known(lookup.template ? catalog.templates[lookup.template] : null)
    ?? (lookup.speaker && !catalog.voices.includes(lookup.speaker) ? known(catalog.speakers[lookup.speaker]) : null);
}

/** Emoción del diálogo → estado de retrato (spec §7.3); lo desconocido es neutral. */
export function portraitStateFor(bundle: KitBundle, emotion: string | null | undefined): PortraitState {
  const state = emotion ? bundle.catalog.emotionToPortrait[emotion.trim().toLowerCase()] : undefined;
  return state && PORTRAIT_STATES.includes(state) ? state : 'neutral';
}

/** Retrato del estado pedido o, si la receta no lo tiene, el neutral. */
export function visualPortrait(visual: CharacterVisual, state: PortraitState): SheetSource | null {
  return visual.portraits[state] ?? visual.portraits.neutral ?? null;
}
