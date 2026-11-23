import { ADDED_TO_SCENE_EVENT, PIXEL_VERTEX_ROUND_MODE, PixelRender, TEXTURE_FILTER_LINEAR, textResolutionFor } from './pixel-render';

/**
 * PHA-1 (plan visual F0-7; REGLA-009): en Phaser 4 `roundPixels` solo redondea objetos cuya matriz final es
 * una traslación pura (`vertexRoundMode` 'safeAuto'); el zoom de cámara 2 o 3 entra en esa matriz, así que
 * con zoom ≥ 2 nada se redondeaba y los sprites «nadaban» al seguir la cámara. PixelRender pone 'fullAuto'
 * en todos los objetos de la escena (no hay rotaciones en el juego).
 */
// req: REGLA-009

type Listener = (obj: unknown) => void;

class FakeObject {
  vertexRoundMode = 'safeAuto';
  setVertexRoundMode(mode: string) { this.vertexRoundMode = mode; return this; }
}

class FakeContainer extends FakeObject {
  constructor(public list: unknown[] = []) { super(); }
}

function fakeScene(initial: unknown[] = []) {
  const listeners = new Map<string, Set<Listener>>();
  return {
    children: { list: initial },
    events: {
      on(event: string, fn: Listener) { (listeners.get(event) ?? listeners.set(event, new Set()).get(event)!).add(fn); return this; },
      off(event: string, fn: Listener) { listeners.get(event)?.delete(fn); return this; },
    },
    emit(event: string, obj: unknown) { listeners.get(event)?.forEach(fn => fn(obj)); },
    listenerCount(event: string) { return listeners.get(event)?.size ?? 0; },
  };
}

describe('PixelRender: vértices al píxel con zoom de cámara (PHA-1)', () => {
  it('usa el modo que redondea aunque la cámara escale', () => {
    expect(PIXEL_VERTEX_ROUND_MODE).toBe('fullAuto');
    expect(ADDED_TO_SCENE_EVENT).toBe('addedtoscene');
  });

  it('aplica el modo a los objetos que ya están en la escena', () => {
    const sprite = new FakeObject();
    const scene = fakeScene([sprite]);
    new PixelRender(scene).attach();
    expect(sprite.vertexRoundMode).toBe('fullAuto');
  });

  it('aplica el modo a lo que se añade después', () => {
    const scene = fakeScene();
    new PixelRender(scene).attach();
    const later = new FakeObject();
    scene.emit(ADDED_TO_SCENE_EVENT, later);
    expect(later.vertexRoundMode).toBe('fullAuto');
  });

  it('propaga el modo a los hijos de un contenedor (también anidados)', () => {
    const inner = new FakeObject();
    const nested = new FakeContainer([inner]);
    const child = new FakeObject();
    const scene = fakeScene([new FakeContainer([child, nested])]);
    new PixelRender(scene).attach();
    expect(child.vertexRoundMode).toBe('fullAuto');
    expect(inner.vertexRoundMode).toBe('fullAuto');
  });

  it('ignora objetos sin setVertexRoundMode (p. ej. grupos) sin fallar', () => {
    const scene = fakeScene([{ type: 'Group' }]);
    expect(() => new PixelRender(scene).attach()).not.toThrow();
  });

  it('detach suelta el oyente de la escena', () => {
    const scene = fakeScene();
    const render = new PixelRender(scene).attach();
    expect(scene.listenerCount(ADDED_TO_SCENE_EVENT)).toBe(1);
    render.detach();
    expect(scene.listenerCount(ADDED_TO_SCENE_EVENT)).toBe(0);
  });
});

/**
 * PHA-2 (plan visual F0-8; REGLA-009): los rótulos de 11 px se dibujan en su propio lienzo y se agrandan con
 * el zoom de cámara y su propia escala; con `pixelArt` se ampliaban por vecino más cercano y se veían en
 * bloques. La resolución del texto sigue a escala × zoom y su textura se filtra en lineal (el texto no es
 * pixel art).
 */
describe('PixelRender: rótulos nítidos con zoom (PHA-2)', () => {
  class FakeText extends FakeObject {
    readonly type = 'Text';
    style = { resolution: 0 };
    scaleX = 1;
    setResolution = vi.fn((value: number) => { this.style.resolution = value; return this; });
    texture = { setFilter: vi.fn() };
  }

  it('textResolutionFor cubre escala × zoom en píxeles enteros, entre 1 y 4', () => {
    expect(textResolutionFor(1, 1)).toBe(1);
    expect(textResolutionFor(1, 2)).toBe(2);
    expect(textResolutionFor(1, 3)).toBe(3);
    expect(textResolutionFor(2.39, 1)).toBe(3);
    expect(textResolutionFor(1, 6)).toBe(4);
    expect(textResolutionFor(0, 2)).toBe(1);
    expect(textResolutionFor(Number.NaN, 2)).toBe(1);
  });

  it('refreshTexts sube la resolución de cada texto según su escala y el zoom, con filtro lineal', () => {
    const plain = new FakeText();
    const scaled = new FakeText();
    scaled.scaleX = 2.39;
    const scene = fakeScene([plain, scaled, new FakeObject()]);
    const render = new PixelRender(scene).attach();
    expect(render.refreshTexts(2)).toBe(2);
    expect(plain.setResolution).toHaveBeenLastCalledWith(2);
    expect(scaled.setResolution).toHaveBeenLastCalledWith(4);
    expect(plain.texture.setFilter).toHaveBeenCalledWith(TEXTURE_FILTER_LINEAR);
  });

  it('no vuelve a pintar un texto cuya resolución ya es la correcta', () => {
    const text = new FakeText();
    const render = new PixelRender(fakeScene([text])).attach();
    render.refreshTexts(3);
    expect(render.refreshTexts(3)).toBe(0);
    expect(text.setResolution).toHaveBeenCalledTimes(1);
  });

  it('un texto añadido después nace con la resolución del último zoom conocido', () => {
    const scene = fakeScene();
    const render = new PixelRender(scene).attach();
    render.refreshTexts(3);
    const later = new FakeText();
    scene.emit(ADDED_TO_SCENE_EVENT, later);
    expect(later.setResolution).toHaveBeenCalledWith(3);
  });

  it('el filtro lineal sobrevive a cualquier repintado del texto (setText, ajuste de línea…)', () => {
    // Phaser re-sube el lienzo del texto en cada updateText() con NEAREST (pixelArt): se pierde el lineal.
    class RepaintingText extends FakeText {
      filter = 1;
      override texture = { setFilter: vi.fn((mode: number) => { this.filter = mode; }) };
      updateText() { this.filter = 1; return this; }
    }
    const text = new RepaintingText();
    const render = new PixelRender(fakeScene([text])).attach();
    render.refreshTexts(2);
    expect(text.filter).toBe(TEXTURE_FILTER_LINEAR);
    text.updateText(); // p. ej. setWordWrapWidth() al reescalar los rótulos, con la misma resolución
    expect(text.filter).toBe(TEXTURE_FILTER_LINEAR);
  });

  it('un texto dentro de un contenedor escalado usa la escala acumulada (pistas de puerta)', () => {
    const inner = new FakeText();
    const container = Object.assign(new FakeContainer([inner]), { scaleX: 2.39 });
    const render = new PixelRender(fakeScene([container])).attach();
    render.refreshTexts(1);
    expect(inner.setResolution).toHaveBeenLastCalledWith(3);
  });

  it('encuentra los textos dentro de contenedores', () => {
    const inner = new FakeText();
    const render = new PixelRender(fakeScene([new FakeContainer([inner])])).attach();
    render.refreshTexts(2);
    expect(inner.setResolution).toHaveBeenCalledWith(2);
  });
});
