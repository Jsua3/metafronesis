import { CASE_PDF_ROOM_RENDERERS } from './case-pdf-rooms.renderer';
import { furnitureTextureKey } from './furniture-sprite.util';
import { premiumClinicalRoomRenderer } from './premium-clinical-room.renderer';
import { GAMEPLAY_ONLY_LAYERS, PREMIUM_RENDERER_LAYERS, SceneRenderer, SceneRendererOptions } from './scene-layer.types';
import { registeredSceneRendererKeys } from './scene-renderer.registry';
import { WORLD_SPRITES } from './world-scale.util';

/**
 * L-01 · Principio de sustitución de Liskov (SOLID) sobre los renderers de salas.
 *
 * `game-world` le pide al registro «el renderer de este mapa» y lo usa sin saber cuál es. Eso solo
 * es seguro si **todos** cumplen el contrato de `SceneRenderer`, no solo el que se probó primero.
 * Esta prueba recorre los renderers registrados con una escena falsa y comprueba lo que el
 * contrato promete: la clave, `supports`, la metadata, las capas, y que sin movimiento no haya
 * tweens. Lo propio de cada sala (qué mueble va dónde) lo fija el maestro dorado de
 * `scene-renderers.draw-calls.spec.ts`.
 */

const RENDERERS: readonly SceneRenderer[] = [premiumClinicalRoomRenderer, ...CASE_PDF_ROOM_RENDERERS];
const OPTIONS: SceneRendererOptions = { width: 960, height: 528, reduceMotion: false, ambientTone: 'calm' };

const exactSize = (key: string) => {
  const spec = WORLD_SPRITES.find(entry => furnitureTextureKey(entry.name) === key);
  return { width: spec?.width ?? 16, height: spec?.height ?? 16 };
};

/** Escena falsa mínima: crea objetos que aceptan cualquier llamada y anota los tweens. */
function fakeScene(hasTextures: boolean): { scene: never; tweens: unknown[]; created: number } {
  const state = { tweens: [] as unknown[], created: 0 };
  const make = (size?: { width: number; height: number }) => {
    state.created++;
    const dims: Record<string, number> = size ?? { width: 0, height: 0 };
    const proxy: unknown = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then' || prop === 'toJSON') return undefined;
        if (prop === Symbol.toPrimitive) return () => 0;
        if (typeof prop === 'string' && prop in dims) return dims[prop];
        return () => proxy;
      },
    });
    return proxy;
  };
  const scene = {
    textures: { exists: () => hasTextures },
    tweens: { add: (config: unknown) => { state.tweens.push(config); return {}; } },
    add: new Proxy({}, {
      get: (_target, kind) => (...args: unknown[]) => make(kind === 'image' ? exactSize(String(args[2])) : undefined),
    }),
  };
  return {
    scene: scene as never,
    get tweens() { return state.tweens; },
    get created() { return state.created; },
  };
}

describe('L-01 · cada renderer de sala registrado cumple el contrato de SceneRenderer', () => {
  it('la lista que se prueba es exactamente la que el registro resuelve', () => {
    // Si alguien registra un renderer nuevo y no lo suma a RENDERERS, esta prueba lo avisa.
    expect(registeredSceneRendererKeys()).toEqual(RENDERERS.map(renderer => renderer.key));
  });

  it('las claves son textos no vacíos y no se repiten', () => {
    const keys = RENDERERS.map(renderer => renderer.key);

    for (const key of keys) {
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  describe.each(RENDERERS.map(renderer => [renderer.key, renderer] as const))('%s', (_key, renderer) => {
    it('no soporta mapas vacíos ni desconocidos', () => {
      for (const mapKey of [null, undefined, '', 'mapa-que-no-existe', '   ']) {
        expect(renderer.supports(mapKey), String(mapKey)).toBe(false);
      }
    });

    it.each([true, false])('pinta sin lanzar y devuelve metadata coherente (texturas: %s)', hasTextures => {
      const { scene } = fakeScene(hasTextures);

      const meta = renderer.render(scene, OPTIONS);

      expect(meta.bounds.width).toBeGreaterThan(0);
      expect(meta.bounds.height).toBeGreaterThan(0);
      // El piso caminable queda dentro de la sala.
      expect(meta.floorBounds.x).toBeGreaterThanOrEqual(0);
      expect(meta.floorBounds.y).toBeGreaterThanOrEqual(0);
      expect(meta.floorBounds.width).toBeGreaterThan(0);
      expect(meta.floorBounds.height).toBeGreaterThan(0);
      expect(meta.floorBounds.x + meta.floorBounds.width).toBeLessThanOrEqual(meta.bounds.width);
      expect(meta.floorBounds.y + meta.floorBounds.height).toBeLessThanOrEqual(meta.bounds.height);
      // Los puntos de interés están dentro de la sala.
      for (const [name, point] of Object.entries(meta.focusPoints)) {
        expect(point.x, name).toBeGreaterThanOrEqual(0);
        expect(point.y, name).toBeGreaterThanOrEqual(0);
        expect(point.x, name).toBeLessThanOrEqual(meta.bounds.width);
        expect(point.y, name).toBeLessThanOrEqual(meta.bounds.height);
      }
      // Las zonas de oclusión son rectángulos con tamaño.
      for (const zone of meta.occlusionZones) {
        expect(zone.width).toBeGreaterThan(0);
        expect(zone.height).toBeGreaterThan(0);
      }
    });

    it('declara solo capas visuales, ninguna del gameplay, y sin repetir', () => {
      const meta = renderer.render(fakeScene(true).scene, OPTIONS);

      for (const layer of meta.paintedLayers) {
        expect(PREMIUM_RENDERER_LAYERS).toContain(layer);
        expect(GAMEPLAY_ONLY_LAYERS).not.toContain(layer);
      }
      expect(new Set(meta.paintedLayers).size).toBe(meta.paintedLayers.length);
    });

    it('pinta algo: crea varios objetos en la escena', () => {
      const probe = fakeScene(true);

      renderer.render(probe.scene, OPTIONS);

      expect(probe.created).toBeGreaterThan(5);
    });

    it('es determinista: dos renders en escenas nuevas dan la misma metadata y los mismos objetos', () => {
      const first = fakeScene(true);
      const second = fakeScene(true);

      const a = renderer.render(first.scene, OPTIONS);
      const b = renderer.render(second.scene, OPTIONS);

      expect(b).toEqual(a);
      expect(second.created).toBe(first.created);
    });

    it('con reduceMotion no crea ningún tween', () => {
      const probe = fakeScene(true);

      renderer.render(probe.scene, { ...OPTIONS, reduceMotion: true });

      expect(probe.tweens).toEqual([]);
    });

    it('no modifica las opciones que recibe', () => {
      const frozen = Object.freeze({ ...OPTIONS });

      expect(() => renderer.render(fakeScene(true).scene, frozen)).not.toThrow();
    });
  });
});
