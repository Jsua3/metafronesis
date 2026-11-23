import { CASE_PDF_ROOM_RENDERERS } from './case-pdf-rooms.renderer';
import { DEPTH, tiledLayerDepth } from './depth-sort.util';
import { premiumClinicalRoomRenderer } from './premium-clinical-room.renderer';
import { SceneRenderer } from './scene-layer.types';

/** Escena falsa: toda llamada devuelve la misma cadena y solo se anotan las profundidades. */
function recordingScene(): { scene: never; depths: number[] } {
  const depths: number[] = [];
  const chain: unknown = new Proxy(function noop() { /* cadena */ }, {
    get(_target, prop) {
      if (prop === 'setDepth') return (depth: number) => { depths.push(depth); return chain; };
      if (prop === 'exists') return () => false;
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === Symbol.iterator) return function* empty() { /* nada */ };
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && ['x', 'y', 'width', 'height', 'alpha', 'scale', 'displayWidth', 'displayHeight', 'length'].includes(prop)) return 0;
      return chain;
    },
    apply: () => chain,
  });
  return { scene: chain as never, depths };
}

const RENDERERS: SceneRenderer[] = [premiumClinicalRoomRenderer, ...CASE_PDF_ROOM_RENDERERS];

describe('la luz de las salas va debajo de los actores (spec §8.3)', () => {
  it.each(RENDERERS.map(renderer => [renderer.key, renderer] as const))('%s no pinta nada por encima de los actores', (_key, renderer) => {
    const { scene, depths } = recordingScene();
    renderer.render(scene, { width: 960, height: 528, reduceMotion: false, ambientTone: 'calm' });
    expect(depths.filter(depth => depth >= DEPTH.LIGHTING)).toEqual([]);
    expect(depths).toContain(DEPTH.LIGHTING_FLOOR);
  });

  it('la capa Tiled «lighting» también va al suelo', () => {
    expect(tiledLayerDepth('lighting')).toBe(DEPTH.LIGHTING_FLOOR);
    expect(DEPTH.LIGHTING_FLOOR).toBeGreaterThan(DEPTH.ENVIRONMENT);
    expect(DEPTH.LIGHTING_FLOOR).toBeLessThan(DEPTH.ACTORS_BASE);
  });
});
