import { Injectable, signal } from '@angular/core';

/** Clave del ajuste en el almacenamiento local: por navegador, sin identificadores de persona. */
export const SHORTCUTS_STORAGE_KEY = 'siep.atajos.v1';

/**
 * «Atajos de una tecla» (plan visual F6-10; H-07; WCAG 2.1.4, VD-18): las teclas de una letra o un número que hacen
 * algo (J, E, WASD, los números de las opciones del diálogo y A/D/E del lobby). Activas por defecto y se pueden
 * apagar: flechas, Enter, Espacio y Esc no dependen de este ajuste. Un almacenamiento bloqueado (modo privado,
 * política) nunca rompe el juego: vale el valor por defecto y el cambio dura la sesión.
 */
@Injectable({ providedIn: 'root' })
export class ShortcutSettings {
  private readonly state = signal(readStored());

  /** true = los atajos de una tecla actúan. */
  readonly enabled = this.state.asReadonly();

  set(value: boolean): void {
    this.state.set(value);
    try {
      localStorage.setItem(SHORTCUTS_STORAGE_KEY, value ? 'on' : 'off');
    } catch {
      // Sin almacenamiento el ajuste vale solo en esta sesión.
    }
  }

  toggle(): void {
    this.set(!this.state());
  }
}

function readStored(): boolean {
  try {
    return localStorage.getItem(SHORTCUTS_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}
