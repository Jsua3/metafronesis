/**
 * Quién es cada personaje del mundo (spec §8.2): el jugador, los NPC de escenario,
 * las personas del caso y los figurantes, como CharacterRef del kit.
 * Lógica pura; game-world solo dibuja lo que esto resuelve.
 */
import { authoredAvatarV2, parseStoredAvatar } from '../character/kit/avatar-v2';
import { type CharacterRef, resolveRecipeId } from '../character/kit/character-visual.resolver';
import type { KitBundle } from '../character/kit/kit-engine';
import type { MapObjectState, NpcConfig } from '../../core/models/simulation.model';

/** Alto del cuerpo sobre los pies en el cuadro del kit (pies en y = 68; tope de la cabeza en y ≈ 4). */
export const KIT_BODY_HEIGHT = 64;
/** Nombre y aviso «E» sobre la cabeza, e icono del estado clínico justo encima de ella. */
export const KIT_LABEL_OFFSET_Y = -(KIT_BODY_HEIGHT + 4);
export const KIT_ICON_OFFSET_Y = -(KIT_BODY_HEIGHT + 2);

/** El jugador según lo guardado (v1 o v2; lo inválido cae al valor por defecto). */
export function playerCharacterRef(stored: string | null): CharacterRef {
  return { kind: 'jugador', avatar: parseStoredAvatar(stored).avatar };
}

/** Receta de la paciente del caso: sus actores llevan el icono del estado clínico. */
export const PATIENT_RECIPE_ID = 'sobreviviente';

export function npcCharacterRef(npc: Pick<NpcConfig, 'recipeId'>): CharacterRef {
  return { kind: 'receta', recipeId: npc.recipeId };
}

/** Alfa de un marcador de otra etapa del proceso (T9.9 de master, F§7.2): se ve, pero no es lo que toca ahora. */
export const DIMMED_ALPHA = 0.55;

/**
 * Énfasis de un marcador según la cercanía, la selección y si es de otra etapa. Una persona dibujada con el
 * kit nunca se escala (spec §8.2: sprites a escala 1, nada los deforma) ni se vela con el 0,88 de reposo; su
 * señal es el nombre y el anillo. Los marcadores con otro sprite de pixel art tampoco se escalan. Lo de otra
 * etapa se atenúa a `DIMMED_ALPHA`, también las personas (WAY-03), salvo cerca o seleccionado.
 */
export function markerEmphasis(
  state: { selected: boolean; near: boolean; kitSprite: boolean; pixelSprite: boolean; dimmed?: boolean },
): { scale: number; alpha: number } {
  const lit = state.selected || state.near;
  const alpha = lit ? 1 : state.dimmed ? DIMMED_ALPHA : state.kitSprite ? 1 : 0.88;
  if (state.kitSprite) return { scale: 1, alpha };
  // Un marcador con sprite de pixel art (puerta, herramienta, objeto) se aclara pero no se escala:
  // a ×1,08 sus píxeles saldrían desiguales (spec §1.1.2).
  const scale = state.pixelSprite ? 1 : state.selected ? 1.12 : state.near ? 1.08 : 1;
  return { scale, alpha };
}

/** Figurantes de los mapas legados y respaldo de todo actor sin receta (spec §7.2). */
export function extrasCharacterRef(bundle: KitBundle): CharacterRef {
  return { kind: 'receta', recipeId: bundle.catalog.extras };
}

/**
 * Persona del caso (marker PERSON): la receta que eligió el docente, su plantilla vieja,
 * su avatar autorado (v1 o v2) o la receta del actor por su clave; si nada, el figurante.
 */
export function personCharacterRef(bundle: KitBundle, object: Pick<MapObjectState, 'key' | 'metadata'>): CharacterRef {
  const meta = (object.metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  const chosen = resolveRecipeId(bundle, { recipeId: text(meta['recipeId']), template: text(meta['npcTemplateId']) });
  if (chosen) return { kind: 'receta', recipeId: chosen };
  if (authoredAvatarV2(meta['avatar'])) return { kind: 'autorado', avatar: meta['avatar'] };
  return { kind: 'receta', recipeId: resolveRecipeId(bundle, { actor: object.key }) ?? bundle.catalog.extras };
}
