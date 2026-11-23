import { readFileSync } from 'fs';
import { join } from 'path';
import { registeredSceneRendererKeys, resolveSceneRenderer } from './scene-renderer.registry';
import { premiumRoomMetadata } from './premium-clinical-room.renderer';
import { GAMEPLAY_ONLY_LAYERS, PREMIUM_RENDERER_LAYERS } from './scene-layer.types';

describe('scene renderer registry (fase C)', () => {
  it('resuelve la sala clínica premium para todas sus claves autoría', () => {
    for (const key of ['urgencias-crisis', 'urgencias-sala', 'map-urgencias-sala',
                       'ruta-sala', 'informe-oficina', 'nna-sala', 'cierre-sala']) {
      expect(resolveSceneRenderer(key)?.key).toBe('premium-clinical-room');
    }
  });

  it('devuelve null para mapas sin renderer (flujo Tiled/procedural)', () => {
    expect(resolveSceneRenderer('comisaria-sala-espera')).toBeNull();
    expect(resolveSceneRenderer('map-comisaria-consultorio')).toBeNull();
    expect(resolveSceneRenderer('')).toBeNull();
    expect(resolveSceneRenderer(null)).toBeNull();
    expect(resolveSceneRenderer(undefined)).toBeNull();
  });

  it('expone claves estables de los renderers registrados', () => {
    expect(registeredSceneRendererKeys()).toContain('premium-clinical-room');
  });
});

describe('metadata del renderer premium (contrato de capas C)', () => {
  const metadata = premiumRoomMetadata();

  it('declara las capas visuales esperadas, en orden de pintado', () => {
    expect(metadata.paintedLayers).toEqual(PREMIUM_RENDERER_LAYERS);
  });

  it('nunca pinta capas del gameplay (actors / uiHints)', () => {
    for (const layer of GAMEPLAY_ONLY_LAYERS) {
      expect(metadata.paintedLayers).not.toContain(layer);
    }
  });

  it('contiene bounds, piso caminable, focos y zonas de oclusión', () => {
    expect(metadata.bounds.width).toBeGreaterThan(0);
    expect(metadata.bounds.height).toBeGreaterThan(0);
    expect(metadata.floorBounds.width).toBeGreaterThan(0);
    expect(Object.keys(metadata.focusPoints).length).toBeGreaterThanOrEqual(2);
    expect(metadata.occlusionZones.length).toBeGreaterThanOrEqual(1);
    // El piso caminable queda dentro de los bounds de la sala.
    expect(metadata.floorBounds.x + metadata.floorBounds.width)
      .toBeLessThanOrEqual(metadata.bounds.width);
    expect(metadata.floorBounds.y + metadata.floorBounds.height)
      .toBeLessThanOrEqual(metadata.bounds.height);
  });
});

describe('game-world delega el arte de la sala premium (no lo dibuja)', () => {
  const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

  it('pregunta al registry en vez de importar el renderer premium directo', () => {
    expect(source).toContain('resolveSceneRenderer');
    expect(source).not.toContain('renderPremiumClinicalRoom');
  });

  it('no contiene lógica de dibujo específica de la sala premium', () => {
    // Funciones/paletas internas del renderer: no deben filtrarse al componente.
    for (const marker of ['paintDesk', 'paintSofa', 'paintBookshelf', 'paintRug',
                          'PREMIUM_ROOM_GEOMETRY', 'PAL.']) {
      expect(source).not.toContain(marker);
    }
  });
});
