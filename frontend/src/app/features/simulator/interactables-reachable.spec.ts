import * as fs from 'fs';
import * as path from 'path';
import { caseRoomKind, collidesInCaseRoom } from './case-pdf-rooms.geometry';
import { MARKER_INTERACT_RADIUS, NPC_INTERACT_RADIUS } from './interaction-priority.util';
import { readSeed } from './orientation-seed.testing';

/**
 * Prueba de alcanzabilidad (T5.1): toda persona y todo objeto con el que se puede interactuar tiene,
 * en su sala, un punto de pies LIBRE a una distancia de la que el cliente y el servidor aceptan la
 * interacción. Si alguien mueve un mueble y deja a la enfermera (o a un objeto) fuera de alcance, esto falla.
 *
 * Margen: se pide un punto a ≤ 60 px, por debajo de los dos radios de cliente (72 y 74), que a su vez
 * quedan bajo lo que acepta el servidor (NPC 60 + 16 de tolerancia, marcadores 120).
 */
const REACH_PX = 60;
const STEP = 4;

interface Interactable { room: string; key: string; kind: 'objeto' | 'persona'; x: number; y: number }

/** Objetos de cada mapa del documento del caso (`x-siep.escenas[].mapa.objetos`). */
function seedObjects(): Interactable[] {
  const objects = readSeed().objects;
  expect(objects.length).toBeGreaterThan(0);
  return objects.filter(o => o.x !== null && o.y !== null).map(o => ({
    room: o.room, key: o.key, kind: 'objeto' as const, x: o.x!, y: o.y!,
  }));
}

/** Personas del escenario de las cuatro salas del caso (JSON de assets). */
function scenarioNpcs(): Interactable[] {
  const dir = path.join(__dirname, '..', '..', '..', 'assets', 'game', 'scenarios');
  const out: Interactable[] = [];
  for (const file of ['hospital-urgencias', 'hospital-sala-escucha', 'comisaria-recepcion', 'comisaria-consultorio']) {
    const scenario = JSON.parse(fs.readFileSync(path.join(dir, `${file}.json`), 'utf-8')) as {
      rooms: Array<{ key: string; npcs: Array<{ key: string; x: number; y: number }> }>;
    };
    for (const room of scenario.rooms) {
      for (const npc of room.npcs) out.push({ room: room.key, key: npc.key, kind: 'persona', x: npc.x, y: npc.y });
    }
  }
  return out;
}

/** Punto libre más cercano (rejilla de 4 px) a (x, y) en esa sala, o null si no hay ninguno a ≤ REACH_PX. */
function nearestFreePoint(room: string, x: number, y: number): { x: number; y: number; d: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  for (let dy = -REACH_PX; dy <= REACH_PX; dy += STEP) {
    for (let dx = -REACH_PX; dx <= REACH_PX; dx += STEP) {
      const d = Math.hypot(dx, dy);
      if (d > REACH_PX || (best && d >= best.d)) continue;
      if (!collidesInCaseRoom(room, x + dx, y + dy)) best = { x: x + dx, y: y + dy, d };
    }
  }
  return best;
}

describe('alcanzabilidad de lo interactuable en las salas del caso', () => {
  const objects = seedObjects();
  const npcs = scenarioNpcs();

  it('el lector del seed y de los JSON encuentra las salas y entidades esperadas', () => {
    const rooms = new Set(objects.map(o => caseRoomKind(o.room)));
    expect(rooms.has('hospital-urgencias')).toBe(true);
    expect(rooms.has('hospital-sala-escucha')).toBe(true);
    expect(rooms.has('comisaria-recepcion')).toBe(true);
    expect(rooms.has('comisaria-consultorio')).toBe(true);
    const keys = new Set(objects.filter(o => o.room === 'hospital-urgencias').map(o => o.key));
    for (const key of ['familia-crisis', 'zona-restringida', 'tool-pap', 'puerta-sala-escucha']) expect(keys.has(key)).toBe(true);
    const nurse = npcs.find(n => n.key === 'enfermera-urgencias');
    expect(nurse).toMatchObject({ room: 'hospital-urgencias', x: 560, y: 330 });
    // las listas compartidas se heredan en las copias por etapa
    expect(objects.some(o => o.room === 'hospital-sala-escucha-accion' && o.key === 'psicologa-acompanante')).toBe(true);
  });

  it('los radios de cliente caben dentro de la distancia que se exige aquí', () => {
    expect(NPC_INTERACT_RADIUS).toBeGreaterThanOrEqual(REACH_PX);
    expect(MARKER_INTERACT_RADIUS).toBeGreaterThanOrEqual(REACH_PX);
  });

  it('cada objeto del seed tiene un punto libre al alcance', () => {
    const unreachable: string[] = [];
    for (const o of objects) {
      const room = caseRoomKind(o.room);
      if (!room) continue;
      if (!nearestFreePoint(o.room, o.x, o.y)) unreachable.push(`${o.room}:${o.key}@(${o.x},${o.y})`);
    }
    expect(unreachable).toEqual([]);
  });

  it('cada persona del escenario tiene un punto libre al alcance', () => {
    const unreachable: string[] = [];
    for (const n of npcs) {
      if (!nearestFreePoint(n.room, n.x, n.y)) unreachable.push(`${n.room}:${n.key}@(${n.x},${n.y})`);
    }
    expect(unreachable).toEqual([]);
  });

  it('a la enfermera de urgencias se llega con margen: hay piso libre a menos de 45 px', () => {
    const nurse = npcs.find(n => n.key === 'enfermera-urgencias')!;
    const point = nearestFreePoint(nurse.room, nurse.x, nurse.y);
    expect(point).not.toBeNull();
    expect(point!.d).toBeLessThanOrEqual(45);
  });

  it('la prueba puede fallar: un objeto metido dentro de un mueble queda fuera de alcance', () => {
    // (490,150) cae en la banda de pared del fondo: el piso libre más cercano queda a más de 60 px
    expect(nearestFreePoint('hospital-urgencias', 490, 150)).toBeNull();
  });
});
