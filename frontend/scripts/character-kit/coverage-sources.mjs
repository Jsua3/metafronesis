/**
 * Claves de personaje que el juego referencia, leídas de sus fuentes (el caso sembrado es un documento JSON). La cobertura exige que
 * cada una resuelva a una receta (o a una voz sin cuerpo). Si una fuente se mueve, se
 * actualiza aquí; SOURCE_MINIMUMS evita que una fuente perdida pase como «cero claves».
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const COVERAGE_SOURCES = Object.freeze({
  scenarios: 'frontend/src/assets/game/scenarios',
  seed: 'frontend/src/app/features/simulator/fixtures/SIM-VBG-001.dsl.json',
  speakerLiterals: [
    'frontend/src/app/features/simulator/risky-interaction.config.ts',
    'frontend/src/app/features/simulator/simulation-play.component.ts',
  ],
});

/** Claves que da hoy cada fuente (2026-10); menos es una fuente que dejó de leerse. */
export const SOURCE_MINIMUMS = Object.freeze({ scenarioNpcs: 20, actors: 6, speakers: 6 });

const read = (root, rel) => readFileSync(path.join(root, rel), 'utf8');
const all = (text, re) => [...text.matchAll(re)].map(m => m[1]);

/** NPC de los escenarios → su receta (null si le falta `recipeId`). */
function scenarioNpcRecipes(root) {
  const dir = path.join(root, COVERAGE_SOURCES.scenarios);
  const recipes = new Map();
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const json = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    for (const room of json.rooms ?? []) {
      for (const npc of room.npcs ?? []) recipes.set(npc.key, typeof npc.recipeId === 'string' ? npc.recipeId : null);
    }
  }
  return recipes;
}

/** Los mapas del caso sembrado: la semilla es un documento (E4-6) y el mundo vive en `x-siep.escenas[].mapa`. */
function seedMaps(root) {
  const document = JSON.parse(read(root, COVERAGE_SOURCES.seed));
  return document['x-siep'].escenas.flatMap(scene => (scene.mapa ? [scene.mapa] : []));
}

/**
 * Hablantes del guion en los diálogos del mapa: los de las personas y los de un objeto que habla con voz propia.
 * Un objeto de información que habla con su propio nombre («Expediente del caso») no es una voz del guion y no
 * pide receta.
 */
function seedSpeakers(map) {
  const objects = new Map(map.objetos.map(o => [o.clave, o]));
  return map.dialogos
    .filter(tree => {
      const owner = objects.get(tree.objeto);
      return owner?.tipo === 'PERSON' || tree.hablante !== owner?.etiqueta;
    })
    .map(tree => tree.hablante);
}

export function referencedKeys(root) {
  const maps = seedMaps(root);
  return {
    scenarioNpcs: scenarioNpcRecipes(root),
    // Personas del caso sembradas por el backend (objetos PERSON de los mapas).
    actors: new Set(maps.flatMap(map => map.objetos).filter(o => o.tipo === 'PERSON').map(o => o.clave)),
    speakers: new Set([
      ...maps.flatMap(seedSpeakers),
      ...COVERAGE_SOURCES.speakerLiterals.flatMap(rel => all(read(root, rel), /speakerName: '([^']+)'/g)),
    ]),
    // Sin fuente viva: el catálogo los conserva para datos ya guardados (portraitKey de árboles
    // autorados, npcTemplateId de casos viejos) y checkCatalogRecipes valida sus recetas.
    portraitKeys: new Set(),
    templates: new Set(),
  };
}

/** Fuentes que dieron menos claves que su mínimo. */
export function checkSourceMinimums(refs) {
  return Object.entries(SOURCE_MINIMUMS)
    .filter(([source, min]) => refs[source].size < min)
    .map(([source, min]) => `cobertura: la fuente ${source} dio ${refs[source].size} claves (mínimo ${min}); ¿se movió de sitio?`);
}
