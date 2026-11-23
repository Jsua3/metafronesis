/**
 * Nitidez del pixel art con zoom de cámara entero (plan visual F0-7, PHA-1; REGLA-009).
 *
 * En Phaser 4 `roundPixels` ya no basta: con el `vertexRoundMode` por defecto ('safeAuto') el renderer
 * solo redondea los vértices de un objeto si su matriz final es una traslación pura
 * (`renderer/webgl/renderNodes/transformer/TransformerImage.js`), y el zoom 2 o 3 de la cámara entra en
 * esa matriz: con zoom ≥ 2 nada se redondeaba y los sprites «nadaban» entre píxeles al moverse.
 * 'fullAuto' redondea siempre que la cámara tenga `roundPixels`. Las escenas no rotan objetos, así que el
 * redondeo completo no deforma nada.
 *
 * No importa Phaser: trabaja con la forma mínima de la escena para poder probarse en jsdom.
 */
export const PIXEL_VERTEX_ROUND_MODE = 'fullAuto';
/** `Phaser.Scenes.Events.ADDED_TO_SCENE`. */
export const ADDED_TO_SCENE_EVENT = 'addedtoscene';

/** `Phaser.Textures.FilterMode.LINEAR`: el texto se minimiza suavizado (no es pixel art). */
export const TEXTURE_FILTER_LINEAR = 0;
const MAX_TEXT_RESOLUTION = 4;

/**
 * Resolución del lienzo de un texto (PHA-2, F0-8): cubre su escala × el zoom de cámara con píxeles enteros,
 * para que el rótulo se dibuje a su tamaño real en pantalla en vez de agrandarse por vecino más cercano.
 * Entre 1 y 4 (la memoria de textura crece con el cuadrado).
 */
export function textResolutionFor(textScale: number, zoom: number): number {
  const needed = Math.ceil(Math.abs(textScale) * zoom - 1e-6);
  return Number.isFinite(needed) ? Math.min(MAX_TEXT_RESOLUTION, Math.max(1, needed)) : 1;
}

type Listener = (gameObject: unknown) => void;

export interface PixelRenderScene {
  events: { on(event: string, fn: Listener): unknown; off(event: string, fn: Listener): unknown };
  children: { list: unknown[] };
}

interface RoundableObject { setVertexRoundMode(mode: string): unknown; list?: unknown[] }

interface TextObject {
  type: 'Text';
  scaleX: number;
  style: { resolution: number };
  setResolution(value: number): unknown;
  updateText?(): unknown;
  texture?: { setFilter?(mode: number): unknown };
}

const isRoundable = (value: unknown): value is RoundableObject =>
  typeof (value as RoundableObject | null)?.setVertexRoundMode === 'function';

const isText = (value: unknown): value is TextObject =>
  (value as TextObject | null)?.type === 'Text' && typeof (value as TextObject).setResolution === 'function';

export class PixelRender {
  private readonly onAdded: Listener = gameObject => {
    this.snap(gameObject);
    this.forEachText([gameObject], (text, scale) => {
      this.keepSmooth(text);
      if (this.zoom !== null) this.applyResolution(text, scale);
    });
  };
  /** Último zoom de cámara conocido (null hasta el primer `refreshTexts`). */
  private zoom: number | null = null;
  /** Textos cuyo `updateText` ya repone el filtro lineal. */
  private readonly smoothed = new WeakSet<object>();

  constructor(private readonly scene: PixelRenderScene) {}

  /** Aplica el redondeo a todo lo que ya está en la escena y a todo lo que se añada después. */
  attach(): this {
    this.scene.children.list.forEach(gameObject => this.snap(gameObject));
    this.forEachText(this.scene.children.list, text => this.keepSmooth(text));
    this.scene.events.on(ADDED_TO_SCENE_EVENT, this.onAdded);
    return this;
  }

  detach(): void {
    this.scene.events.off(ADDED_TO_SCENE_EVENT, this.onAdded);
  }

  /**
   * Ajusta la resolución de todos los textos al zoom de cámara y a su escala en pantalla (la propia por la de
   * sus contenedores). Se llama al cambiar el zoom o la escala de los rótulos (nunca por cuadro); solo
   * repinta los que cambian. Devuelve cuántos.
   */
  refreshTexts(zoom: number): number {
    this.zoom = zoom;
    let changed = 0;
    this.forEachText(this.scene.children.list, (text, scale) => {
      this.keepSmooth(text);
      if (this.applyResolution(text, scale)) changed++;
    });
    return changed;
  }

  private applyResolution(text: TextObject, scale: number): boolean {
    const resolution = textResolutionFor(scale, this.zoom ?? 1);
    if (text.style.resolution === resolution) return false;
    text.setResolution(resolution);
    return true;
  }

  /**
   * Phaser re-sube el lienzo del texto en cada `updateText()` (setText, ajuste de línea, resolución) y, con
   * `pixelArt`, lo hace con filtro NEAREST: se envuelve una vez para reponer el lineal tras cada repintado.
   */
  private keepSmooth(text: TextObject): void {
    if (this.smoothed.has(text)) return;
    this.smoothed.add(text);
    const original = text.updateText?.bind(text);
    if (original) {
      text.updateText = () => {
        const result = original();
        text.texture?.setFilter?.(TEXTURE_FILTER_LINEAR);
        return result;
      };
    }
    text.texture?.setFilter?.(TEXTURE_FILTER_LINEAR);
  }

  private forEachText(objects: unknown[], visit: (text: TextObject, scale: number) => void, parentScale = 1): void {
    for (const gameObject of objects) {
      const ownScale = Math.abs((gameObject as { scaleX?: number } | null)?.scaleX ?? 1);
      if (isText(gameObject)) visit(gameObject, parentScale * ownScale);
      const children = (gameObject as { list?: unknown[] } | null)?.list;
      if (Array.isArray(children)) this.forEachText(children, visit, parentScale * ownScale);
    }
  }

  private snap(gameObject: unknown): void {
    if (!isRoundable(gameObject)) return;
    gameObject.setVertexRoundMode(PIXEL_VERTEX_ROUND_MODE);
    // Los hijos de un contenedor se dibujan con la matriz del contenedor: también se redondean.
    gameObject.list?.forEach(child => this.snap(child));
  }
}
