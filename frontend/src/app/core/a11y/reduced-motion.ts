/** Unica consulta de la preferencia del sistema; el resultado sigue los cambios del navegador. */
export function reducedMotionQuery(): MediaQueryList | null {
  return typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
}
