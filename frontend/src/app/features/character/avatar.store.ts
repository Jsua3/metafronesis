import { Injectable, Optional, computed, signal } from '@angular/core';

import { AvatarV2, defaultAvatarV2, parseStoredAvatar, serializeAvatarV2 } from './kit/avatar-v2';

/** Clave compartida de persistencia del avatar (la lee también el runtime Phaser). */
export const AVATAR_STORAGE_KEY = 'psychosim_avatar';
/** Copia del texto v1 original, guardada una sola vez al migrar (spec §9.1). */
export const AVATAR_V1_BACKUP_KEY = 'psychosim_avatar_v1';

/** Forma canónica para comparar: claves en orden y accesorios sin orden (el editor puede crearlos en otro). */
function canonical(avatar: AvatarV2): string {
  const copy: Record<string, unknown> = { ...avatar };
  if (Array.isArray(copy['accessories'])) copy['accessories'] = [...(copy['accessories'] as string[])].sort();
  return JSON.stringify(copy, Object.keys(copy).sort());
}

@Injectable({ providedIn: 'root' })
export class AvatarStore {
  private readonly store: Storage | null;
  private readonly _avatar = signal<AvatarV2>(defaultAvatarV2());
  /** Lo último guardado (o leído): contra eso se miden los cambios sin guardar. */
  private readonly _saved = signal<AvatarV2>(defaultAvatarV2());
  readonly avatar = this._avatar.asReadonly();
  /** Hay cambios sin guardar (plan visual F5-4: el editor lo dice y pregunta antes de salir). */
  readonly dirty = computed(() => canonical(this._avatar()) !== canonical(this._saved()));

  /**
   * `storage` es opcional y solo lo usan las pruebas. Bajo la DI de Angular no hay proveedor de
   * `Storage`: `@Optional()` hace que el inyector pase `null` y se usa `window.localStorage`.
   */
  constructor(@Optional() storage?: Storage) {
    this.store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    this.loadSaved();
  }

  /** Lee lo guardado; un v1 se migra, se reescribe en v2 y su texto original queda en la copia. */
  loadSaved(): void {
    const { avatar, legacyRaw } = parseStoredAvatar(this.safeGet(AVATAR_STORAGE_KEY));
    this._avatar.set(avatar);
    this._saved.set(avatar);
    if (legacyRaw === null) return;
    if (this.safeGet(AVATAR_V1_BACKUP_KEY) === null) this.safeSet(AVATAR_V1_BACKUP_KEY, legacyRaw);
    this.safeSet(AVATAR_STORAGE_KEY, serializeAvatarV2(avatar));
  }

  set(avatar: AvatarV2): void {
    this._avatar.set(avatar);
  }

  save(): void {
    this.safeSet(AVATAR_STORAGE_KEY, serializeAvatarV2(this._avatar()));
    this._saved.set(this._avatar());
  }

  reset(): void {
    this._avatar.set(defaultAvatarV2());
  }

  /** Descarta los cambios sin guardar: vuelve a lo último guardado. */
  revert(): void {
    this._avatar.set(this._saved());
  }

  private safeGet(key: string): string | null {
    try { return this.store?.getItem(key) ?? null; } catch { return null; }
  }

  private safeSet(key: string, value: string): void {
    try { this.store?.setItem(key, value); } catch { /* cuota o modo privado: no-op */ }
  }
}
