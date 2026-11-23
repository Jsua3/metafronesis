import type { MapObjectState } from '../../core/models/simulation.model';
import { KEY_PERSON_FEET_OFFSET_Y } from './key-person.util';

/**
 * Dónde pisa un objeto del mapa y cómo se dibuja respecto a su posición (revisión final del plan P6, B2 y B3). Pura: sin Phaser.
 *
 * **Apoyo.** Lo que el editor coloca desde la biblioteca (y lo que la copia al caso trae) tiene por posición el punto donde
 * APOYA en el suelo —centro inferior—, igual que lo dibuja el editor. Lo marca `metadata.apoyo = "pies"` y el juego lo
 * dibuja con la base en (x, y). Un objeto sin esa marca (casos hechos antes, el seed del juego) se dibuja como siempre: su
 * icono centrado en (x, y), con la sombra de contacto y los pies del personaje 16 px más abajo.
 *
 * **Puerta pintada.** `metadata.pintada = true` en una puerta (`EXIT`) dice que ya está dibujada en el fondo de la sala: el juego
 * no le pone otro sprite encima, solo la pista y el área para cruzar.
 */

/** Valor de `metadata.apoyo` cuando la posición del objeto es su punto de apoyo en el suelo. */
export const FEET_ANCHOR = 'pies';
/** Cuánto bajo el marcador están el contacto con el suelo y los pies en los objetos sin apoyo declarado. */
export const LEGACY_FEET_OFFSET_Y = KEY_PERSON_FEET_OFFSET_Y;
/** Separación entre el contacto con el suelo y el rótulo de debajo (28 − 16 en los casos de antes). */
const LABEL_GAP_BELOW_FEET_PX = 12;

export function standsOnFeet(object: Pick<MapObjectState, 'metadata'>): boolean {
  return object.metadata?.['apoyo'] === FEET_ANCHOR;
}

/** Lo que el contacto con el suelo (la sombra, los pies) queda bajo la posición del marcador. */
export function markerFeetOffsetY(object: Pick<MapObjectState, 'metadata'>): number {
  return standsOnFeet(object) ? 0 : LEGACY_FEET_OFFSET_Y;
}

/** Lo que el rótulo del objeto queda bajo su posición: debajo del contacto con el suelo. */
export function markerLabelOffsetY(object: Pick<MapObjectState, 'metadata'>): number {
  return markerFeetOffsetY(object) + LABEL_GAP_BELOW_FEET_PX;
}

/** ¿Es una puerta que el fondo de la sala ya muestra dibujada? */
export function isPaintedDoor(object: Pick<MapObjectState, 'type' | 'metadata'>): boolean {
  return object.type === 'EXIT' && object.metadata?.['pintada'] === true;
}
