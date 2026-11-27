/**
 * Giro gradual (diseño «mundo por piezas y caso insignia», sección 6): al
 * recorrer las 8 vistas de un personaje la silueta cambia poco a poco y el
 * punto de apoyo no se mueve. Funciones puras sobre cuadros vestidos
 * (`composeCharacter(..., { keepDressed: true })`); devuelven errores legibles.
 */

import { VIEW_ROWS } from '../../src/app/features/character/kit/kit-engine.ts';

export const GIRO = Object.freeze({
  /**
   * Diferencia máxima de silueta entre dos vistas vecinas (0 = idénticas, 1 = sin nada en común).
   * Calibrada el 2026-11-15 con las 33 recetas, sus variantes y las muestras de cada pieza (121 personajes):
   * el mayor salto medido es 0,327 (del perfil a los tres cuartos de espalda) y se deja 0,03 de holgura.
   */
  maxVecinas: 0.36,
  /** Píxeles que puede correrse el centro de los pies entre dos vistas vecinas (medido: 1,5 como mucho). */
  maxApoyo: 2,
});

/** Cardinal, la diagonal que queda entre medias y la otra cardinal: los cuatro cuartos de la vuelta. */
export const CUARTOS = Object.freeze([
  ['down', 'down-left', 'left'],
  ['left', 'up-left', 'up'],
  ['up', 'up-right', 'right'],
  ['right', 'down-right', 'down'],
]);

/** Pares de vistas vecinas en el giro, cerrando el círculo. */
export function vecinas() {
  return VIEW_ROWS.map((view, i) => [view, VIEW_ROWS[(i + 1) % VIEW_ROWS.length]]);
}

/** Celdas ocupadas en uno solo de los dos cuadros / celdas ocupadas en alguno. */
export function diferenciaDeSilueta(a, b) {
  let distintas = 0;
  let union = 0;
  for (let i = 0; i < a.part.length; i++) {
    const enA = a.part[i] !== null;
    const enB = b.part[i] !== null;
    if (enA || enB) union++;
    if (enA !== enB) distintas++;
  }
  return union === 0 ? 0 : distintas / union;
}

/** Punto de apoyo de un cuadro: centro de los pies (etiquetas o/O) y fila más baja del cuerpo. */
export function apoyo(frame) {
  let minX = Infinity;
  let maxX = -Infinity;
  let base = -1;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const part = frame.part[y * frame.width + x];
      if (part === null) continue;
      base = Math.max(base, y);
      if (part === 'o' || part === 'O') { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    }
  }
  return { centro: (minX + maxX) / 2, base };
}

const pct = n => `${(n * 100).toFixed(1)} %`;

/** La diagonal queda ENTRE sus dos cardinales y ninguna vista salta respecto de su vecina (reposo, cuadro 0). */
export function checkGiro(composed, name) {
  const errors = [];
  const reposo = view => composed.dressed.idle[view][0];
  for (const [a, diagonal, b] of CUARTOS) {
    const total = diferenciaDeSilueta(reposo(a), reposo(b));
    for (const cardinal of [a, b]) {
      const d = diferenciaDeSilueta(reposo(cardinal), reposo(diagonal));
      if (!(d < total)) errors.push(`${name}: ${diagonal} no queda entre ${a} y ${b}: difiere de ${cardinal} en ${pct(d)} y ${a} de ${b} en ${pct(total)}`);
    }
  }
  for (const [a, b] of vecinas()) {
    const d = diferenciaDeSilueta(reposo(a), reposo(b));
    if (d > GIRO.maxVecinas) errors.push(`${name}: la silueta salta ${pct(d)} entre ${a} y ${b}; el máximo entre vecinas es ${pct(GIRO.maxVecinas)}`);
  }
  return errors;
}

/** En reposo todas las vistas pisan la misma fila y el centro de los pies no se corre entre vecinas. */
export function checkApoyo(composed, name) {
  const errors = [];
  const puntos = Object.fromEntries(VIEW_ROWS.map(view => [view, apoyo(composed.dressed.idle[view][0])]));
  const base = puntos[VIEW_ROWS[0]].base;
  for (const view of VIEW_ROWS) {
    if (puntos[view].base !== base) errors.push(`${name}: ${view} pisa en y=${puntos[view].base} y ${VIEW_ROWS[0]} en y=${base}; el apoyo no debe moverse al girar`);
  }
  for (const [a, b] of vecinas()) {
    const salto = Math.abs(puntos[a].centro - puntos[b].centro);
    if (!(salto <= GIRO.maxApoyo)) errors.push(`${name}: el centro de los pies se corre ${salto} px entre ${a} y ${b}; el máximo es ${GIRO.maxApoyo}`);
  }
  return errors;
}
