/**
 * Maniquí — complexión D (alta): la complexión B con 4 px más de altura.
 *
 * No se dibuja a mano: el build la deriva de los cuadros ya etiquetados de B
 * (`scripts/character-kit/derive-complexion.mjs`). Todo lo que queda por
 * encima de las manos (cabeza, torso, pelvis y brazos) sube `lift` px, los
 * pies bajan `drop` px y las piernas se estiran la suma. El movimiento de cada
 * cuadro (`upper` y `bob`) también sube `lift`, así las piezas ancladas a
 * cabeza, cuello, torso y pelvis caen en el mismo sitio que en B y sirven sin
 * cambios. El busto del retrato es el de B.
 *
 * Es la única excepción al contrato de altura (`measure.mjs`): la cabeza queda
 * `lift` px por encima de la de A y los pies pisan `drop` px más abajo. El
 * cuadro sigue siendo de 48×72 y nada toca el borde: el pelo de B llega a la
 * fila 3 y, al caminar, los pies a la 68. Los peinados con volumen arriba
 * (`afro`, `corto-rizado`) tocarían el borde, así que D no los admite. Es
 * solo para recetas fijas (personas reales muy altas): no está en el editor
 * del avatar.
 */
export const COMPLEXION_D = Object.freeze({
  id: 'd',
  derive: Object.freeze({
    from: 'b',
    lift: 2,
    drop: 2,
    /** Última fila de la pierna antes del pie, en B. */
    stretchTo: 62,
  }),
  hairNotSupported: Object.freeze(['afro', 'corto-rizado']),
});
