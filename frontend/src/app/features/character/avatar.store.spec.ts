import { AVATAR_STORAGE_KEY, AVATAR_V1_BACKUP_KEY, AvatarStore } from './avatar.store';
import { defaultAvatarV2, serializeAvatarV2 } from './kit/avatar-v2';

function mockStorage(initial: Record<string, string> = {}): Storage {
  const m = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => m.has(k) ? m.get(k)! : null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

describe('AvatarStore (formato 2)', () => {
  it('sin nada guardado, el valor por defecto', () => {
    expect(new AvatarStore(mockStorage()).avatar()).toEqual(defaultAvatarV2());
  });

  it('se puede construir sin Storage (camino de DI) sin lanzar', () => {
    expect(() => new AvatarStore()).not.toThrow();
  });

  it('un v1 guardado se migra, se reescribe en v2 y su texto original queda en la copia', () => {
    const v1 = JSON.stringify({ castId: 'mateo', uniform: 'con-bata', hairStyle: 'largo' });
    const storage = mockStorage({ [AVATAR_STORAGE_KEY]: v1 });
    const store = new AvatarStore(storage);
    expect(store.avatar()).toEqual({ schemaVersion: 2, mode: 'elenco', recipeId: 'mateo', bata: true });
    expect(storage.getItem(AVATAR_V1_BACKUP_KEY)).toBe(v1);
    expect(JSON.parse(storage.getItem(AVATAR_STORAGE_KEY)!)).toEqual(store.avatar());
  });

  it('la copia v1 se guarda una sola vez (no la pisa una segunda migración)', () => {
    const storage = mockStorage({ [AVATAR_STORAGE_KEY]: JSON.stringify({ castId: 'david' }), [AVATAR_V1_BACKUP_KEY]: 'original' });
    new AvatarStore(storage);
    expect(storage.getItem(AVATAR_V1_BACKUP_KEY)).toBe('original');
  });

  it('un v2 corrupto o de otra versión carga el valor por defecto y no toca lo guardado', () => {
    const storage = mockStorage({ [AVATAR_STORAGE_KEY]: '{"schemaVersion":3,"mode":"elenco"}' });
    expect(new AvatarStore(storage).avatar()).toEqual(defaultAvatarV2());
    expect(storage.getItem(AVATAR_STORAGE_KEY)).toBe('{"schemaVersion":3,"mode":"elenco"}');
    expect(storage.getItem(AVATAR_V1_BACKUP_KEY)).toBeNull();
  });

  it('set no guarda hasta save; reset vuelve al valor por defecto sin borrar lo guardado', () => {
    const storage = mockStorage();
    const store = new AvatarStore(storage);
    const luisa = { schemaVersion: 2, mode: 'elenco', recipeId: 'luisa', bata: true } as const;
    store.set(luisa);
    expect(storage.getItem(AVATAR_STORAGE_KEY)).toBeNull();
    store.save();
    expect(storage.getItem(AVATAR_STORAGE_KEY)).toBe(serializeAvatarV2(luisa));
    store.reset();
    expect(store.avatar()).toEqual(defaultAvatarV2());
    expect(storage.getItem(AVATAR_STORAGE_KEY)).toBe(serializeAvatarV2(luisa));
  });

  // req: BLOQUE-H (aviso de cambios sin guardar, plan visual F5-4)
  it('dirty: falso al cargar, verdadero tras un cambio y falso tras guardar o al volver a lo guardado', () => {
    const store = new AvatarStore(mockStorage());
    expect(store.dirty()).toBe(false);
    store.set({ schemaVersion: 2, mode: 'elenco', recipeId: 'luisa', bata: false });
    expect(store.dirty()).toBe(true);
    store.save();
    expect(store.dirty()).toBe(false);
    store.reset();
    expect(store.dirty()).toBe(true);
    store.revert();
    expect(store.avatar()).toEqual({ schemaVersion: 2, mode: 'elenco', recipeId: 'luisa', bata: false });
    expect(store.dirty()).toBe(false);
  });

  it('dirty no se deja engañar por el orden de las claves ni de los accesorios', () => {
    const saved = { schemaVersion: 2, mode: 'personalizado', complexion: 'a', skin: 'piel-1', hair: 'afro', hairColor: 'negro', accessories: ['gafas', 'gafete'], bata: false };
    const store = new AvatarStore(mockStorage({ [AVATAR_STORAGE_KEY]: JSON.stringify(saved) }));
    store.set({ bata: false, accessories: ['gafete', 'gafas'], hairColor: 'negro', hair: 'afro', skin: 'piel-1', complexion: 'a', mode: 'personalizado', schemaVersion: 2 } as never);
    expect(store.dirty()).toBe(false);
  });

  it('si el almacenamiento falla (cuota, modo privado), no rompe', () => {
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cuota'); } } as unknown as Storage;
    const store = new AvatarStore(broken);
    expect(store.avatar()).toEqual(defaultAvatarV2());
    expect(() => store.save()).not.toThrow();
  });
});
