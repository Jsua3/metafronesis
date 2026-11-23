import { CASE_ROOM_FURNITURE } from './case-pdf-rooms.geometry';
import { CASE_PDF_ROOM_RENDERERS } from './case-pdf-rooms.renderer';
import { furnitureTextureKey } from './furniture-sprite.util';
import { WORLD_SPRITES, worldSprite } from './world-scale.util';

interface DrawnImage {
  key: string;
  x: number;
  y: number;
  origin: [number, number];
  scaled: boolean;
  displaySize: [number, number] | null;
}

type TextureSize = (textureKey: string) => { width: number; height: number };

/** El PNG mide lo que dice la tabla. */
const exactSize: TextureSize = key => {
  const spec = WORLD_SPRITES.find(entry => furnitureTextureKey(entry.name) === key)!;
  return { width: spec.width, height: spec.height };
};

/** Escena falsa: anota cada imagen (posición, ancla, escala y tamaño forzado). Sin `hasTextures`, la carga de texturas falló. */
function furnitureScene(textureSize: TextureSize, hasTextures = true): { scene: never; images: DrawnImage[] } {
  const images: DrawnImage[] = [];
  const chain: unknown = new Proxy(function noop() { /* cadena */ }, {
    get(_target, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === Symbol.iterator) return function* empty() { /* nada */ };
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && ['x', 'y', 'width', 'height', 'alpha', 'scale', 'displayWidth', 'displayHeight', 'length'].includes(prop)) return 0;
      return chain;
    },
    apply: () => chain,
  });
  const scene = {
    textures: { exists: () => hasTextures },
    add: new Proxy({}, {
      get: (_target, prop) => {
        if (prop !== 'image') return () => chain;
        return (x: number, y: number, key: string) => {
          const drawn: DrawnImage = { key, x, y, origin: [0.5, 0.5], scaled: false, displaySize: null };
          images.push(drawn);
          const image: Record<string, unknown> = {
            ...textureSize(key),
            setOrigin: (ox: number, oy: number) => { drawn.origin = [ox, oy]; return image; },
            setScale: () => { drawn.scaled = true; return image; },
            setDisplaySize: (width: number, height: number) => { drawn.displaySize = [width, height]; return image; },
            setDepth: () => image,
          };
          return image;
        };
      },
    }),
  };
  return { scene: scene as never, images };
}

const OPTIONS = { width: 960, height: 528, reduceMotion: false, ambientTone: 'calm' } as const;

/** Muebles que dibuja cada sala, en orden; el mismo orden que sus huellas de colisión. */
const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  'hospital-urgencias': ['counter', 'waiting_chairs', 'gurney', 'plant'],
  'hospital-sala-escucha': ['sofa', 'coffee_table', 'shelf', 'chair'],
  'comisaria-recepcion': ['counter', 'file_cabinet', 'waiting_chairs'],
  'comisaria-consultorio': ['desk', 'file_cabinet', 'chair', 'chair', 'plant'],
};

const ROOMS = CASE_PDF_ROOM_RENDERERS.map(renderer => [renderer.key.replace('case-pdf-', ''), renderer] as const);

describe('muebles de las salas del caso: escala 1 y tamaño de la tabla (spec §13.1)', () => {
  it.each(ROOMS)('%s dibuja sus muebles a escala 1, anclados por la esquina inferior izquierda', (kind, renderer) => {
    const { scene, images } = furnitureScene(exactSize);
    renderer.render(scene, OPTIONS);
    expect(images.map(image => image.key)).toEqual(EXPECTED[kind].map(furnitureTextureKey));
    for (const image of images) {
      expect(image.scaled).toBe(false);
      expect(image.displaySize).toBeNull();
      expect(image.origin).toEqual([0, 1]);
      expect(Number.isInteger(image.x) && Number.isInteger(image.y)).toBe(true);
    }
  });

  it.each(ROOMS)('%s: cada mueble queda dentro de su huella de colisión y asentado sobre ella', (kind, renderer) => {
    const { scene, images } = furnitureScene(exactSize);
    renderer.render(scene, OPTIONS);
    const footprints = CASE_ROOM_FURNITURE[kind];
    expect(images).toHaveLength(footprints.length);
    images.forEach((image, index) => {
      const footprint = footprints[index];
      const spec = WORLD_SPRITES.find(entry => furnitureTextureKey(entry.name) === image.key)!;
      expect(image.x).toBeGreaterThanOrEqual(footprint.x);
      expect(image.x + spec.width).toBeLessThanOrEqual(footprint.x + footprint.width);
      expect(image.y).toBeGreaterThanOrEqual(footprint.y);
      expect(image.y).toBeLessThanOrEqual(footprint.y + footprint.height + 12);
    });
  });

  it.each(ROOMS)('%s sin texturas (la carga falló) no lanza ni dibuja imágenes: cae al cuerpo vectorial', (_kind, renderer) => {
    const { scene, images } = furnitureScene(exactSize, false);
    expect(() => renderer.render(scene, OPTIONS)).not.toThrow();
    expect(images).toEqual([]);
  });

  it('un PNG con otro tamaño que la tabla (caché vieja tras un despliegue) se fuerza al tamaño de la tabla', () => {
    const sofa = worldSprite('furniture', 'sofa');
    const stale: TextureSize = key => (key === furnitureTextureKey('sofa') ? { width: 146, height: 74 } : exactSize(key));
    const { scene, images } = furnitureScene(stale);
    CASE_PDF_ROOM_RENDERERS.find(renderer => renderer.key === 'case-pdf-hospital-sala-escucha')!.render(scene, OPTIONS);
    expect(images.find(image => image.key === furnitureTextureKey('sofa'))!.displaySize).toEqual([sofa.width, sofa.height]);
    expect(images.filter(image => image.displaySize !== null)).toHaveLength(1);
  });
});
