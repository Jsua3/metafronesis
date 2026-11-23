/**
 * Viñeta del mundo como UNA textura de lienzo (plan visual F6-8). La banda de siempre —opacidad `edgeAlpha` en el borde
 * que cae al cuadrado hacia dentro— se pinta una sola vez por tamaño en un lienzo 2D y la escena la dibuja como una
 * imagen: antes eran decenas de `strokeRect` de un `Graphics` (la banda de tono y la de crisis) rehechos con cada
 * re-render. Se ve igual con `Phaser.CANVAS` y con WebGL: una textura de lienzo es lo mismo en los dos. Sin Phaser.
 */

export interface VignetteSpec {
  /** Tamaño del rectángulo que la cámara muestra (px de mundo, enteros). */
  readonly width: number;
  readonly height: number;
  /** Color 0xRRGGBB. */
  readonly tint: number;
  /** Grosor de la banda como proporción del lado corto. */
  readonly bandRatio: number;
  /** Opacidad en el borde (cae al cuadrado hacia dentro). */
  readonly edgeAlpha: number;
}

export interface VignetteBand {
  /** Cuántos píxeles hacia dentro del borde. */
  readonly inset: number;
  readonly alpha: number;
}

/** Las bandas de la viñeta: una por píxel de grosor y opacidad `edgeAlpha × (1 − i/n)²`. */
export function vignetteBands(width: number, height: number, bandRatio: number, edgeAlpha: number): VignetteBand[] {
  if (!(width > 0) || !(height > 0) || !(bandRatio > 0)) return [];
  const count = Math.round(Math.min(width, height) * bandRatio);
  const bands: VignetteBand[] = [];
  for (let i = 0; i < count; i += 1) bands.push({ inset: i, alpha: edgeAlpha * (1 - i / count) ** 2 });
  return bands;
}

/** Clave estable de la textura: tinte, tamaño y forma. Un tamaño nuevo es otra textura. */
export function vignetteTextureKey(spec: VignetteSpec): string {
  const { width, height, tint, bandRatio, edgeAlpha } = spec;
  return `vignette-${tint.toString(16).padStart(6, '0')}-${width}x${height}-${bandRatio}-${edgeAlpha}`;
}

/** Lo único que el pintado pide de un contexto 2D (así se prueba con uno de mentira). */
export interface VignetteContext {
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  clearRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
}

/** Pinta las bandas en un contexto 2D de `spec.width × spec.height`: un marco de 1 px por banda, cada vez más dentro. */
export function paintVignette(ctx: VignetteContext, spec: VignetteSpec): void {
  const { width, height, tint, bandRatio, edgeAlpha } = spec;
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1;
  const r = (tint >> 16) & 0xff;
  const g = (tint >> 8) & 0xff;
  const b = tint & 0xff;
  for (const { inset, alpha } of vignetteBands(width, height, bandRatio, edgeAlpha)) {
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
    // Un trazo de 1 px cae a caballo entre dos filas salvo que esté a medio píxel: así cubre justo la fila y la columna.
    ctx.strokeRect(inset + 0.5, inset + 0.5, width - inset * 2 - 1, height - inset * 2 - 1);
  }
}
