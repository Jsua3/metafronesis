import { resolveScenarioConfigAssetKey } from './scenario-config-assets.util';

describe('resolveScenarioConfigAssetKey', () => {
  it('uses the map key directly when the scenario JSON has the same name', () => {
    expect(resolveScenarioConfigAssetKey('urgencias-crisis')).toBe('urgencias-crisis');
    expect(resolveScenarioConfigAssetKey('ruta-proteccion')).toBe('ruta-proteccion');
  });

  it('maps backend scenario keys to differently named local JSON files', () => {
    expect(resolveScenarioConfigAssetKey('valoracion-comisaria')).toBe('comisaria-familia');
  });

  it('returns null for missing keys', () => {
    expect(resolveScenarioConfigAssetKey(null)).toBeNull();
    expect(resolveScenarioConfigAssetKey('   ')).toBeNull();
  });
});
