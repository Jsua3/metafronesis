import * as fs from 'fs';
import * as path from 'path';
import { testKitBundle } from '../character/kit/testing/kit-testing';
import { collidesInAuthoredRoom } from './authored-clinical-room.util';
import { NpcConfig, RoomConfig, ScenarioConfig } from '../../core/models/simulation.model';

const SCENARIOS_DIR = path.join(__dirname, '..', '..', '..', 'assets', 'game', 'scenarios');
const SCENARIO_FILES = [
  'urgencias-crisis', 'ruta-proteccion', 'informe-integral',
  'comisaria-familia', 'proteccion-nna', 'cierre-seguimiento',
];
const BEHAVIORS = ['idle', 'subtle-wander', 'pace', 'patrol', 'avoidant', 'attentive'];
const AUTHORED_TILED_KEYS = new Set([
  'map-urgencias-sala', 'map-ruta-sala', 'map-informe-oficina', 'map-nna-sala', 'map-cierre-sala',
]);

function loadScenario(name: string): ScenarioConfig {
  return JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, `${name}.json`), 'utf-8'));
}

function allNpcs(): Array<{ file: string; room: RoomConfig; npc: NpcConfig }> {
  return SCENARIO_FILES.flatMap(file =>
    loadScenario(file).rooms.flatMap(room => room.npcs.map(npc => ({ file, room, npc }))));
}

describe('scenario-npc-configs (assets JSON del caso competitivo)', () => {
  it('cada NPC nombra una receta del kit (spec §8.1)', () => {
    const recipes = testKitBundle().recipes;
    for (const { file, npc } of allNpcs()) {
      expect(`${file}:${npc.key}:${recipes[npc.recipeId] ? 'ok' : npc.recipeId}`).toBe(`${file}:${npc.key}:ok`);
      expect('avatarPresetKey' in npc || 'frameIndex' in npc).toBe(false);
      expect(npc.dialogue.lines.length).toBeGreaterThan(0);
    }
  });

  it('motion válido: behavior conocido, anchors numéricos dentro de la zona si ambos existen', () => {
    for (const { npc } of allNpcs()) {
      if (!npc.motion) continue;
      expect(BEHAVIORS).toContain(npc.motion.behavior);
      for (const anchor of npc.motion.anchors ?? []) {
        expect(Number.isFinite(anchor.x)).toBe(true);
        expect(Number.isFinite(anchor.y)).toBe(true);
        if (npc.motion.zone) {
          expect(anchor.x).toBeGreaterThanOrEqual(npc.motion.zone.x);
          expect(anchor.x).toBeLessThanOrEqual(npc.motion.zone.x + npc.motion.zone.width);
          expect(anchor.y).toBeGreaterThanOrEqual(npc.motion.zone.y);
          expect(anchor.y).toBeLessThanOrEqual(npc.motion.zone.y + npc.motion.zone.height);
        }
      }
    }
  });

  it('en salas autoría los NPCs y sus anchors caen en piso caminable (no muebles/paredes)', () => {
    for (const { room, npc } of allNpcs()) {
      if (!AUTHORED_TILED_KEYS.has(room.tiledMapKey)) continue;
      expect(collidesInAuthoredRoom(npc.x, npc.y)).toBe(false);
      for (const anchor of npc.motion?.anchors ?? []) {
        expect(collidesInAuthoredRoom(anchor.x, anchor.y)).toBe(false);
      }
    }
  });

  it('el caso principal tiene ≥4 NPCs modulares y ≥3 behaviors distintos', () => {
    const urgencias = loadScenario('urgencias-crisis').rooms[0].npcs;
    const modular = urgencias.filter(n => n.recipeId);
    expect(modular.length).toBeGreaterThanOrEqual(4);
    const behaviors = new Set(modular.map(n => n.motion?.behavior).filter(Boolean));
    expect(behaviors.size).toBeGreaterThanOrEqual(3);
  });
});
