import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildBundle } from './bundle.mjs';
import { REPO_ROOT, checkCatalogKeys, checkCatalogRecipes, checkScenarioRecipes, editorSamples } from './coverage.mjs';
import { checkSourceMinimums, referencedKeys } from './coverage-sources.mjs';

test('las fuentes del juego se leen: escenarios, personas del seed y hablantes', () => {
  const refs = referencedKeys(REPO_ROOT);
  assert.equal(refs.scenarioNpcs.size, 20);
  assert.ok(refs.scenarioNpcs.has('supervisor-cierre'));
  assert.ok(refs.actors.has('familia-crisis') && refs.actors.has('funcionaria-recepcion'));
  assert.ok(refs.speakers.has('Sobreviviente (22 años)') && refs.speakers.has('Protocolo clínico'));
});

test('una fuente que deja de leerse falla en vez de cubrir cero', () => {
  const refs = referencedKeys(REPO_ROOT);
  assert.deepEqual(checkSourceMinimums(refs), []);
  refs.speakers.clear();
  assert.deepEqual(checkSourceMinimums(refs), ['cobertura: la fuente speakers dio 0 claves (mínimo 6); ¿se movió de sitio?']);
});

test('cada NPC de escenario nombra una receta que existe', () => {
  const bundle = buildBundle();
  const refs = referencedKeys(REPO_ROOT);
  assert.deepEqual(checkScenarioRecipes(bundle.recipes, refs), []);
  refs.scenarioNpcs.set('npc-nuevo', null);
  refs.scenarioNpcs.set('npc-raro', 'no-existe');
  assert.deepEqual(checkScenarioRecipes(bundle.recipes, refs), [
    'escenario: el NPC «npc-nuevo» no tiene recipeId',
    'escenario: el NPC «npc-raro» usa la receta inexistente «no-existe»',
  ]);
  assert.equal(bundle.catalog.scenarioNpcs, undefined);
});

test('el catálogo cubre todas las claves que el juego referencia', () => {
  assert.deepEqual(checkCatalogKeys(buildBundle().catalog, referencedKeys(REPO_ROOT)), []);
});

test('una clave nueva sin receta se detecta', () => {
  const refs = referencedKeys(REPO_ROOT);
  refs.actors.add('actor-nuevo');
  refs.speakers.add('Voz nueva');
  assert.deepEqual(checkCatalogKeys(buildBundle().catalog, refs), [
    'catálogo: falta el actor «actor-nuevo»',
    'catálogo: el hablante «Voz nueva» no es receta ni voz sin cuerpo',
  ]);
});

test('el catálogo proyecta a un retrato las emociones que master ya aliaba (F§7.11) y las de consecuencias futuras, y el chequeo las exige', () => {
  const bundle = buildBundle();
  for (const emotion of ['anxious', 'worried', 'negative', 'sad', 'relieved', 'calm', 'receptive', 'closed']) {
    assert.ok(bundle.catalog.emotionToPortrait[emotion], `falta la emoción ${emotion}`);
  }
  delete bundle.catalog.emotionToPortrait.anxious;
  assert.deepEqual(checkCatalogRecipes(bundle), ['catálogo: la emoción anxious no proyecta a un estado de retrato']);
});

test('todo lo que el catálogo nombra existe', () => {
  assert.deepEqual(checkCatalogRecipes(buildBundle()), []);
  const bundle = buildBundle();
  bundle.catalog.actors['familia-crisis'] = 'no-existe';
  bundle.catalog.editor.hair.push('cresta');
  assert.deepEqual(checkCatalogRecipes(bundle), [
    'catálogo: actors.familia-crisis apunta a la receta inexistente «no-existe»',
    'editor: peinado inexistente cresta',
  ]);
});

test('muestras del editor: uniforme y uniforme con bata, en cada complexión (decisión 18)', () => {
  const samples = editorSamples(buildBundle());
  assert.equal(samples.length, 2 * 2);
  assert.ok(samples.every(r => r.pieces.face === 'sereno' && r.pieces.top === 'uniforme-psicologia'));
  assert.equal(samples.filter(r => r.pieces.layer === 'bata-psicologia').length, 2);
});

test('las variantes de los jugables nombran piezas y rampas que existen', () => {
  const bundle = buildBundle();
  bundle.catalog.playableVariants.bata.pieces.layer = 'capa-inexistente';
  assert.deepEqual(checkCatalogRecipes(bundle), ['catálogo: la variante bata usa layer:capa-inexistente, que no existe']);
});
