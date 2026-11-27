/** Rectángulo de un control visible, en píxeles CSS de la ventana. */
export interface MobileBox { x: number; y: number; width: number; height: number }

/** Fracción del alto que ocupan las proyecciones verticales, sin contar dos veces las franjas compartidas. */
export function coberturaVertical(boxes: readonly MobileBox[], height: number): number {
  if (height <= 0) return 0;
  const intervals = boxes.filter(box => box.width > 0 && box.height > 0)
    .map(box => [Math.max(0, box.y), Math.min(height, box.y + box.height)] as const)
    .filter(([top, bottom]) => bottom > top).sort((a, b) => a[0] - b[0]);
  let total = 0, end = 0;
  for (const [top, bottom] of intervals) {
    total += Math.max(0, bottom - Math.max(top, end));
    end = Math.max(end, bottom);
  }
  return total / height;
}

/** Intersección con área positiva: dos bordes que se tocan no se pisan. */
export function seSolapan(a: MobileBox, b: MobileBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
