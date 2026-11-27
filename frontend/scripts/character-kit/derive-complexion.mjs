/**
 * Complexiones derivadas (p. ej. D, la alta): se calculan desde los cuadros ya
 * etiquetados de otra complexión en vez de dibujarse. Puro y determinista.
 */
import { FRAME, decodeRle, encodeRle } from '../../src/app/features/character/kit/kit-engine.ts';

const ARM_LABELS = new Set(['a', 'b', 'c', 'A', 'B', 'C']);

/** Primera fila sin brazos ni manos en ningún cuadro: de ahí hacia abajo solo hay piernas. */
export function firstLegOnlyRow(views) {
  let row = 0;
  for (const view of Object.values(views)) {
    for (const frame of [...view.idle, ...view.walk]) {
      const labels = decodeRle(frame.labels);
      for (let i = 0; i < labels.length; i++) if (ARM_LABELS.has(labels[i])) row = Math.max(row, Math.floor(i / FRAME.width) + 1);
    }
  }
  return row;
}

/** Un cuadro codificado, más alto: sube lo de arriba `lift` px, baja los pies `drop` px y estira las piernas. */
export function stretchFrame(encoded, { lift, drop, stretchFrom, stretchTo }) {
  const { width: W, height: H } = FRAME;
  const labels = decodeRle(encoded.labels);
  const span = stretchTo + 1 - stretchFrom;
  const rows = [];
  for (let y = 0; y < H; y++) {
    let src;
    if (y < stretchFrom - lift) src = y + lift;
    else if (y <= stretchTo + drop) src = stretchFrom + Math.floor((y - (stretchFrom - lift)) * span / (span + lift + drop));
    else src = y - drop;
    rows.push(src >= 0 && src < H ? labels.slice(src * W, src * W + W) : '.'.repeat(W));
  }
  return {
    labels: encodeRle(rows.join('')),
    motion: { ...encoded.motion, upper: encoded.motion.upper - lift, bob: encoded.motion.bob - lift },
  };
}

/** Vistas de una complexión derivada a partir de las vistas (codificadas) de su base. */
export function deriveComplexion(baseViews, spec) {
  const stretchFrom = firstLegOnlyRow(baseViews);
  if (stretchFrom > spec.stretchTo) throw new Error(`complexión derivada: los brazos bajan hasta la fila ${stretchFrom}, debajo de las piernas`);
  const full = { ...spec, stretchFrom };
  return Object.fromEntries(Object.entries(baseViews).map(([view, v]) => [view, {
    kind: v.kind,
    idle: v.idle.map(f => stretchFrame(f, full)),
    walk: v.walk.map(f => stretchFrame(f, full)),
  }]));
}

/** Cuánto se sale una complexión del contrato de altura: `{ lift, drop }` (0 y 0 si no es derivada). */
export function statureOf(def) {
  return { lift: def?.derive?.lift ?? 0, drop: def?.derive?.drop ?? 0 };
}
