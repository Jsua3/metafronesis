/** Alcance del cliente para hablar con una persona del escenario. El servidor acepta 60 + 16 de tolerancia. */
export const NPC_INTERACT_RADIUS = 72;
/** Lo más lejos que el servidor acepta una conversación con una persona (radio sembrado 60 + tolerancia 16). */
export const NPC_SERVER_REACH_PX = 76;
/** Alcance del cliente para marcadores (objetos, herramientas, puertas). El servidor acepta 120. */
export const MARKER_INTERACT_RADIUS = 74;
/** A esta distancia un objeto o persona enseña su nombre (máximo destino + 2 más cercanos). */
export const REVEAL_RADIUS = 140;
/** Ventaja de una persona sobre un objeto a igual distancia: una puerta nunca le roba la E. */
export const NPC_BONUS_PX = 18;
/** Una salida solo gana si está claramente más cerca que lo demás. */
export const EXIT_PENALTY_PX = 12;
/** El candidato actual aguanta esta ventaja del rival y estos píxeles fuera de su radio. */
export const HYSTERESIS_PX = 8;

export interface NearbyCandidate {
  /** Clave del marcador o `npc:{clave}` para una persona del escenario. */
  key: string;
  kind: 'marker' | 'npc';
  /** Puerta o salida: pesa en contra a igual distancia. */
  exit: boolean;
  distance: number;
  radius: number;
}

export interface NearbyPick {
  primary: NearbyCandidate | null;
  secondary: NearbyCandidate | null;
}

/** Cuánto aguanta `c` fuera de su radio si ya era el actual; una persona nunca más allá de lo que acepta el servidor. */
function holdPx(c: NearbyCandidate): number {
  return c.kind === 'npc' ? Math.min(HYSTERESIS_PX, Math.max(0, NPC_SERVER_REACH_PX - c.radius)) : HYSTERESIS_PX;
}

function score(c: NearbyCandidate): number {
  return c.distance - (c.kind === 'npc' ? NPC_BONUS_PX : 0) + (c.exit ? EXIT_PENALTY_PX : 0);
}

/** `a` es mejor que `b`: menor puntaje; con puntaje igual, la persona. */
function better(a: NearbyCandidate, b: NearbyCandidate): boolean {
  const diff = score(a) - score(b);
  return diff < 0 || (diff === 0 && a.kind === 'npc' && b.kind !== 'npc');
}

/**
 * Elige qué ofrecer al jugador entre marcadores y personas en rango: una sola pasada, sin ordenar ni
 * copiar la lista (se llama por cuadro). El candidato actual aguanta `HYSTERESIS_PX` fuera de su radio
 * (una persona, solo hasta lo que acepta el servidor) y solo cede ante un rival que lo mejora por más de
 * `HYSTERESIS_PX`: la barra no parpadea entre dos objetos a distancias parecidas. Con `out` reutiliza el
 * resultado (la escena lo llama por cuadro).
 */
export function pickNearby(
  candidates: readonly NearbyCandidate[],
  currentKey: string | null,
  out: NearbyPick = { primary: null, secondary: null },
): NearbyPick {
  let primary: NearbyCandidate | null = null;
  let secondary: NearbyCandidate | null = null;
  let current: NearbyCandidate | null = null;
  for (const c of candidates) {
    const isCurrent = currentKey !== null && c.key === currentKey;
    if (c.distance > c.radius + (isCurrent ? holdPx(c) : 0)) continue;
    if (isCurrent) current = c;
    if (primary === null || better(c, primary)) {
      secondary = primary;
      primary = c;
    } else if (secondary === null || better(c, secondary)) {
      secondary = c;
    }
  }
  if (current !== null && primary !== null && primary !== current && score(primary) + HYSTERESIS_PX > score(current)) {
    // El actual sigue; el mejor de todos pasa a secundario (era el mejor del resto).
    secondary = primary;
    primary = current;
  }
  out.primary = primary;
  out.secondary = secondary;
  return out;
}

/**
 * Qué rótulos se ven ahora: el destino del proceso (si existe en la sala), el candidato principal y,
 * entre los demás, los más cercanos dentro de `REVEAL_RADIUS`, hasta `maxExtra` (1 o 2) además del
 * destino; el principal cuenta dentro de ese tope. Igual para todos los objetos y personas: la
 * distancia decide, nunca el tipo ni nada clínico. Un objeto atenuado (`dimmed`) solo se revela dentro
 * de su propio radio de interacción. Escribe en `out` (se vacía antes) y no asigna nada: se llama por cuadro.
 */
export function selectRevealed(
  candidates: readonly NearbyCandidate[],
  targetKey: string | null,
  primaryKey: string | null,
  dimmed: ReadonlySet<string>,
  maxExtra: number,
  out: string[],
): string[] {
  out.length = 0;
  let hasTarget = false;
  let hasPrimary = false;
  for (const c of candidates) {
    if (targetKey !== null && c.key === targetKey) hasTarget = true;
    if (primaryKey !== null && c.key === primaryKey) hasPrimary = true;
  }
  if (hasTarget) out.push(targetKey as string);
  let slots = Math.min(2, Math.max(0, maxExtra));
  if (hasPrimary && primaryKey !== targetKey && slots > 0) {
    out.push(primaryKey as string);
    slots -= 1;
  }
  if (slots === 0) return out;
  // Las dos más cercanas del resto, con dos ranuras escalares (sin ordenar ni copiar la lista).
  let k1: string | null = null;
  let d1 = Infinity;
  let k2: string | null = null;
  let d2 = Infinity;
  for (const c of candidates) {
    if (c.key === targetKey || c.key === primaryKey) continue;
    if (c.distance > (dimmed.has(c.key) ? c.radius : REVEAL_RADIUS)) continue;
    if (c.distance < d1) { k2 = k1; d2 = d1; k1 = c.key; d1 = c.distance; }
    else if (c.distance < d2) { k2 = c.key; d2 = c.distance; }
  }
  if (k1 !== null) out.push(k1);
  if (slots === 2 && k2 !== null) out.push(k2);
  return out;
}

/** Tipo base de los rótulos del mundo (px de canvas) y tamaño mínimo que se quiere ver en pantalla. */
export const LABEL_BASE_FONT_PX = 11;
export const LABEL_MIN_SCREEN_PX = 12;
/** Ancho máximo de un rótulo en píxeles de pantalla. */
export const LABEL_MAX_SCREEN_WIDTH_PX = 168;

/**
 * Escala de un rótulo para medir al menos `LABEL_MIN_SCREEN_PX` de pantalla: el canvas de 960x540 se
 * encoge (a 844x390 la escala de pantalla es 0,49) y un texto de 11 px de canvas quedaría de 5 px.
 * `displayScale` = px de canvas por px de pantalla (`scale.displayScale.x`); `zoom` = zoom de la cámara.
 */
export function labelScaleFor(displayScale: number, zoom: number, fontPx: number = LABEL_BASE_FONT_PX): number {
  if (!(displayScale > 0) || !(zoom > 0) || !(fontPx > 0)) return 1;
  return Math.max(1, (LABEL_MIN_SCREEN_PX * displayScale) / (zoom * fontPx));
}
