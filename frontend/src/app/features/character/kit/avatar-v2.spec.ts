import { readFileSync } from 'fs';
import { join } from 'path';

import {
  ACCESSORIES,
  AvatarV2,
  COMPLEXIONS,
  HAIRS,
  HAIR_COLORS,
  OUTFIT_IDS,
  PLAYABLE_IDS,
  SKINS,
  authoredAvatarV2,
  avatarFingerprint,
  coerceAvatarV2,
  defaultAvatarV2,
  migrateAvatarV1,
  parseStoredAvatar,
  serializeAvatarV2,
  toAvatarV2,
} from './avatar-v2';

const kit = JSON.parse(readFileSync(join(__dirname, '../../../../assets/characters/kit/kit.json'), 'utf8'));
const P = { schemaVersion: 2, mode: 'personalizado' } as const;
const BASE = { ...P, complexion: 'a', skin: 'piel-2', hair: 'corto-liso', hairColor: 'negro', accessories: [], bata: false };

describe('avatar v2', () => {
  it('las listas del avatar son el espejo de catalog.editor y catalog.playables', () => {
    const ed = kit.catalog.editor;
    expect([...PLAYABLE_IDS]).toEqual(kit.catalog.playables);
    expect([...COMPLEXIONS]).toEqual(ed.complexions);
    expect([...SKINS]).toEqual(ed.skins);
    expect([...HAIRS]).toEqual(ed.hair);
    expect([...HAIR_COLORS]).toEqual(ed.hairColors);
    expect([...ACCESSORIES]).toEqual(ed.accessories);
    expect(Object.values(OUTFIT_IDS).sort()).toEqual(ed.outfits.map((o: { id: string }) => o.id).sort());
  });

  it('por defecto: Valentina sin bata', () => {
    expect(defaultAvatarV2()).toEqual({ schemaVersion: 2, mode: 'elenco', recipeId: 'valentina', bata: false });
  });

  it.each([
    ['castId del elenco', { castId: 'david' }, { schemaVersion: 2, mode: 'elenco', recipeId: 'david', bata: false }],
    ['castId del elenco con bata', { castId: 'paula', uniform: 'con-bata' }, { schemaVersion: 2, mode: 'elenco', recipeId: 'paula', bata: true }],
    ['sin castId: lo que v1 tenía por defecto', {}, BASE],
    ['castId inválido: personalizado con lo demás traducido',
      { castId: 'no-existe', gender: 'male', skinTone: 'morena', hairStyle: 'medio', fringe: true, hairColor: 'rojizo', accessory: 'pin', uniform: 'con-bata', clothingColor: 'green', mouth: 'happy' },
      { ...P, complexion: 'b', skin: 'piel-5', hair: 'bob-flequillo', hairColor: 'cobrizo', accessories: ['gafete'], bata: true }],
    ['medio sin flequillo es media melena; gris es canoso; oscura es piel-6',
      { hairStyle: 'medio', hairColor: 'gris', skinTone: 'oscura', accessory: 'gafas' },
      { ...BASE, skin: 'piel-6', hair: 'media-melena', hairColor: 'canoso', accessories: ['gafas'] }],
    ['porcelana, largo, rubio', { skinTone: 'porcelana', hairStyle: 'largo', hairColor: 'rubio' }, { ...BASE, skin: 'piel-1', hair: 'largo-suelto', hairColor: 'rubio' }],
    ['media, recogido, castaño', { skinTone: 'media', hairStyle: 'recogido', hairColor: 'castano' }, { ...BASE, skin: 'piel-3', hair: 'mono', hairColor: 'castano' }],
    ['sin cabello es rapado', { hairStyle: 'ninguno' }, { ...BASE, hair: 'rapado' }],
    ['tipos raros caen al valor por defecto', { gender: 7, skinTone: null, hairStyle: ['x'], accessory: {}, uniform: true }, BASE],
  ])('migrateAvatarV1: %s', (_name, v1, v2) => {
    expect(migrateAvatarV1(v1)).toEqual(v2);
  });

  it('coerceAvatarV2 valida campo por campo', () => {
    expect(coerceAvatarV2({ schemaVersion: 2, mode: 'elenco', recipeId: 'abuela-familia', bata: 'si' })).toEqual(defaultAvatarV2());
    expect(coerceAvatarV2({
      schemaVersion: 2, mode: 'personalizado', complexion: 'c', skin: 'piel-4', hair: 'afro', hairColor: 'verde',
      accessories: ['gafete', 'gafas', 'gafas', 'sombrero'], bata: true,
    })).toEqual({ ...P, complexion: 'a', skin: 'piel-4', hair: 'afro', hairColor: 'negro', accessories: ['gafas', 'gafete'], bata: true });
    expect(coerceAvatarV2({ schemaVersion: 2, mode: 'otro' })).toEqual(defaultAvatarV2());
    expect(coerceAvatarV2('texto')).toEqual(defaultAvatarV2());
  });

  it('toAvatarV2 acepta v1 o v2, descarta versiones desconocidas y es idempotente', () => {
    expect(toAvatarV2({ schemaVersion: 3, mode: 'elenco', recipeId: 'luisa' })).toEqual(defaultAvatarV2());
    const samples: unknown[] = [
      { castId: 'david', uniform: 'con-bata' }, { hairStyle: 'medio', fringe: true }, defaultAvatarV2(),
      { schemaVersion: 2, mode: 'personalizado', hair: 'trenza' }, null, 42, [],
    ];
    for (const sample of samples) {
      const once = toAvatarV2(sample);
      expect(toAvatarV2(once)).toEqual(once);
      expect(toAvatarV2(JSON.parse(serializeAvatarV2(once)))).toEqual(once);
    }
  });

  it('parseStoredAvatar: vacío, roto, v2, v1 (con el texto original para la copia) y versión futura', () => {
    expect(parseStoredAvatar(null)).toEqual({ avatar: defaultAvatarV2(), legacyRaw: null });
    expect(parseStoredAvatar('{no es json')).toEqual({ avatar: defaultAvatarV2(), legacyRaw: null });
    const v2 = serializeAvatarV2({ schemaVersion: 2, mode: 'elenco', recipeId: 'luisa', bata: true });
    expect(parseStoredAvatar(v2)).toEqual({ avatar: { schemaVersion: 2, mode: 'elenco', recipeId: 'luisa', bata: true }, legacyRaw: null });
    const v1 = JSON.stringify({ castId: 'mateo', uniform: 'sin-bata' });
    expect(parseStoredAvatar(v1)).toEqual({ avatar: { schemaVersion: 2, mode: 'elenco', recipeId: 'mateo', bata: false }, legacyRaw: v1 });
    expect(parseStoredAvatar('{"schemaVersion":3}')).toEqual({ avatar: defaultAvatarV2(), legacyRaw: null });
  });

  it('avatarFingerprint: igual para lo mismo, distinta si cambia algo que se ve', () => {
    const a: AvatarV2 = { ...P, complexion: 'b', skin: 'piel-3', hair: 'afro', hairColor: 'negro', accessories: ['gafas', 'gafete'], bata: false };
    expect(avatarFingerprint(a)).toMatch(/^[0-9a-f]{8}$/);
    expect(avatarFingerprint(a)).toBe(avatarFingerprint({ ...a, accessories: ['gafete', 'gafas'] }));
    expect(avatarFingerprint(a)).not.toBe(avatarFingerprint({ ...a, bata: true }));
    expect(avatarFingerprint(a)).not.toBe(avatarFingerprint({ ...a, hair: 'trenza' }));
  });
});

describe('authoredAvatarV2: el avatar de un NPC autorado en el editor de mundo (spec §9.2)', () => {
  // El editor viejo armaba metadata.avatar con `{ ...defaultAvatar(), … }`, y defaultAvatar() traía
  // `castId: 'valentina'`; el render viejo de las personas del caso lo ignoraba (siempre modular).
  const v1Autorado = {
    castId: 'valentina', gender: 'male', clothingColor: 'blue', skinTone: 'morena', hairStyle: 'corto', hairColor: 'gris',
    fringe: false, eyes: 'atentos', brows: 'rectas', mouth: 'neutral', accessory: 'ninguno', uniform: 'sin-bata',
  };

  it('un v1 conserva sus rasgos: el castId heredado no lo convierte en un jugable', () => {
    expect(authoredAvatarV2(v1Autorado)).toEqual({
      schemaVersion: 2, mode: 'personalizado', complexion: 'b', skin: 'piel-5', hair: 'corto-liso', hairColor: 'canoso', accessories: [], bata: false,
    });
  });

  it('un v2 personalizado se valida campo a campo', () => {
    expect(authoredAvatarV2({ ...P, hair: 'afro', skin: 'no-existe', bata: true })).toEqual({
      ...P, complexion: 'a', skin: 'piel-2', hair: 'afro', hairColor: 'negro', accessories: [], bata: true,
    });
  });

  it.each([
    ['texto', 'basura'],
    ['número', 7],
    ['lista', []],
    ['null', null],
    ['un v2 del elenco', { schemaVersion: 2, mode: 'elenco', recipeId: 'david', bata: false }],
    ['otra versión', { schemaVersion: 3, mode: 'personalizado' }],
  ])('%s no es un avatar autorado: null (el NPC cae a su receta o al figurante)', (_name, value) => {
    expect(authoredAvatarV2(value)).toBeNull();
  });
});
