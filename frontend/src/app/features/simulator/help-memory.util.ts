/**
 * Memoria de la ayuda de primera vez: qué tarjetas ya se vieron en ESTE navegador.
 * Esquema {"v":1,"vistas":["primero"]} en localStorage `siep.ayuda.v1`: sin identificadores,
 * sin fechas ni preferencias de accesibilidad. Subir `v` reactiva la ayuda para todos.
 * Cada lectura y escritura va en try/catch (modo privado, almacenamiento bloqueado) y lo que
 * no se pudo guardar se recuerda en memoria durante la sesión.
 */
export const HELP_STORAGE_KEY = 'siep.ayuda.v1';
export const HELP_MEMORY_VERSION = 1;
/** Identificador de la tarjeta de primera vez. */
export const HELP_FIRST_CARD = 'primero';

/** Lo que el almacenamiento no aceptó (o todo, si no existe): vive lo que dura la pestaña. */
const unsaved = new Set<string>();

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // acceder a localStorage puede lanzar SecurityError
  }
}

function parseSeen(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return [];
    const record = data as { v?: unknown; vistas?: unknown };
    if (record.v !== HELP_MEMORY_VERSION || !Array.isArray(record.vistas)) return [];
    return record.vistas.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

export function readHelpSeen(storage?: Pick<Storage, 'getItem'>): ReadonlySet<string> {
  const seen = new Set(unsaved);
  try {
    const source = storage ?? defaultStorage();
    for (const id of parseSeen(source ? source.getItem(HELP_STORAGE_KEY) : null)) seen.add(id);
  } catch {
    // Sin lectura: vale lo recordado en memoria.
  }
  return seen;
}

export function markHelpSeen(id: string, storage?: Pick<Storage, 'getItem' | 'setItem'>): void {
  if (!id) return;
  const seen = new Set(readHelpSeen(storage));
  seen.add(id);
  try {
    const target = storage ?? defaultStorage();
    if (!target) throw new Error('sin almacenamiento');
    target.setItem(HELP_STORAGE_KEY, JSON.stringify({ v: HELP_MEMORY_VERSION, vistas: [...seen] }));
    unsaved.delete(id);
  } catch {
    unsaved.add(id);
  }
}

/** «Ver la ayuda otra vez» (Ajustes): olvida lo visto, en el navegador y en memoria. */
export function resetHelpSeen(storage?: Pick<Storage, 'removeItem'>): void {
  unsaved.clear();
  try {
    (storage ?? defaultStorage())?.removeItem(HELP_STORAGE_KEY);
  } catch {
    // Nada que borrar si el almacenamiento no responde.
  }
}
