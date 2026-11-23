/** Estilo CSS de un cuadro del kit a escala entera, en una caja del tamaño exacto (spec §8.3). */
import { CharacterVisual, visualPortrait } from './character-visual.resolver';
import { FRAME, PORTRAIT_FRAME, PortraitState, SHEETS, SheetId, VIEW_ROWS, ViewId } from './kit-engine';
import { sheetSourceUrl } from './kit-raster';

export interface FigureOptions {
  view: ViewId;
  sheet: SheetId;
  col: number;
  scale: number;
  /** Si se da, se dibuja el retrato de ese estado en vez del sprite. */
  portrait: PortraitState | null;
}

/** Nunca fraccionaria ni menor que 1. */
export function integerScale(scale: number): number {
  return Number.isFinite(scale) ? Math.max(1, Math.round(scale)) : 1;
}

export function figureStyle(
  visual: CharacterVisual | null,
  options: FigureOptions,
  urlOf: typeof sheetSourceUrl = sheetSourceUrl,
): Record<string, string> {
  const k = integerScale(options.scale);
  if (options.portrait) {
    const width = `${PORTRAIT_FRAME.width * k}px`;
    const height = `${PORTRAIT_FRAME.height * k}px`;
    const source = visual ? visualPortrait(visual, options.portrait) : null;
    const url = source ? urlOf(source) : null;
    return url ? { width, height, 'background-image': `url("${url}")`, 'background-size': `${width} ${height}` } : { width, height };
  }
  const w = FRAME.width * k;
  const h = FRAME.height * k;
  const size = { width: `${w}px`, height: `${h}px` };
  const url = visual ? urlOf(visual[options.sheet]) : null;
  if (!url) return size;
  return {
    ...size,
    'background-image': `url("${url}")`,
    'background-size': `${SHEETS[options.sheet].frames * w}px ${VIEW_ROWS.length * h}px`,
    'background-position': `${-options.col * w}px ${-VIEW_ROWS.indexOf(options.view) * h}px`,
  };
}
