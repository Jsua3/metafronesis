/**
 * Cuánto tapa la interfaz el lienzo desde abajo (bloque M1): el alto real, en vivo, del cuadro de diálogo MÁS todo lo
 * que se le monta encima (el aviso «Puedes conocer más…», la ficha «Decisión», «Volver al mapa», «Ver pista»…), que
 * se dibuja por fuera de la caja del propio cuadro. Puro: recibe los rectángulos ya medidos.
 */
export interface Caja { top: number; bottom: number; width: number; height: number }

/** Del borde superior más alto de lo visible hasta el borde inferior del lienzo (px, redondeado); 0 si no hay nada. */
export function altoTapado(bordeInferior: number, cajas: readonly Caja[]): number {
  const visibles = cajas.filter(c => c.width > 1 && c.height > 1 && c.top < bordeInferior);
  if (visibles.length === 0) return 0;
  return Math.max(0, Math.round(bordeInferior - Math.min(...visibles.map(c => c.top))));
}
