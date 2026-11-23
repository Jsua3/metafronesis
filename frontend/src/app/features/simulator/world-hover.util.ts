import { REVEAL_RADIUS } from './interaction-priority.util';
import { WalkPoint } from './world-walk.util';

/**
 * Qué se resalta con el puntero en el mundo (plan visual F6-7, VD-5; misma regla que VD-19). Pura: sin Phaser, sin
 * datos clínicos. El contorno, el verbo y el cursor solo caen sobre lo que el jugador YA podría saber: dentro del
 * radio de percepción (`REVEAL_RADIUS`, con el que un objeto o persona enseña su nombre) o ya examinado. Nada por
 * descubrir se ilumina ni delata su sitio; la distancia y lo examinado deciden, nunca el tipo ni nada clínico.
 */

/** Caja de puntería de un actor respecto de sus pies: el cuerpo (arriba) y la sombra (abajo). Px de mundo. */
export const HOVER_HIT = { halfWidth: 22, above: 46, below: 14 } as const;

export interface HoverCandidate {
  /** Clave del marcador o `npc:{clave}`. */
  readonly key: string;
  /** Pies del actor (o punto base del marcador) en coordenadas del mundo. */
  readonly x: number;
  readonly y: number;
  /** Distancia del jugador a este actor. */
  readonly playerDistance: number;
}

/**
 * El candidato elegible bajo el puntero (el más cercano a él), o null. Un candidato no elegible (fuera del radio de
 * percepción y sin examinar) no cuenta ni como obstáculo: nunca roba el puntero a lo que sí se puede ver.
 */
export function pickHoverTarget(
  pointer: WalkPoint,
  candidates: readonly HoverCandidate[],
  examined: ReadonlySet<string>,
): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (candidate.playerDistance > REVEAL_RADIUS && !examined.has(candidate.key)) continue;
    const dx = pointer.x - candidate.x;
    const dy = pointer.y - candidate.y;
    if (Math.abs(dx) > HOVER_HIT.halfWidth || dy < -HOVER_HIT.above || dy > HOVER_HIT.below) continue;
    // Distancia al centro de la caja: entre dos actores solapados gana el que el puntero tiene más cerca.
    const distance = Math.hypot(dx, dy + (HOVER_HIT.above - HOVER_HIT.below) / 2);
    if (distance < bestDistance) {
      best = candidate.key;
      bestDistance = distance;
    }
  }
  return best;
}
