import * as fs from 'fs';
import * as path from 'path';
import { testKitBundle } from '../character/kit/testing/kit-testing';
import {
  CASE_ROOM_FURNITURE,
  caseRoomCollisions,
  caseRoomKind,
  collidesInCaseRoom,
} from './case-pdf-rooms.geometry';
import { CASE_PDF_ROOM_RENDERERS, caseRoomMetadata } from './case-pdf-rooms.renderer';
import { resolveSceneRenderer } from './scene-renderer.registry';
import { NpcConfig, RoomConfig, ScenarioConfig } from '../../core/models/simulation.model';

const SCENARIOS_DIR = path.join(__dirname, '..', '..', '..', 'assets', 'game', 'scenarios');
const CASE_SCENARIOS = [
  'hospital-urgencias', 'hospital-sala-escucha',
  'comisaria-recepcion', 'comisaria-consultorio',
];
const BEHAVIORS = ['idle', 'subtle-wander', 'pace', 'patrol', 'avoidant', 'attentive'];

/** Posiciones jugables sembradas por seed_caso_pdf (espejo del backend). */
const SEEDED_MARKERS: Record<string, Array<[string, number, number]>> = {
  'hospital-urgencias': [
    ['familia-crisis', 190, 420], ['zona-restringida', 660, 268],
    ['tool-pap', 318, 428], ['puerta-sala-escucha', 838, 440],
  ],
  'hospital-sala-escucha': [
    ['familia-duelo', 168, 408], ['marco-normativo-hospital', 660, 320],
    ['psicologa-acompanante', 740, 400], ['tool-pap', 318, 430],
    ['tool-spikes', 480, 300], ['tool-bitacora', 560, 430],
    ['puerta-urgencias', 122, 460], ['salida-institucional', 838, 440],
  ],
  'comisaria-recepcion': [
    ['expediente-caso', 740, 312], ['funcionaria-recepcion', 480, 332],
    ['puerta-consultorio', 838, 440],
  ],
  'comisaria-consultorio': [
    ['sobreviviente-consulta', 220, 408], ['marco-normativo-comisaria', 790, 318],
    ['profesional-psicosocial', 700, 400], ['tool-riesgo', 318, 436],
    ['tool-ruta', 610, 436], ['puerta-recepcion', 122, 460],
  ],
};

/** Puntos de entrada de puertas (entryX/entryY del seed). */
const DOOR_ENTRIES: Array<[string, number, number]> = [
  ['hospital-sala-escucha', 160, 452],   // urgencias → escucha
  ['hospital-urgencias', 786, 440],      // escucha → urgencias
  ['comisaria-recepcion', 160, 452],     // salida institucional
  ['comisaria-consultorio', 160, 452],   // recepción → consultorio
  ['comisaria-recepcion', 786, 440],     // consultorio → recepción
];

function loadScenario(name: string): ScenarioConfig {
  return JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, `${name}.json`), 'utf-8'));
}

function allNpcs(): Array<{ file: string; room: RoomConfig; npc: NpcConfig }> {
  return CASE_SCENARIOS.flatMap(file =>
    loadScenario(file).rooms.flatMap(room => room.npcs.map(npc => ({ file, room, npc }))));
}

describe('case-pdf-rooms (geometría + renderers + escenarios)', () => {
  it('las copias por etapa resuelven al mismo tipo de sala', () => {
    expect(caseRoomKind('hospital-urgencias')).toBe('hospital-urgencias');
    expect(caseRoomKind('hospital-sala-escucha')).toBe('hospital-sala-escucha');
    expect(caseRoomKind('hospital-sala-escucha-accion')).toBe('hospital-sala-escucha');
    expect(caseRoomKind('hospital-sala-escucha-cierre')).toBe('hospital-sala-escucha');
    expect(caseRoomKind('comisaria-recepcion')).toBe('comisaria-recepcion');
    expect(caseRoomKind('comisaria-consultorio-marco')).toBe('comisaria-consultorio');
    expect(caseRoomKind('comisaria-consultorio-cierre')).toBe('comisaria-consultorio');
    expect(caseRoomKind('urgencias-crisis')).toBeNull();           // legacy intacto
  });

  it('cada sala tiene colisiones de paredes + muebles', () => {
    for (const kind of Object.keys(CASE_ROOM_FURNITURE)) {
      const zones = caseRoomCollisions(kind)!;
      expect(zones.length).toBe(4 + CASE_ROOM_FURNITURE[kind].length);
    }
    expect(caseRoomCollisions('mapa-desconocido')).toBeNull();
  });

  it('los markers/puertas sembrados caen en piso caminable y los spawns también', () => {
    for (const [mapKind, markers] of Object.entries(SEEDED_MARKERS)) {
      for (const [key, x, y] of markers) {
        expect({ mapKind, key, collides: collidesInCaseRoom(mapKind, x, y) })
          .toEqual({ mapKind, key, collides: false });
      }
    }
    // Spawns del seed: (480,430) y recepción (160,452).
    expect(collidesInCaseRoom('hospital-urgencias', 480, 430)).toBe(false);
    expect(collidesInCaseRoom('comisaria-recepcion', 160, 452)).toBe(false);
  });

  it('los puntos de entrada de cada puerta son jugables en la sala destino', () => {
    for (const [mapKind, x, y] of DOOR_ENTRIES) {
      expect({ mapKind, x, y, collides: collidesInCaseRoom(mapKind, x, y) })
        .toEqual({ mapKind, x, y, collides: false });
    }
  });

  it('el registry resuelve cada map_key del caso (incluidas copias) a su renderer', () => {
    const cases: Array<[string, string]> = [
      ['hospital-urgencias', 'case-pdf-hospital-urgencias'],
      ['hospital-sala-escucha', 'case-pdf-hospital-sala-escucha'],
      ['hospital-sala-escucha-accion', 'case-pdf-hospital-sala-escucha'],
      ['hospital-sala-escucha-cierre', 'case-pdf-hospital-sala-escucha'],
      ['comisaria-recepcion', 'case-pdf-comisaria-recepcion'],
      ['comisaria-consultorio', 'case-pdf-comisaria-consultorio'],
      ['comisaria-consultorio-marco', 'case-pdf-comisaria-consultorio'],
      ['comisaria-consultorio-cierre', 'case-pdf-comisaria-consultorio'],
    ];
    for (const [mapKey, rendererKey] of cases) {
      expect(resolveSceneRenderer(mapKey)?.key).toBe(rendererKey);
    }
    // La sala autoría legacy sigue resolviendo a su renderer premium.
    expect(resolveSceneRenderer('urgencias-crisis')?.key).toBe('premium-clinical-room');
    expect(CASE_PDF_ROOM_RENDERERS.length).toBe(4);
  });

  it('metadata: bounds 960×528 y floorBounds = zona caminable de las colisiones', () => {
    for (const kind of Object.keys(CASE_ROOM_FURNITURE)) {
      const meta = caseRoomMetadata(kind);
      expect(meta.bounds).toEqual({ width: 960, height: 528 });
      expect(meta.floorBounds).toEqual({ x: 96, y: 236, width: 768, height: 250 });
      expect(meta.paintedLayers).toContain('lighting');
      expect(Object.keys(meta.focusPoints).length).toBeGreaterThan(0);
    }
  });

  it('escenarios JSON: presets reales, behaviors válidos y diálogo presente', () => {
    const recipes = testKitBundle().recipes;
    for (const { file, npc } of allNpcs()) {
      expect(`${file}:${npc.key}:${recipes[npc.recipeId] ? 'ok' : npc.recipeId}`).toBe(`${file}:${npc.key}:ok`);
      expect(npc.dialogue.lines.length).toBeGreaterThan(0);
      if (npc.motion) expect(BEHAVIORS).toContain(npc.motion.behavior);
    }
  });

  it('los NPCs ambientales y sus anchors caen en piso caminable de SU sala', () => {
    for (const { room, npc } of allNpcs()) {
      expect({ room: room.key, npc: npc.key, collides: collidesInCaseRoom(room.tiledMapKey, npc.x, npc.y) })
        .toEqual({ room: room.key, npc: npc.key, collides: false });
      for (const anchor of npc.motion?.anchors ?? []) {
        expect(collidesInCaseRoom(room.tiledMapKey, anchor.x, anchor.y)).toBe(false);
      }
    }
  });

  it('mantiene los NPCs interactivos en el ancla que valida el backend', () => {
    const translationalBehaviors = new Set(['subtle-wander', 'pace', 'patrol', 'avoidant']);
    for (const { file, npc } of allNpcs()) {
      expect({ file, npc: npc.key, behavior: npc.motion?.behavior })
        .not.toMatchObject({ behavior: expect.stringMatching(/subtle-wander|pace|patrol|avoidant/) });
      expect(translationalBehaviors.has(npc.motion?.behavior ?? 'idle')).toBe(false);
      expect(npc.motion?.anchors ?? []).toHaveLength(0);
    }
  });

  it('todas las salas tienen NPCs modulares y urgencias conserva al menos tres actores', () => {
    for (const file of CASE_SCENARIOS) {
      const npcs = loadScenario(file).rooms[0].npcs;
      expect(npcs.some(n => n.recipeId)).toBe(true);
    }
    const urgencias = loadScenario('hospital-urgencias').rooms[0].npcs;
    const modular = urgencias.filter(n => n.recipeId);
    expect(modular.length).toBeGreaterThanOrEqual(3);
    expect(modular.every(n => BEHAVIORS.includes(n.motion?.behavior ?? 'idle'))).toBe(true);
  });
});
