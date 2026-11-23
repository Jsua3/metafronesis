const SCENARIO_CONFIG_ASSET_KEYS: Record<string, string> = {
  'valoracion-comisaria': 'comisaria-familia',
  'comisaria-familia': 'comisaria-familia',
  // Caso PDF: las copias por etapa comparten la sala (y sus NPCs ambientales).
  'hospital-sala-escucha-accion': 'hospital-sala-escucha',
  'hospital-sala-escucha-cierre': 'hospital-sala-escucha',
  'comisaria-consultorio-marco': 'comisaria-consultorio',
  'comisaria-consultorio-cierre': 'comisaria-consultorio',
};

export function resolveScenarioConfigAssetKey(mapOrScenarioKey: string | undefined | null): string | null {
  const key = mapOrScenarioKey?.trim();
  if (!key) return null;
  return SCENARIO_CONFIG_ASSET_KEYS[key] ?? key;
}
