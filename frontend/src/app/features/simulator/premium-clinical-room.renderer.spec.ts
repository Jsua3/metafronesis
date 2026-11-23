import {
  PREMIUM_FLOOR_BOUNDS,
  PREMIUM_ROOM_BOUNDS,
  PREMIUM_ROOM_FOCUS_POINTS,
  PREMIUM_ROOM_GEOMETRY,
  PREMIUM_ROOM_OCCLUSION_ZONES,
  premiumClinicalRoomRenderer,
  premiumRoomMetadata,
} from './premium-clinical-room.renderer';
import { PREMIUM_RENDERER_LAYERS } from './scene-layer.types';
import {
  AUTHORED_CLINICAL_COLLISIONS,
  AUTHORED_ROOM_HEIGHT,
  AUTHORED_ROOM_WIDTH,
} from './authored-clinical-room.util';

describe('premium clinical room — contrato de capas (preparación C)', () => {
  it('declara las capas visuales esperadas, en orden de pintado', () => {
    expect(PREMIUM_RENDERER_LAYERS).toEqual([
      'background', 'floor', 'backProps', 'midProps', 'frontProps', 'lighting',
    ]);
  });

  it('no incluye capas que pertenecen al gameplay (actors / uiHints)', () => {
    expect(PREMIUM_RENDERER_LAYERS).not.toContain('actors');
    expect(PREMIUM_RENDERER_LAYERS).not.toContain('uiHints');
  });

  it('es un SceneRenderer registrable que soporta solo sus claves autoría', () => {
    expect(premiumClinicalRoomRenderer.key).toBe('premium-clinical-room');
    expect(premiumClinicalRoomRenderer.supports('urgencias-crisis')).toBe(true);
    expect(premiumClinicalRoomRenderer.supports('comisaria-sala-espera')).toBe(false);
    expect(premiumClinicalRoomRenderer.supports(null)).toBe(false);
  });

  it('su metadata pura incluye las zonas de oclusión frontal', () => {
    expect(premiumRoomMetadata().occlusionZones).toEqual(PREMIUM_ROOM_OCCLUSION_ZONES);
  });
});

describe('premium clinical room — metadata visual', () => {
  it('comparte los bounds con la sala autoría (una sola fuente de tamaño)', () => {
    expect(PREMIUM_ROOM_BOUNDS.width).toBe(AUTHORED_ROOM_WIDTH);
    expect(PREMIUM_ROOM_BOUNDS.height).toBe(AUTHORED_ROOM_HEIGHT);
  });

  it('el piso caminable coincide con el hueco entre bandas de colisión', () => {
    const [back, front, left, right] = AUTHORED_CLINICAL_COLLISIONS;
    expect(PREMIUM_FLOOR_BOUNDS.y).toBe(back.y + back.height);
    expect(PREMIUM_FLOOR_BOUNDS.y + PREMIUM_FLOOR_BOUNDS.height).toBe(front.y);
    expect(PREMIUM_FLOOR_BOUNDS.x).toBe(left.x + left.width);
    expect(PREMIUM_FLOOR_BOUNDS.x + PREMIUM_FLOOR_BOUNDS.width).toBe(right.x);
  });

  it('mantiene las líneas maestras de perspectiva dentro del lienzo', () => {
    const geo = PREMIUM_ROOM_GEOMETRY;
    expect(geo.backWallTopY).toBeLessThan(geo.wallFloorSeamY);
    expect(geo.wallFloorSeamY).toBeLessThan(geo.floorFrontY);
    expect(geo.floorFrontY).toBeLessThanOrEqual(PREMIUM_ROOM_BOUNDS.height);
    expect(geo.floorBackLeftX).toBeGreaterThan(geo.floorFrontLeftX);
    expect(geo.floorBackRightX).toBeLessThan(geo.floorFrontRightX);
  });

  it('expone puntos de foco dentro de la sala', () => {
    const keys = Object.keys(PREMIUM_ROOM_FOCUS_POINTS);
    expect(keys).toEqual(expect.arrayContaining(['desk', 'attention']));
    for (const point of Object.values(PREMIUM_ROOM_FOCUS_POINTS)) {
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(PREMIUM_ROOM_BOUNDS.width);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(PREMIUM_ROOM_BOUNDS.height);
    }
  });

  it('la oclusión frontal queda anclada al borde inferior y es pequeña', () => {
    const roomArea = PREMIUM_ROOM_BOUNDS.width * PREMIUM_ROOM_BOUNDS.height;
    expect(PREMIUM_ROOM_OCCLUSION_ZONES.length).toBeGreaterThanOrEqual(1);
    for (const zone of PREMIUM_ROOM_OCCLUSION_ZONES) {
      expect(zone.y + zone.height).toBe(PREMIUM_ROOM_BOUNDS.height);
      expect(zone.width * zone.height).toBeLessThan(roomArea * 0.08);
    }
  });
});
