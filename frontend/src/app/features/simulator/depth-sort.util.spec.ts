import { DEPTH, actorDepth, tiledLayerDepth } from './depth-sort.util';

describe('actorDepth', () => {
  it('is monotonic in y (lower on screen = drawn in front)', () => {
    expect(actorDepth(100)).toBeLessThan(actorDepth(200));
  });

  it('clamps negative y to the actor base', () => {
    expect(actorDepth(-5)).toBe(DEPTH.ACTORS_BASE);
  });

  it('keeps realistic actors below the props_front band', () => {
    expect(actorDepth(20000)).toBeLessThan(DEPTH.PROPS_FRONT);
  });
});

describe('tiledLayerDepth', () => {
  it('maps the 2.5D layer names to their band, ignoring numeric prefix and case', () => {
    expect(tiledLayerDepth('props_back')).toBe(DEPTH.PROPS_BACK);
    expect(tiledLayerDepth('3_props_back')).toBe(DEPTH.PROPS_BACK);
    expect(tiledLayerDepth('PROPS_BACK')).toBe(DEPTH.PROPS_BACK);
    expect(tiledLayerDepth('props_front')).toBe(DEPTH.PROPS_FRONT);
    expect(tiledLayerDepth('lighting')).toBe(DEPTH.LIGHTING_FLOOR);
    expect(tiledLayerDepth('overlay')).toBe(DEPTH.OVERLAY);
  });

  it('maps legacy Floor/Walls names', () => {
    expect(tiledLayerDepth('Floor')).toBe(DEPTH.FLOOR);
    expect(tiledLayerDepth('Walls')).toBe(DEPTH.WALLS);
  });

  it('returns null for unknown layer names', () => {
    expect(tiledLayerDepth('decoraciones-raras')).toBeNull();
  });
});
