/**
 * Retrato del diálogo (spec §7.3, §8.2): el de la receta del hablante, buscado primero por
 * la receta del NPC y su clave y después por su nombre. Una voz sin cuerpo («Supervisión
 * clínica», «Protocolo clínico»…) no tiene retrato: el panel muestra su silueta.
 */
import {
  portraitStateFor,
  resolveCharacter,
  resolveRecipeId,
  visualPortrait,
} from '../character/kit/character-visual.resolver';
import type { KitBundle } from '../character/kit/kit-engine';
import { sheetSourceUrl } from '../character/kit/kit-raster';

/**
 * Recetas que no sonríen en este caso (límite de producto del informe de jugabilidad: sin sonrisa en el duelo): la
 * Abuela, la Sobreviviente y los familiares de los escenarios de Urgencias y Comisaría, que comparten `madre-acompanante`
 * (también la plantilla genérica `mujer-adulta`, que resuelve a esa receta).
 */
const NO_SMILE_RECIPES: ReadonlySet<string> = new Set(['abuela-familia', 'sobreviviente', 'madre-acompanante']);

export interface DialoguePortraitKeys {
  recipeId?: string | null;
  portraitKey?: string | null;
  speakerName?: string | null;
  emotion?: string | null;
}

export function resolvePortraitAsset(bundle: KitBundle | null, keys: DialoguePortraitKeys): string | null {
  if (!bundle) return null;
  const recipeId = resolveRecipeId(bundle, { recipeId: keys.recipeId, actor: keys.portraitKey, speaker: keys.speakerName });
  if (!recipeId) return null;
  const visual = resolveCharacter(bundle, { kind: 'receta', recipeId });
  const state = portraitStateFor(bundle, keys.emotion);
  const source = visualPortrait(visual, state === 'alegre' && NO_SMILE_RECIPES.has(recipeId) ? 'neutral' : state);
  return source ? sheetSourceUrl(source) : null;
}

/** Hablantes que no son personas: solo ellos conservan chip y etiqueta de emoción en el panel. */
const SYSTEM_VOICES = new Set([
  'Supervisión clínica',
  'Criterio profesional',
  'Herramienta profesional',
  'Intervención',
]);

/**
 * `true` para las voces del sistema (supervisión, criterio profesional, herramientas) y para un
 * hablante sin nombre. Las personas del caso no llevan etiqueta de emoción: rotular el duelo
 * ajeno («receptiva», «alerta») es un juicio que el panel no debe hacer.
 */
export function isSystemVoice(speakerName: string | null | undefined): boolean {
  const name = speakerName?.trim();
  return !name || SYSTEM_VOICES.has(name);
}
