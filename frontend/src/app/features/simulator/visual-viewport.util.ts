/** Espacio que queda debajo de la ventana visual al aparecer el teclado. */
export function observeVisualViewport(
  viewport: Pick<VisualViewport, 'height' | 'offsetTop' | 'addEventListener' | 'removeEventListener'>,
  layoutHeight: number | (() => number),
  update: (bottom: number) => void,
): () => void {
  const measure = () => update(Math.max(0, (typeof layoutHeight === 'function' ? layoutHeight() : layoutHeight) - viewport.height - viewport.offsetTop));
  viewport.addEventListener('resize', measure);
  viewport.addEventListener('scroll', measure);
  measure();
  return () => {
    viewport.removeEventListener('resize', measure);
    viewport.removeEventListener('scroll', measure);
  };
}
