// Solo tipos: el import se elide en runtime (los specs corren sin canvas).
import type Phaser from 'phaser';

/**
 * Contrato de escena 2.5D por capas (fase C).
 *
 * Una sala se compone de capas apiladas y reutilizables. Cada sala "premium"
 * implementa un SceneRenderer que pinta SOLO arte; el gameplay (colisiones,
 * actores, hints, input, API) vive fuera del renderer. El registry
 * (scene-renderer.registry.ts) resuelve qué renderer pinta cada mapKey; si no
 * hay renderer, el runtime usa el flujo Tiled/procedural existente.
 *
 *   background  → paredes, ventanas, decoración de muro
 *   floor       → piso con perspectiva, alfombras, zócalo
 *   backProps   → mobiliario pegado a la pared trasera (nunca solapa actores)
 *   midProps    → mobiliario en el piso, ordenado por Y junto a los actores
 *   actors      → jugador, NPCs, marcadores (los gestiona el gameplay, NO el renderer)
 *   frontProps  → oclusión de primer plano (siluetas, esquinas, plantas)
 *   lighting    → pools de luz, haz de ventana, viñeta
 *   uiHints     → hints contextuales del mundo (los gestiona el gameplay)
 */
export type SceneLayerKind =
  | 'background'
  | 'floor'
  | 'backProps'
  | 'midProps'
  | 'actors'
  | 'frontProps'
  | 'lighting'
  | 'uiHints';

/** Capas que un renderer de sala debe pintar (las demás son del gameplay). */
export const PREMIUM_RENDERER_LAYERS: readonly SceneLayerKind[] = [
  'background',
  'floor',
  'backProps',
  'midProps',
  'frontProps',
  'lighting',
] as const;

/** Capas que NUNCA pinta un renderer: pertenecen al gameplay. */
export const GAMEPLAY_ONLY_LAYERS: readonly SceneLayerKind[] = ['actors', 'uiHints'] as const;

export interface SceneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScenePoint {
  x: number;
  y: number;
}

/** Opciones de render de una sala. */
export interface SceneRendererOptions {
  width: number;
  height: number;
  /** true → sin tweens ni partículas (prefers-reduced-motion). */
  reduceMotion: boolean;
  /** Tono ambiental autorado (calm | clinical | warm | tense). */
  ambientTone?: string;
}

/** Metadata visual que el renderer devuelve al gameplay. */
export interface SceneRenderMetadata {
  bounds: { width: number; height: number };
  /** Rect caminable (coincide con las colisiones jugables de la sala). */
  floorBounds: SceneRect;
  /** Puntos de interés visual (cámara/guía/futuras salas). */
  focusPoints: Record<string, ScenePoint>;
  /** Zonas con oclusión de primer plano (frontProps) — fuera del piso jugable. */
  occlusionZones: readonly SceneRect[];
  /** Capas efectivamente pintadas, en orden. */
  paintedLayers: readonly SceneLayerKind[];
}

/**
 * Renderer de sala 2.5D. Pinta arte y devuelve metadata; NO maneja decisiones,
 * diálogos, herramientas, API, estado del intento, interacción, input,
 * persistencia ni colisiones (esas viven en los utils de gameplay).
 */
export interface SceneRenderer {
  /** Identificador estable del renderer (logs/specs). */
  key: string;
  /** true si este renderer pinta el mapa indicado. */
  supports(mapKey: string | null | undefined): boolean;
  render(scene: Phaser.Scene, options: SceneRendererOptions): SceneRenderMetadata;
}
