/** Tramo vertical de un bloque, en las mismas coordenadas que el borde inferior de la cabecera fija. */
export interface VerticalSpan {
  readonly top: number;
  readonly bottom: number;
}

/** Lo que el ajuste no puede sacar de la vista: un bloque (las primeras opciones) y el borde inferior del panel. */
export interface ScrollGuard {
  readonly protect: VerticalSpan;
  readonly viewBottom: number;
}

/**
 * Cuánto hay que mover el scroll del panel (negativo = hacia arriba) para que ningún bloque de texto quede
 * cortado a medias por la cabecera fija. Un bloque que empieza por encima del borde inferior de la cabecera y
 * termina por debajo está parcialmente tapado; se sube lo que haga falta para que quede entero. Sin bloques
 * cortados no se mueve nada.
 *
 * Con `guard`, el ajuste tiene tope: subir el scroll baja el contenido, y nunca se baja tanto que el bloque
 * protegido (las opciones 1 y 2, TOUCH-01) deje de verse entero. Si no caben juntos, ganan las opciones y el
 * texto se lee con un gesto.
 */
export function scrollShiftToUncoverText(headBottom: number, blocks: readonly VerticalSpan[], guard?: ScrollGuard): number {
  let shift = 0;
  for (const block of blocks) {
    if (block.top < headBottom && block.bottom > headBottom) shift = Math.min(shift, block.top - headBottom);
  }
  if (!guard || shift === 0) return shift;
  const room = Math.max(0, guard.viewBottom - guard.protect.bottom);
  const bounded = Math.max(shift, -room);
  return bounded === 0 ? 0 : bounded;
}
