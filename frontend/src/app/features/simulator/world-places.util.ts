/**
 * Qué ofrece «Ir a…» (plan visual F6-11; VD-19, borrador de Psicología). Pura: sin Phaser ni datos clínicos. Es la
 * misma regla que el hover del ratón (F6-7) en forma de lista: las personas y las puertas de la sala (el jugador las
 * ve en el mapa) y los objetos que YA examinó; nunca evidencia por descubrir, que además ni delata que existe.
 */

export type PlaceKind = 'person' | 'door' | 'object';

/** BORRADOR: texto pendiente de Psicología. La etiqueta de una puerta puede venir como «Pasar a…». */
export function actionForPlace(kind: PlaceKind, label: string): string {
  if (kind === 'person') return `Hablar con ${label}`;
  return /^pasar a(?:\s|l\b)/i.test(label) ? label.replace(/^pasar a/i, 'Ir a') : `Ir a ${label}`;
}

export interface PlaceCandidate {
  /** Clave del marcador o `npc:{clave}` (la misma con la que la escena la reconoce). */
  readonly key: string;
  readonly label: string;
  readonly kind: PlaceKind;
  /** Aviso que acompaña al nombre (p. ej. «persona a atender» en la persona clave de la sala). */
  readonly note?: string;
  /** Es el lugar al que apunta el «Siguiente paso» de la ficha: va primero y lo dice con una etiqueta (P9). */
  readonly siguiente?: boolean;
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

/**
 * La lista de «Ir a…» con el siguiente paso al frente (P9): lo que la ficha del objetivo manda hacer ahora aparece primero
 * y con su etiqueta, para que la ficha y la lista no se contradigan. El siguiente paso ya se nombra en la ficha («Habla con
 * X», «Recoge la herramienta Y»), así que ofrecerlo aquí aunque sea una herramienta sin examinar no delata nada nuevo; lo que
 * sigue sin entrar es cualquier OTRO objeto por descubrir. Sin siguiente paso, o si ya no está en la sala, la lista es la de siempre.
 */
export function selectPlacesWithNext(
  candidates: readonly PlaceCandidate[],
  examined: ReadonlySet<string>,
  nextKey: string | null,
): PlaceCandidate[] {
  const base = selectPlaces(candidates, examined);
  if (nextKey === null) return base;
  const next = base.find(place => place.key === nextKey)
    ?? candidates.find(place => place.key === nextKey && place.label.trim() !== '');
  if (!next) return base;
  const marked: PlaceCandidate = { ...next, label: next.label.trim(), siguiente: true };
  return [marked, ...base.filter(place => place.key !== nextKey)];
}
