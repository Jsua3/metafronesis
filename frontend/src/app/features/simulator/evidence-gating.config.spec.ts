import { SimulationWorldState } from '../../core/models/simulation.model';
import { collectViewedNpcKeys, isToolUsed, missingEvidenceItems, toolUsed } from './evidence-gating.config';

function worldWith(partial: Partial<SimulationWorldState>): SimulationWorldState {
  return {
    attemptId: 'a', status: 'IN_PROGRESS',
    map: { id: 1, key: 'sala', title: '', width: 960, height: 540, theme: '', spawnX: 0, spawnY: 0, ambient: {} },
    player: { x: 0, y: 0 }, objects: [], collisions: [], tools: [],
    inventory: [], inspectedObjectKeys: [], viewedDialogueKeys: [], usedToolKeys: [], flags: {},
    ...partial,
  };
}

describe('evidence-gating.config: ayudantes de las puertas', () => {
  it('toolUsed no confunde inventario con aplicación y reconoce el uso persistido', () => {
    expect(toolUsed(worldWith({ inventory: ['PAP'] }), 'PAP')).toBe(false);
    expect(toolUsed(worldWith({ usedToolKeys: ['PAP'] }), 'PAP')).toBe(true);
    expect(toolUsed(worldWith({ usedToolKeys: ['PAP@escucha-segura'] }), 'PAP')).toBe(true);
    expect(toolUsed(worldWith({ usedToolKeys: ['RISK_METER'] }), 'PAP')).toBe(false);
  });

  it('isToolUsed reconoce el uso persistido con o sin objetivo', () => {
    expect(isToolUsed(['PAP'], 'PAP')).toBe(true);
    expect(isToolUsed(['PAP@familia-crisis'], 'PAP')).toBe(true);
    expect(isToolUsed(['PAPA@x'], 'PAP')).toBe(false);
    expect(isToolUsed([], 'PAP')).toBe(false);
  });

  it('missingEvidenceItems pide recoger la herramienta (toolOwned) y conserva el orden personas, herramientas, objetos', () => {
    const req = { npcs: ['ana'], tools: ['KIT'], inspected: ['expediente'] };
    expect(missingEvidenceItems(req, worldWith({}), new Set())).toEqual([
      { kind: 'npc', key: 'ana' },
      { kind: 'toolOwned', key: 'KIT' },
      { kind: 'inspected', key: 'expediente' },
    ]);
    expect(missingEvidenceItems(req, worldWith({ inventory: ['KIT'], inspectedObjectKeys: ['expediente'] }), new Set(['ana'])))
      .toEqual([]);
  });

  it('missingEvidenceItems respeta el mundo nulo y los requisitos nulos', () => {
    const req = { inspected: ['expediente-caso'] };
    expect(missingEvidenceItems(req, worldWith({}), new Set())).toEqual([{ kind: 'inspected', key: 'expediente-caso' }]);
    expect(missingEvidenceItems(null, worldWith({}), new Set())).toEqual([]);
    expect(missingEvidenceItems(req, null, new Set())).toEqual([]);
  });

  it('las personas habladas salen de la señal del componente y de flags.viewedNpcKeys del servidor', () => {
    const persisted = worldWith({ flags: { viewedNpcKeys: ['ana', 7, ''] } });
    expect(missingEvidenceItems({ npcs: ['ana'] }, persisted, new Set())).toEqual([]);
    expect([...collectViewedNpcKeys(persisted, new Set(['otra']))].sort()).toEqual(['ana', 'otra']);
    expect([...collectViewedNpcKeys(null, new Set(['a']))]).toEqual(['a']);
  });

  it('ya no existen las tablas por caso ni las compuertas de evidencia', async () => {
    const config = await import('./evidence-gating.config');
    for (const name of ['NODE_EVIDENCE', 'nodeEvidence', 'choiceEvidence', 'mergeEvidence', 'missingEvidence', 'unlockedExtraLines']) {
      expect(config).not.toHaveProperty(name);
    }
  });
});
