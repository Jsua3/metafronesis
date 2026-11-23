import type { MapObjectState } from '../../core/models/simulation.model';
import { DRAFT_COPY } from './draft-copy';

/**
 * Persona clave de una sala (P6, tarea 4): `metadata.personaClave === true`, que marca el docente («a quien atender»).
 * A lo sumo una por sala —el editor lo impide—; si el caso trae más, solo cuenta la primera por orden de la lista.
 *
 * El juego la señala con un chevrón y su nombre sobre la cabeza, en el acento del juego #B69CFF (nunca el morado de la
 * guía del editor), y la lista accesible la nombra con el texto «persona a atender»: la señal tiene forma y texto,
 * no depende solo del color. Pura: sin Phaser.
 */

/** Acento del juego para la persona clave (el mismo lila claro del anillo y de las puertas de la sala de autoría). */
export const KEY_PERSON_COLOR = '#B69CFF';
export const KEY_PERSON_COLOR_HEX = 0xb69cff;
/** Halo oscuro del chevrón: contraste sobre cualquier piso. */
export const KEY_PERSON_HALO_HEX = 0x0b0f1a;
/** Chevrón apuntando hacia abajo (a la cabeza): mitad del ancho y alto, en px del mundo. */
export const KEY_PERSON_CHEVRON = { halfWidth: 7, height: 8 } as const;
/** Alto del cuerpo del kit sobre los pies y holgura entre la cabeza y la punta del chevrón. */
export const KEY_PERSON_HEAD_PX = 64;
const KEY_PERSON_GAP_PX = 2;
/** Sombra de contacto del marcador de una persona: sus pies están así de bajo su centro. */
export const KEY_PERSON_FEET_OFFSET_Y = 16;
/** Separación entre el nombre y el chevrón. */
export const KEY_PERSON_NAME_GAP_PX = 3;

/**
 * Dónde queda la punta del chevrón respecto al centro del marcador: sobre la cabeza del cuerpo, que está `feetOffsetY` px
 * bajo el marcador (16 en los casos de antes; 0 si el marcador ya es el punto de apoyo, `metadata.apoyo = "pies"`).
 */
export function keyPersonTipOffsetY(feetOffsetY: number): number {
  return feetOffsetY - KEY_PERSON_HEAD_PX - KEY_PERSON_GAP_PX;
}

/** La punta del chevrón en los casos de antes (marcador 16 px sobre los pies). */
export const KEY_PERSON_TIP_OFFSET_Y = keyPersonTipOffsetY(KEY_PERSON_FEET_OFFSET_Y);

export function isKeyPerson(object: Pick<MapObjectState, 'type' | 'metadata'>): boolean {
  return object.type === 'PERSON' && object.metadata?.['personaClave'] === true;
}

/** La persona clave de la sala: la primera de la lista que lo sea, o null. */
export function resolveKeyPerson<T extends Pick<MapObjectState, 'type' | 'metadata'>>(objects: readonly T[]): T | null {
  return objects.find(isKeyPerson) ?? null;
}

/** Cómo la anuncia un lector de pantalla: su nombre y que es a quien hay que atender. */
export function keyPersonAccessibleName(name: string): string {
  return `${name}, ${DRAFT_COPY.keyPerson.text}`;
}
