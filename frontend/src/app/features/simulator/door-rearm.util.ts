import { ORIENTATION_COPY } from './orientation.config';

/**
 * Distancia (px del mundo) a la que hay que alejarse de las puertas antes de volver a cruzar una: al entrar o recargar
 * junto a una puerta de retorno se exige alejarse, para que un evento residual no rebote a la sala anterior.
 */
export const DOOR_REARM_DISTANCE = 72;

/** Lo que mide un paso al caminar (px del mundo): a 150 px/s, unos 0,16 s. Solo sirve para decir cuánto falta en palabras. */
export const PASO_PX = 24;

export interface DoorPoint { x: number; y: number }

export interface DoorRearmProgress {
  /** Pasos que faltan para quedar a `DOOR_REARM_DISTANCE` de la puerta más cercana (al menos 1). */
  steps: number;
  /** «hacia la izquierda», «hacia la derecha», «hacia arriba» o «hacia abajo»: lejos de esa puerta. */
  toward: string;
}

/**
 * ¿Cuánto falta para volver a poder cruzar una puerta? `null` cuando ya no hay ninguna a menos de `DOOR_REARM_DISTANCE`
 * (o no hay puertas). Es la MISMA regla que rearma la puerta (`SimulationPlayComponent.rearmDoorInteractionWhenAway`), así
 * que el aviso y la regla no pueden desacordarse: el aviso desaparece justo cuando la regla se cumple.
 */
export function doorRearmProgress(player: DoorPoint, doors: readonly DoorPoint[]): DoorRearmProgress | null {
  let nearest: DoorPoint | null = null;
  let nearestDistance = Infinity;
  for (const door of doors) {
    const distance = Math.hypot(player.x - door.x, player.y - door.y);
    if (distance < nearestDistance) { nearest = door; nearestDistance = distance; }
  }
  if (!nearest || nearestDistance >= DOOR_REARM_DISTANCE) return null;
  const steps = Math.max(1, Math.ceil((DOOR_REARM_DISTANCE - nearestDistance) / PASO_PX));
  const dx = player.x - nearest.x;
  const dy = player.y - nearest.y;
  // Lejos de la puerta: por el eje en que ya está más apartada (a igual distancia, el horizontal). Sin vector, a lo ancho.
  const toward = Math.abs(dx) >= Math.abs(dy)
    ? (dx >= 0 ? 'hacia la derecha' : 'hacia la izquierda')
    : (dy >= 0 ? 'hacia abajo' : 'hacia arriba');
  return { steps, toward };
}

/** El aviso en palabras simples; `null` cuando no falta nada. */
export function doorRearmMessage(player: DoorPoint, doors: readonly DoorPoint[]): string | null {
  const progress = doorRearmProgress(player, doors);
  // BORRADOR: texto pendiente de Psicología. La geometría puede bloquear el eje radial y la regla acepta cualquier dirección:
  // el texto no promete una dirección. Una sola fuente: el texto de orientación.
  return progress ? ORIENTATION_COPY.door.awayFromDoorGeneric : null;
}
