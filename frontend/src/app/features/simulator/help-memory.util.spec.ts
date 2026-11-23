import {
  HELP_FIRST_CARD, HELP_MEMORY_VERSION, HELP_STORAGE_KEY, markHelpSeen, readHelpSeen, resetHelpSeen,
} from './help-memory.util';

class MemoryStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

describe('help-memory.util', () => {
  beforeEach(() => resetHelpSeen(new MemoryStorage()));

  it('usa la clave y el esquema del diseño: {"v":1,"vistas":["primero"]}, sin identificadores ni fechas', () => {
    const storage = new MemoryStorage();
    markHelpSeen(HELP_FIRST_CARD, storage);
    expect(HELP_STORAGE_KEY).toBe('siep.ayuda.v1');
    expect(storage.data.get('siep.ayuda.v1')).toBe('{"v":1,"vistas":["primero"]}');
    expect(JSON.parse(storage.data.get(HELP_STORAGE_KEY)!)).toEqual({ v: HELP_MEMORY_VERSION, vistas: ['primero'] });
  });

  it('empieza vacío y recuerda lo marcado, sin duplicar', () => {
    const storage = new MemoryStorage();
    expect([...readHelpSeen(storage)]).toEqual([]);
    markHelpSeen('primero', storage);
    markHelpSeen('primero', storage);
    markHelpSeen('otra', storage);
    expect([...readHelpSeen(storage)]).toEqual(['primero', 'otra']);
    expect(JSON.parse(storage.data.get(HELP_STORAGE_KEY)!).vistas).toEqual(['primero', 'otra']);
  });

  it('una versión distinta reactiva la ayuda; el JSON dañado o con otra forma cuenta como vacío', () => {
    const storage = new MemoryStorage();
    for (const raw of [
      '{"v":2,"vistas":["primero"]}', '{"v":0,"vistas":["primero"]}', '{"vistas":["primero"]}', '{"v":1}',
      '{"v":1,"vistas":"primero"}', 'no es json', '[]', 'null', '""', '',
    ]) {
      storage.setItem(HELP_STORAGE_KEY, raw);
      expect([...readHelpSeen(storage)]).toEqual([]);
    }
    storage.setItem(HELP_STORAGE_KEY, '{"v":1,"vistas":["primero",7,"",null,"otra"]}');
    expect([...readHelpSeen(storage)]).toEqual(['primero', 'otra']);
  });

  it('con getItem que lanza no se rompe: respaldo en memoria', () => {
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect([...readHelpSeen(broken)]).toEqual([]);
    expect(() => markHelpSeen('primero', broken)).not.toThrow();
    expect([...readHelpSeen(broken)]).toEqual(['primero']);
    // El respaldo vale para la sesión aunque luego se lea con otro almacenamiento.
    expect(readHelpSeen(new MemoryStorage()).has('primero')).toBe(true);
  });

  it('con setItem que lanza (cuota llena) lo marcado se recuerda en memoria', () => {
    const storage = new MemoryStorage();
    const full = { getItem: storage.getItem.bind(storage), setItem: () => { throw new Error('cuota'); } };
    markHelpSeen('primero', full);
    expect(readHelpSeen(full).has('primero')).toBe(true);
    expect(storage.data.size).toBe(0);
  });

  it('si el almacenamiento vuelve a funcionar, lo recordado en memoria se guarda y deja de depender de ella', () => {
    const storage = new MemoryStorage();
    const flaky = { getItem: storage.getItem.bind(storage), setItem: () => { throw new Error('cuota'); } };
    markHelpSeen('primero', flaky);
    markHelpSeen('otra', storage);
    expect(JSON.parse(storage.data.get(HELP_STORAGE_KEY)!).vistas.sort()).toEqual(['otra', 'primero']);
    resetHelpSeen(storage);
    expect([...readHelpSeen(storage)]).toEqual([]);
  });

  it('resetHelpSeen borra el navegador y la memoria («Ver la ayuda otra vez»)', () => {
    const storage = new MemoryStorage();
    markHelpSeen('primero', storage);
    resetHelpSeen(storage);
    expect(storage.data.has(HELP_STORAGE_KEY)).toBe(false);
    expect([...readHelpSeen(storage)]).toEqual([]);
    const broken = { removeItem: () => { throw new Error('bloqueado'); } };
    expect(() => resetHelpSeen(broken)).not.toThrow();
  });

  it('sin almacenamiento inyectado usa localStorage y no se rompe si falta o lanza', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    try {
      Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new Error('SecurityError'); } });
      expect(() => readHelpSeen()).not.toThrow();
      markHelpSeen('primero');
      expect(readHelpSeen().has('primero')).toBe(true);
      resetHelpSeen();
      expect(readHelpSeen().has('primero')).toBe(false);
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
    markHelpSeen('primero');
    expect(JSON.parse(window.localStorage.getItem(HELP_STORAGE_KEY)!)).toEqual({ v: 1, vistas: ['primero'] });
    resetHelpSeen();
    expect(window.localStorage.getItem(HELP_STORAGE_KEY)).toBeNull();
  });

  it('ignora un identificador vacío', () => {
    const storage = new MemoryStorage();
    markHelpSeen('', storage);
    expect(storage.data.size).toBe(0);
  });
});
