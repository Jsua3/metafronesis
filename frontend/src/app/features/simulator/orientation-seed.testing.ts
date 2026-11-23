import * as fs from 'fs';
import * as path from 'path';

/**
 * Lector del documento del caso PDF para los specs de orientación (SOLO pruebas: usa `fs`, no lo importa la app).
 * La semilla es un documento (E4-6): `fixtures/SIM-VBG-001.dsl.json` (copia del caso de ejemplo del taller; el servidor de
 * metafronesis aún no lo trae), el DSL con su extensión `x-siep`; el mundo de cada sala vive en `x-siep.escenas[].mapa`. Falla si falta: así un cambio de lugar del documento no deja los contratos «verdes por vacío». Extrae solo
 * lo que la orientación necesita: nombres de objetos, NPC del escenario, claves de escena y requisitos de las puertas.
 */
const SEED_RELATIVE = ['src', 'app', 'features', 'simulator', 'fixtures', 'SIM-VBG-001.dsl.json'];

/** Sube desde la carpeta de trabajo (o desde este archivo) hasta la carpeta `frontend`, que es donde está la copia. */
function findSeed(): string {
  for (const start of [process.cwd(), __dirname]) {
    let dir = start;
    for (let i = 0; i < 12; i++) {
      const candidate = path.join(dir, ...SEED_RELATIVE);
      if (fs.existsSync(candidate)) return candidate;
      dir = path.resolve(dir, '..');
    }
  }
  throw new Error(`No se encontró ${SEED_RELATIVE.join('/')}`);
}

export const SEED_PATH = findSeed();

export interface SeedObject {
  key: string; label: string; type: string; x: number | null; y: number | null;
  /** Clave del mapa (sala) en el que está el objeto. */
  room: string;
  /** Código de la herramienta que entrega el objeto, si es una herramienta. */
  tool: string | null;
}
export interface SeedDoor {
  key: string; label: string; targetNodeKey: string | null;
  requiresInspected: string[]; requiresNpcs: string[]; requiresTools: string[]; requiresNodes: string[];
}
export interface SeedNpc { key: string; x: number; y: number }

export interface SeedData {
  /** Claves de las escenas (nodos) del caso. */
  sceneKeys: string[];
  /** Todos los objetos de todos los mapas (el mismo objeto puede estar en varias salas). */
  objects: SeedObject[];
  doors: SeedDoor[];
  ambientNpcs: SeedNpc[];
}

interface SeedDocumentObject {
  clave: string; etiqueta: string; tipo: string; x: number; y: number; herramienta: string | null;
  metadatos: { targetNodeKey?: string; requiresInspected?: string[]; requiresNpcs?: string[]; requiresTools?: string[]; requiresNodes?: string[] };
}
interface SeedDocumentMap {
  clave: string;
  objetos: SeedDocumentObject[];
  ambiente: { ambientNpcs?: Array<{ key: string; x: number; y: number }> };
}
interface SeedDocument { 'x-siep': { escenas: Array<{ clave: string; mapa?: SeedDocumentMap }> } }

export function readSeed(): SeedData {
  const document = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8')) as SeedDocument;
  const scenes = document['x-siep'].escenas;
  const maps = scenes.flatMap(scene => (scene.mapa ? [scene.mapa] : []));
  const objects = maps.flatMap(map => map.objetos.map(o => ({
    key: o.clave, label: o.etiqueta, type: o.tipo, x: o.x, y: o.y, room: map.clave, tool: o.herramienta ?? null,
  })));
  const doors = maps.flatMap(map => map.objetos.filter(o => o.tipo === 'EXIT').map(o => ({
    key: o.clave, label: o.etiqueta,
    targetNodeKey: o.metadatos.targetNodeKey ?? null,
    requiresInspected: o.metadatos.requiresInspected ?? [],
    requiresNpcs: o.metadatos.requiresNpcs ?? [],
    requiresTools: o.metadatos.requiresTools ?? [],
    requiresNodes: o.metadatos.requiresNodes ?? [],
  })));
  const ambientNpcs = maps.flatMap(map => (map.ambiente.ambientNpcs ?? []).map(n => ({ key: n.key, x: n.x, y: n.y })));
  return { sceneKeys: scenes.map(scene => scene.clave), objects, doors, ambientNpcs };
}
