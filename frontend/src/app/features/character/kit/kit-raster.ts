/** RgbaImage del motor → lienzo (Phaser) o data URL (CSS). Sin contexto 2D, null. */
import type { SheetSource } from './character-visual.resolver';
import type { RgbaImage } from './kit-engine';

export function rgbaToCanvas(
  image: RgbaImage,
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined,
): HTMLCanvasElement | null {
  if (!doc) return null;
  const canvas = doc.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const data = context.createImageData(image.width, image.height);
  data.data.set(image.rgba);
  context.putImageData(data, 0, 0);
  return canvas;
}

const dataUrls = new WeakMap<RgbaImage, string>();

/** URL que puede usar el CSS: la del PNG publicado, o la data URL (cacheada) de la hoja compuesta. */
export function sheetSourceUrl(source: SheetSource): string | null {
  if (source.kind === 'url') return source.url;
  const cached = dataUrls.get(source.image);
  if (cached) return cached;
  const canvas = rgbaToCanvas(source.image);
  if (!canvas) return null;
  const url = canvas.toDataURL('image/png');
  dataUrls.set(source.image, url);
  return url;
}
