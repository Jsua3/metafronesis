/** Cambios del editor de personaje sobre el avatar v2 (spec §4.7; decisiones 17-18). Puros. */
import {
  AVATAR_LABELS,
  AccessoryId,
  AvatarPersonalizado,
  AvatarV2,
  PlayableId,
  SKINS,
  coerceAvatarV2,
  defaultPersonalizado,
} from './kit/avatar-v2';

export function chooseElenco(current: AvatarV2, recipeId: PlayableId): AvatarV2 {
  return { schemaVersion: 2, mode: 'elenco', recipeId, bata: current.bata };
}

/** Al personalizado, con el último personalizado que hubo (o el de por defecto) y la bata actual. */
export function choosePersonalizado(current: AvatarV2, lastCustom: AvatarPersonalizado | null): AvatarPersonalizado {
  if (current.mode === 'personalizado') return current;
  return { ...(lastCustom ?? defaultPersonalizado()), bata: current.bata };
}

export function withBata(current: AvatarV2, bata: boolean): AvatarV2 {
  return { ...current, bata };
}

export function withCustom(current: AvatarPersonalizado, patch: Partial<AvatarPersonalizado>): AvatarPersonalizado {
  return coerceAvatarV2({ ...current, ...patch, mode: 'personalizado', schemaVersion: 2 }) as AvatarPersonalizado;
}

export function toggleAccessory(current: AvatarPersonalizado, id: AccessoryId): AvatarPersonalizado {
  const has = current.accessories.includes(id);
  return withCustom(current, { accessories: has ? current.accessories.filter(a => a !== id) : [...current.accessories, id] });
}

/** Resumen para lectores de pantalla; `labelOf` da el nombre de un jugable. */
export function avatarSummary(avatar: AvatarV2, labelOf: (recipeId: string) => string): string {
  const bata = avatar.bata ? 'con bata' : 'sin bata';
  if (avatar.mode === 'elenco') return `${labelOf(avatar.recipeId)}, del elenco, ${bata}.`;
  const tone = SKINS.indexOf(avatar.skin) + 1;
  return `Avatar personalizado: complexión ${avatar.complexion.toUpperCase()}, tono ${tone}, `
    + `${AVATAR_LABELS.hair[avatar.hair].toLowerCase()} ${AVATAR_LABELS.hairColor[avatar.hairColor].toLowerCase()}, ${bata}.`;
}
