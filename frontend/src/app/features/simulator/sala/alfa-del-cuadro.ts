import type Phaser from 'phaser';

/** El alfa (0 a 255) del cuadro que muestra un sprite, ya volteado si lo está. null si no tiene imagen. */
export function alfaDelCuadro(sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, voltear = sprite.flipX): { datos: Uint8Array; w: number; h: number } | null {
  const frame = sprite.frame;
  const w = frame?.cutWidth ?? 0, h = frame?.cutHeight ?? 0;
  const fuente = frame?.source?.image as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!w || !h || !fuente) return null;
  const lienzo = document.createElement('canvas');
  lienzo.width = w;
  lienzo.height = h;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(fuente, frame.cutX, frame.cutY, w, h, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const datos = new Uint8Array(w * h);
  for (let f = 0; f < h; f++) {
    for (let col = 0; col < w; col++) datos[f * w + (voltear ? w - 1 - col : col)] = rgba[(f * w + col) * 4 + 3];
  }
  return { datos, w, h };
}
