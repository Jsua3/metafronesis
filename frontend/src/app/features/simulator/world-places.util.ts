/**
 * Qué ofrece «Ir a…» (plan visual F6-11; VD-19, borrador de Psicología). Pura: sin Phaser ni datos clínicos. Es la
 * misma regla que el hover del ratón (F6-7) en forma de lista: las personas y las puertas de la sala (el jugador las
 * ve en el mapa) y los objetos que YA examinó; nunca evidencia por descubrir, que además ni delata que existe.
 */

export type PlaceKind = 'person' | 'door' | 'object';

export interface PlaceCandidate {
  /** Clave del marcador o `npc:{clave}` (la misma con la que la escena la reconoce). */
  readonly key: string;
  readonly label: string;
  readonly kind: PlaceKind;
  /** Aviso que acompaña al nombre (p. ej. «persona a atender» en la persona clave de la sala). */
  readonly note?: string;
}

const GROUP_ORDER: Record<PlaceKind, number> = { person: 0, door: 1, object: 2 };

/**
 * La lista de «Ir a…»: personas, puertas y objetos examinados, en ese orden y conservando el orden dado dentro de
 * cada grupo. Claves repetidas y rótulos vacíos se descartan.
 */
export function selectPlaces(candidates: readonly PlaceCandidate[], examined: ReadonlySet<string>): PlaceCandidate[] {
  const seen = new Set<string>();
  const kept: Array<PlaceCandidate & { index: number }> = [];
  candidates.forEach((candidate, index) => {
    const label = candidate.label.trim();
    if (label === '' || seen.has(candidate.key)) return;
    if (candidate.kind === 'object' && !examined.has(candidate.key)) return;
    seen.add(candidate.key);
    kept.push({ key: candidate.key, label, kind: candidate.kind, ...(candidate.note ? { note: candidate.note } : {}), index });
  });
  kept.sort((a, b) => GROUP_ORDER[a.kind] - GROUP_ORDER[b.kind] || a.index - b.index);
  return kept.map(({ key, label, kind, note }) => ({ key, label, kind, ...(note ? { note } : {}) }));
}
