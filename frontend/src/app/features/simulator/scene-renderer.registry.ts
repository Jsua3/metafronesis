import { SceneRenderer } from './scene-layer.types';
import { premiumClinicalRoomRenderer } from './premium-clinical-room.renderer';
import { CASE_PDF_ROOM_RENDERERS } from './case-pdf-rooms.renderer';

/**
 * Registry de renderers de escena 2.5D (fase C).
 *
 * game-world pregunta aquí qué renderer pinta un mapKey/tiledMapKey. Si hay
 * renderer, ese pinta TODAS las capas visuales de la sala; si no, el runtime
 * usa el flujo Tiled/procedural existente. Para sumar una sala nueva basta con
 * implementar SceneRenderer y agregarla a esta lista — sin tocar game-world.
 */
const SCENE_RENDERERS: readonly SceneRenderer[] = [
  premiumClinicalRoomRenderer,
  ...CASE_PDF_ROOM_RENDERERS,
];

/** Resuelve el renderer que soporta el mapa, o null (flujo Tiled/procedural). */
export function resolveSceneRenderer(mapKey: string | null | undefined): SceneRenderer | null {
  return SCENE_RENDERERS.find(renderer => renderer.supports(mapKey)) ?? null;
}

/** Claves de los renderers registrados (diagnóstico/specs). */
export function registeredSceneRendererKeys(): readonly string[] {
  return SCENE_RENDERERS.map(renderer => renderer.key);
}
