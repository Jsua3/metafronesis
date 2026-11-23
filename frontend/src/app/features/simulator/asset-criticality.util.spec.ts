import { CRITICAL_TILESET_KEYS, isCriticalAsset } from './asset-criticality.util';

describe('isCriticalAsset', () => {
  it('los mapas Tiled y los tres tilesets de Kenney son esenciales', () => {
    expect(isCriticalAsset('map-comisaria-sala-espera')).toBe(true);
    expect(CRITICAL_TILESET_KEYS).toEqual(['dungeon-img', 'town-img', 'rpg-img']);
    for (const key of CRITICAL_TILESET_KEYS) expect(isCriticalAsset(key)).toBe(true);
  });

  it('lo decorativo tiene respaldo y no es esencial', () => {
    for (const key of ['step0', 'proximity-blip', 'characters', 'dungeon-tiles', 'cast-paula', 'avatar-body-a']) {
      expect(isCriticalAsset(key)).toBe(false);
    }
  });
});
