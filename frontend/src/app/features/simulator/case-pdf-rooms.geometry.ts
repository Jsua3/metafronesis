/**
 * Geometría JUGABLE de las salas del caso PDF (Violencia Familiar y Tentativa
 * de Feminicidio): colisiones AABB por sala, espejo 1:1 de los muebles del
 * seed backend (seed_caso_pdf.FURNITURE) y de lo que pinta
 * case-pdf-rooms.renderer. Si se mueve un mueble en el renderer hay que
 * moverlo aquí Y en el seed.
 *
 * Todas las salas comparten el lienzo 960×528 de la sala autoría (mismas
 * bandas de pared), así el contrato de pies/colisión del jugador no cambia.
 */
import {
  AUTHORED_ROOM_HEIGHT,
  AUTHORED_ROOM_WIDTH,
  RoomRect,
} from './authored-clinical-room.util';
import { playerHitbox, rectsIntersect } from './player-motion.util';

/** Bandas de pared compartidas (zona caminable: x 96-864, y 236-486). */
const WALL_BANDS: readonly RoomRect[] = [
  { x: 0, y: 0, width: AUTHORED_ROOM_WIDTH, height: 236 },
  { x: 0, y: 486, width: AUTHORED_ROOM_WIDTH, height: 60 },
  { x: 0, y: 0, width: 96, height: AUTHORED_ROOM_HEIGHT },
  { x: 864, y: 0, width: 96, height: AUTHORED_ROOM_HEIGHT },
];

/** Muebles por tipo de sala (espejo del seed backend). */
export const CASE_ROOM_FURNITURE: Readonly<Record<string, readonly RoomRect[]>> = {
  'hospital-urgencias': [
    { x: 380, y: 252, width: 220, height: 56 },  // mostrador de triage
    { x: 120, y: 308, width: 150, height: 38 },  // sillas de espera
    { x: 700, y: 300, width: 110, height: 46 },  // camilla
    { x: 800, y: 380, width: 44, height: 40 },   // planta
  ],
  'hospital-sala-escucha': [
    { x: 130, y: 300, width: 130, height: 64 },  // sofá de escucha
    { x: 280, y: 370, width: 90, height: 36 },   // mesa de centro
    { x: 600, y: 256, width: 150, height: 44 },  // estante de protocolos
    { x: 680, y: 330, width: 56, height: 36 },   // silla profesional
  ],
  'comisaria-recepcion': [
    { x: 380, y: 252, width: 220, height: 56 },  // mostrador de recepción
    { x: 700, y: 250, width: 130, height: 46 },  // archivadores
    { x: 120, y: 308, width: 150, height: 38 },  // sillas de espera
  ],
  'comisaria-consultorio': [
    { x: 430, y: 268, width: 200, height: 60 },  // escritorio
    { x: 760, y: 254, width: 90, height: 44 },   // archivador
    { x: 380, y: 352, width: 44, height: 32 },   // silla izquierda
    { x: 560, y: 352, width: 44, height: 32 },   // silla derecha
    { x: 110, y: 380, width: 44, height: 40 },   // planta
  ],
};

/** Tipo de sala visual a partir del map_key (las copias por etapa comparten sala). */
export function caseRoomKind(mapKey: string | null | undefined): string | null {
  if (!mapKey) return null;
  if (mapKey === 'hospital-urgencias') return 'hospital-urgencias';
  if (mapKey.startsWith('hospital-sala-escucha')) return 'hospital-sala-escucha';
  if (mapKey === 'comisaria-recepcion') return 'comisaria-recepcion';
  if (mapKey.startsWith('comisaria-consultorio')) return 'comisaria-consultorio';
  return null;
}

/** Colisiones completas (paredes + muebles) de una sala del caso PDF, o null. */
export function caseRoomCollisions(mapKey: string | null | undefined): readonly RoomRect[] | null {
  const kind = caseRoomKind(mapKey);
  if (!kind) return null;
  return [...WALL_BANDS, ...CASE_ROOM_FURNITURE[kind]];
}

/**
 * true si el hitbox de PIES del jugador en (x, y) choca en esa sala — mismo
 * contrato que collidesInAuthoredRoom (specs de markers/NPCs/puertas).
 */
export function collidesInCaseRoom(mapKey: string, x: number, y: number): boolean {
  const zones = caseRoomCollisions(mapKey);
  if (!zones) return false;
  const hb = playerHitbox(x, y);
  return zones.some(zone => rectsIntersect(hb, zone));
}
