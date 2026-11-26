/**
 * Maniquí — complexión C (alta): la complexión B con 7 px más de altura.
 *
 * No se dibuja a mano: `scripts/character-kit/kit-agregar.mjs` la deriva de
 * los cuadros ya etiquetados de B. Todo lo que está por encima de `stretchFrom`
 * (cabeza, torso, pelvis, brazos y manos) sube `lift` px, los pies bajan
 * `drop` px y las piernas, de `stretchFrom` a `stretchTo`, se estiran la suma.
 * El pivote no se mueve: sus pies quedan `drop` px más abajo que los de los
 * demás, una diferencia que en la vista cenital apenas se nota. El movimiento
 * de cada cuadro (`upper` y `bob`) también baja `lift`, así las piezas
 * ancladas a cabeza, cuello, torso y pelvis caen en el mismo sitio que en B y
 * sirven sin cambios. El busto del retrato es el de B.
 *
 * Límite: el cuadro sigue siendo de 48×72. El pelo de B llega a la fila 3, así
 * que arriba caben 3 px sin recortar, y bajo los pies de B quedan 4 filas.
 * Los peinados con volumen arriba (`afro`, `corto-rizado`) pierden 1 px en
 * C: por eso C es solo para recetas fijas y no está en el editor del avatar.
 */
export const COMPLEXION_C = Object.freeze({
  id: 'c',
  base: 'b',
  lift: 3,
  /** Filas que bajan los pies, hasta el borde inferior del cuadro (el contorno de la suela cae en la fila 71). */
  drop: 4,
  /** Primera fila bajo las manos en todos los cuadros de B: de aquí hacia abajo solo hay piernas. */
  stretchFrom: 49,
  /** Última fila de la pierna antes del pie. */
  stretchTo: 62,
  /** Peinados que se recortan en C. */
  hairNotSupported: Object.freeze(['afro', 'corto-rizado']),
});
