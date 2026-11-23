import { testKitBundle } from '../character/kit/testing/kit-testing';
import {
  DIMMED_ALPHA,
  KIT_BODY_HEIGHT,
  KIT_ICON_OFFSET_Y,
  KIT_LABEL_OFFSET_Y,
  extrasCharacterRef,
  markerEmphasis,
  npcCharacterRef,
  personCharacterRef,
  playerCharacterRef,
} from './world-characters.util';

describe('world-characters.util — jugador', () => {
  it('sin nada guardado, Valentina sin bata', () => {
    expect(playerCharacterRef(null)).toEqual({ kind: 'jugador', avatar: { schemaVersion: 2, mode: 'elenco', recipeId: 'valentina', bata: false } });
  });

  it('un v1 guardado se migra al vuelo (el almacén lo reescribe en la tarea 13)', () => {
    expect(playerCharacterRef(JSON.stringify({ castId: 'david', uniform: 'con-bata' })))
      .toEqual({ kind: 'jugador', avatar: { schemaVersion: 2, mode: 'elenco', recipeId: 'david', bata: true } });
  });

  it('nombre e icono quedan sobre la cabeza más alta que admite la biblia (66 px)', () => {
    expect(KIT_BODY_HEIGHT).toBe(64);
    expect(-KIT_LABEL_OFFSET_Y).toBeGreaterThan(66);
    expect(-KIT_ICON_OFFSET_Y).toBeGreaterThanOrEqual(66);
  });
});

describe('world-characters.util — NPC, personas, guía y figurantes', () => {
  const bundle = testKitBundle();
  const recipe = (recipeId: string) => ({ kind: 'receta', recipeId });

  it('un NPC de escenario es su receta', () => {
    expect(npcCharacterRef({ recipeId: 'seguridad' })).toEqual(recipe('seguridad'));
  });

  it.each([
    ['la receta del actor', { key: 'familia-crisis' }, recipe('abuela-familia')],
    ['la receta que eligió el docente', { key: 'npc-1', metadata: { recipeId: 'seguridad' } }, recipe('seguridad')],
    ['la plantilla vieja gana a su avatar copiado', { key: 'npc-2', metadata: { npcTemplateId: 'hombre-adulto', avatar: { gender: 'male' } } }, recipe('paciente-espera')],
    ['un avatar autorado', { key: 'npc-3', metadata: { avatar: { gender: 'male', hairStyle: 'largo' } } }, { kind: 'autorado', avatar: { gender: 'male', hairStyle: 'largo' } }],
    ['una receta inexistente cae al figurante', { key: 'npc-4', metadata: { recipeId: 'no-existe' } }, recipe('paciente-espera')],
    ['basura en metadata cae al figurante', { key: 'npc-5', metadata: 'basura' as never }, recipe('paciente-espera')],
    ['avatar null cae al figurante', { key: 'npc-6', metadata: { avatar: null } }, recipe('paciente-espera')],
    ['basura en el avatar cae al figurante', { key: 'npc-7', metadata: { avatar: 'basura' } }, recipe('paciente-espera')],
    ['basura en el avatar de un actor conocido cae a la receta del actor', { key: 'familia-crisis', metadata: { avatar: 7 } }, recipe('abuela-familia')],
    ['un avatar v2 del elenco no vale para un NPC', { key: 'npc-8', metadata: { avatar: { schemaVersion: 2, mode: 'elenco', recipeId: 'david', bata: false } } }, recipe('paciente-espera')],
  ])('persona del caso: %s', (_name, object, expected) => {
    expect(personCharacterRef(bundle, object)).toEqual(expected);
  });

  it('los figurantes usan la receta de respaldo del catálogo', () => {
    expect(extrasCharacterRef(bundle)).toEqual(recipe('paciente-espera'));
  });
});

describe('world-characters.util — énfasis de los marcadores', () => {
  const vector = { kitSprite: false, pixelSprite: false };

  it('un marcador vectorial crece y se aclara al acercarse o seleccionarlo', () => {
    expect(markerEmphasis({ selected: false, near: false, ...vector })).toEqual({ scale: 1, alpha: 0.88 });
    expect(markerEmphasis({ selected: false, near: true, ...vector })).toEqual({ scale: 1.08, alpha: 1 });
    expect(markerEmphasis({ selected: true, near: true, ...vector })).toEqual({ scale: 1.12, alpha: 1 });
  });

  it('un marcador con sprite de pixel art (puerta, herramienta, objeto) se aclara pero nunca se escala (spec §1.1.2)', () => {
    const sprite = { kitSprite: false, pixelSprite: true };
    expect(markerEmphasis({ selected: false, near: false, ...sprite })).toEqual({ scale: 1, alpha: 0.88 });
    expect(markerEmphasis({ selected: false, near: true, ...sprite })).toEqual({ scale: 1, alpha: 1 });
    expect(markerEmphasis({ selected: true, near: true, ...sprite })).toEqual({ scale: 1, alpha: 1 });
  });

  it('una persona del kit nunca se escala ni se atenúa (spec §8.2: sprites a escala 1, sin deformar)', () => {
    for (const selected of [false, true]) {
      for (const near of [false, true]) {
        expect(markerEmphasis({ selected, near, kitSprite: true, pixelSprite: false })).toEqual({ scale: 1, alpha: 1 });
      }
    }
  });

  it('un marcador de otra etapa (T9.9, F§7.2) se atenúa a DIMMED_ALPHA salvo cerca o seleccionado', () => {
    expect(DIMMED_ALPHA).toBe(0.55);
    expect(markerEmphasis({ selected: false, near: false, dimmed: true, ...vector }).alpha).toBe(DIMMED_ALPHA);
    expect(markerEmphasis({ selected: false, near: true, dimmed: true, ...vector }).alpha).toBe(1);
    expect(markerEmphasis({ selected: true, near: false, dimmed: true, ...vector }).alpha).toBe(1);
    expect(markerEmphasis({ selected: false, near: false, dimmed: false, ...vector }).alpha).toBe(0.88);
  });

  it('la persona del kit de otra etapa se atenúa igual (WAY-03) pero nunca se escala', () => {
    const person = { kitSprite: true, pixelSprite: false };
    expect(markerEmphasis({ selected: false, near: false, dimmed: true, ...person })).toEqual({ scale: 1, alpha: DIMMED_ALPHA });
    expect(markerEmphasis({ selected: false, near: true, dimmed: true, ...person })).toEqual({ scale: 1, alpha: 1 });
    expect(markerEmphasis({ selected: true, near: true, dimmed: true, ...person })).toEqual({ scale: 1, alpha: 1 });
  });
});
