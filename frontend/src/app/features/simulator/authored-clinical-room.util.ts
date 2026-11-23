/**
 * Sala clínica autoría (vertical slice urgencias-crisis).
 *
 * La sala la pinta premium-clinical-room.renderer (vía el registry de fase C)
 * sobre un lienzo de 960×528. Este helper centraliza la geometría JUGABLE:
 * colisiones, posiciones de marcadores backend y de NPCs, para que el render y
 * el gameplay compartan una sola fuente de verdad.
 */
import { playerHitbox, rectsIntersect } from './player-motion.util';

const AUTHORED_CLINICAL_ROOM_KEYS = new Set([
  'urgencias-crisis',
  'urgencias-sala',
  'map-urgencias-sala',
  'ruta-sala',
  'map-ruta-sala',
  'informe-oficina',
  'map-informe-oficina',
  'nna-sala',
  'map-nna-sala',
  'cierre-sala',
  'map-cierre-sala',
]);

export function isAuthoredClinicalRoomKey(key: string | undefined | null): boolean {
  return typeof key === 'string' && AUTHORED_CLINICAL_ROOM_KEYS.has(key);
}

export interface RoomRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const AUTHORED_ROOM_WIDTH = 960;
export const AUTHORED_ROOM_HEIGHT = 528;

/** Punto de aparición del jugador (centro-frente de la sala). */
export const AUTHORED_PLAYER_SPAWN = { x: 480, y: 420 } as const;

/**
 * Colisiones AABB de la sala autoría: bandas de pared (la zona caminable es el
 * piso trapezoidal entre y≈240 y y≈486) + mobiliario dibujado en
 * renderAuthoredClinicalOffice (escritorio, sofá, mesa de centro, plantas).
 */
export const AUTHORED_CLINICAL_COLLISIONS: readonly RoomRect[] = [
  { x: 0, y: 0, width: AUTHORED_ROOM_WIDTH, height: 236 },          // pared del fondo
  { x: 0, y: 486, width: AUTHORED_ROOM_WIDTH, height: 60 },         // borde frontal
  { x: 0, y: 0, width: 96, height: AUTHORED_ROOM_HEIGHT },          // pared izquierda
  { x: 864, y: 0, width: 96, height: AUTHORED_ROOM_HEIGHT },        // pared derecha
  { x: 365, y: 262, width: 270, height: 80 },                       // escritorio (250/270 px en drawDesk)
  { x: 121, y: 288, width: 138, height: 70 },                       // sofá
  { x: 254, y: 353, width: 92, height: 44 },                        // mesa de centro
  { x: 796, y: 366, width: 48, height: 44 },                        // planta derecha
  { x: 92, y: 372, width: 48, height: 44 },                         // planta izquierda
];

/**
 * Posiciones jugables de los puntos interactivos del backend dentro de la sala
 * autoría (las coordenadas originales del seed pertenecen al tilemap viejo).
 * Claves estables del caso urgencias-crisis.
 */
export const AUTHORED_MARKER_POSITIONS: Readonly<Record<string, { x: number; y: number }>> = {
  'escucha-segura':          { x: 168, y: 408 },  // familia junto al sofá
  'cuestionario-prematuro':  { x: 178, y: 268 },  // acceso al área médica (riesgosa)
  'aviso-policial':          { x: 806, y: 296 },  // cartelera de ruta VBG
  'tool-pap':                { x: 318, y: 428 },  // kit PAP frente a la mesa
  'tool-bitacora':           { x: 648, y: 372 },  // bitácora sobre el escritorio
  // Puertas espaciales del caso competitivo (seed_competitive_doors):
  'puerta-sala-escucha':     { x: 838, y: 440 },  // puerta derecha-abajo → sala de escucha
  'puerta-urgencias':        { x: 122, y: 460 },  // puerta izquierda-abajo → volver a urgencias
  // Decisiones de la sala de escucha (mismas coords de marco que urgencias):
  'psiquiatria-aislada':     { x: 178, y: 268 },  // remisión aislada (riesgosa)
  'mediacion-prohibida':     { x: 806, y: 296 },  // mediación con agresor (prohibida)
  'ruta-vbg':                { x: 168, y: 408 },  // activar ruta VBG junto al sofá
  'tool-ruta':               { x: 318, y: 428 },  // ruta de protección
  'tool-riesgo':             { x: 648, y: 372 },  // medidor de riesgo sobre el escritorio
};

export function authoredMarkerPosition(key: string): { x: number; y: number } | null {
  return AUTHORED_MARKER_POSITIONS[key] ?? null;
}

/**
 * El remapeo anterior pertenece exclusivamente a la sala clínica legacy.
 * Otros renderers autorados (por ejemplo, el caso PDF) ya espejan las
 * coordenadas del backend y deben conservarlas sin traducción.
 */
export function authoredMarkerPositionForMap(
  mapKey: string | null | undefined,
  markerKey: string,
): { x: number; y: number } | null {
  return isAuthoredClinicalRoomKey(mapKey) ? authoredMarkerPosition(markerKey) : null;
}

/**
 * true si el hitbox de PIES del jugador (player-motion.util) toca alguna
 * colisión. (x, y) es el punto de pies — el mismo contrato que el runtime.
 */
export function collidesInAuthoredRoom(x: number, y: number): boolean {
  const hb = playerHitbox(x, y);
  return AUTHORED_CLINICAL_COLLISIONS.some(z => rectsIntersect(hb, z));
}
