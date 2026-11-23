/**
 * Animación de cercanía de un objeto: se reproduce mientras es el candidato principal de interacción
 * (`nearestKey`, radio 74 px) y vuelve al reposo —el cuadro 0— al dejar de serlo. Con «Reducir movimiento»
 * (el ajuste del jugador o `prefers-reduced-motion`) se muestra el cuadro 0 fijo, sin reproducir nada.
 */

/** Lo mínimo que se le pide al sprite de Phaser: la escena real le pasa un `Phaser.GameObjects.Sprite`. */
export interface ProximitySprite {
  play(animationKey: string): unknown;
  stop(): unknown;
  setFrame(frame: number): unknown;
  /** El cuadro que se está dibujando (en Phaser, `name` es el número de cuadro de la hoja). */
  frame?: { name: string | number };
}

/** Un objeto con hoja de cercanía y su estado de reproducción. */
export interface ProximityAnimation {
  sprite: ProximitySprite;
  /** Clave de la animación registrada en Phaser para la hoja. */
  animationKey: string;
  playing: boolean;
}

/** Clave de la animación de Phaser para una hoja de cercanía a esos cuadros por segundo. */
export function proximityAnimationKey(sheetTextureKey: string, fps: number): string {
  return `cerca:${sheetTextureKey}@${fps}`;
}

/** ¿Debe estar reproduciéndose? Solo si es el objeto principal y el movimiento no está reducido. */
export function shouldPlayProximity(near: boolean, reduceMotion: boolean): boolean {
  return near && !reduceMotion;
}

/**
 * Lleva la animación al estado que toca. Idempotente: se llama en cada repintado de marcadores y solo toca el
 * sprite cuando el estado cambia. Al detenerla deja el cuadro 0 (el reposo).
 */
export function syncProximityAnimation(animation: ProximityAnimation, near: boolean, reduceMotion: boolean): void {
  const play = shouldPlayProximity(near, reduceMotion);
  if (play === animation.playing) return;
  animation.playing = play;
  if (play) {
    animation.sprite.play(animation.animationKey);
  } else {
    animation.sprite.stop();
    animation.sprite.setFrame(0);
  }
}

/**
 * Lo que se publica en el host del juego para la prueba de extremo a extremo (`data-proximity`, igual que
 * `data-player-x`): qué objeto está animando ahora y el cuadro que muestra cada objeto con hoja de cercanía. Se
 * calcula aquí, sin Phaser, para poder probarlo; el juego solo lo escribe cuando cambia.
 */
export interface ProximityReport {
  playing: string | null;
  frames: Record<string, number>;
}

export function proximityReport(animations: ReadonlyMap<string, ProximityAnimation>): ProximityReport {
  let playing: string | null = null;
  const frames: Record<string, number> = {};
  animations.forEach((animation, key) => {
    if (animation.playing && playing === null) playing = key;
    frames[key] = Number(animation.sprite.frame?.name ?? 0) || 0;
  });
  return { playing, frames };
}
