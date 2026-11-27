import { Injectable, signal } from '@angular/core';

export const DPAD_STORAGE_KEY = 'siep.cruceta.v1';

/** Preferencia local; si el almacenamiento está bloqueado dura solo la sesión. */
@Injectable({ providedIn: 'root' })
export class DpadSettings {
  readonly visible = signal(this.read());

  toggle(): void {
    const visible = !this.visible();
    this.visible.set(visible);
    try { localStorage.setItem(DPAD_STORAGE_KEY, visible ? '1' : '0'); } catch { /* Sin almacenamiento. */ }
  }

  private read(): boolean {
    try { return localStorage.getItem(DPAD_STORAGE_KEY) === '1'; } catch { return false; }
  }
}
