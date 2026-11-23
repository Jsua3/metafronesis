import type { Activation, Intensity } from '../../core/models/simulation.model';

/** Tinte rojo-violeta de la viñeta de crisis; no depende del tono del mapa. */
export const CRISIS_VIGNETTE_TINT = 0x4a0f2e;
/** Opacidad de la viñeta con la persona tensa: se ve, pero fija (sin pulso). */
export const TENSE_VIGNETTE_ALPHA = 0.3;
/** Opacidad de la viñeta con la persona en crisis (mínimo del pulso). */
export const CRISIS_VIGNETTE_ALPHA = 0.55;
/** Una escena de intensidad alta oscurece un poco la viñeta (se multiplica su opacidad; el tinte no cambia). */
export const HIGH_INTENSITY_DARKEN = 1.1;

export interface CrisisVignetteState {
  /** Opacidad de la capa de crisis (0 = invisible). */
  alpha: number;
  /** Pulso de ida y vuelta; null = fija. */
  pulse: { from: number; to: number; durationMs: number } | null;
}

export interface CameraFlash {
  durationMs: number;
  rgb: [number, number, number];
  /** Opacidad con la que arranca el destello (decae hasta 0); menos de 1 = destello suave. */
  peakAlpha: number;
}
export interface VignetteFrame { x: number; y: number; width: number; height: number; }

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Cuánto se ve la viñeta de crisis según la activación de la persona y la intensidad de la escena:
 * serena no se ve; tensa se ve fija; en crisis pulsa (fija con movimiento reducido o el mundo en pausa, en el
 * mínimo del pulso, así que ni al reanudar hay un escalón). Una intensidad alta oscurece un poco la viñeta.
 * Un valor desconocido no dibuja nada: un efecto visual no debe asustar por un dato roto.
 */
export function crisisVignetteState(
  activation: Activation,
  intensity: Intensity,
  reduceMotion: boolean,
): CrisisVignetteState {
  const darken = intensity === 'HIGH' ? HIGH_INTENSITY_DARKEN : 1;
  const level = (alpha: number) => round2(Math.min(1, alpha * darken));
  if (activation === 'TENSE') return { alpha: level(TENSE_VIGNETTE_ALPHA), pulse: null };
  if (activation !== 'CRISIS') return { alpha: 0, pulse: null };
  const from = level(CRISIS_VIGNETTE_ALPHA);
  if (reduceMotion) return { alpha: from, pulse: null };
  return { alpha: from, pulse: { from, to: level(0.85), durationMs: 800 } };
}

/**
 * Destello suave al pasar a otra sala. Nunca en la primera escena (ahí va el
 * fundido de entrada) ni al repintar la misma sala.
 */
export function roomEntryFlash(
  previousKey: string | null,
  nextKey: string,
  reduceMotion: boolean,
): CameraFlash | null {
  if (reduceMotion || !previousKey || previousKey === nextKey) return null;
  // Pico 0,20 (antes 0,45): a 0,45 el salto de luminancia de la sala medido en pantalla era 0,17, por encima
  // del umbral de destello general de WCAG 2.3.1 (0,10) y barría la escena entera; a 0,20 queda en ≈ 0,06.
  return { durationMs: 120, rgb: [214, 222, 236], peakAlpha: 0.2 };
}

/**
 * Rectángulo que la cámara muestra, en coordenadas de un objeto con scrollFactor 0.
 * El zoom de la cámara también escala esos objetos alrededor del centro: con zoom 2,
 * un marco pintado en (0,0)-(ancho,alto) queda fuera de pantalla.
 */
export function vignetteFrame(width: number, height: number, zoom: number): VignetteFrame {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const visibleW = width / z;
  const visibleH = height / z;
  return { x: (width - visibleW) / 2, y: (height - visibleH) / 2, width: visibleW, height: visibleH };
}
