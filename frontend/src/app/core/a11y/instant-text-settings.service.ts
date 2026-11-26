import { Injectable, signal } from '@angular/core';

/** Clave del ajuste en el almacenamiento local: por navegador, sin identificadores de persona. */
export const INSTANT_TEXT_STORAGE_KEY = 'siep.texto-instantaneo.v1';

/**
 * «Texto instantáneo» (plan P8): las líneas de un diálogo aparecen completas, sin la máquina de escribir. Apagado por
 * defecto: el ritmo letra a letra es parte del juego, pero quien lee con dislexia, con lector de pantalla o con prisa lo
 * enciende en los ajustes y se recuerda. «Reducir movimiento» (preferencia del sistema o interruptor del juego) ya lo
 * implica sin tocar este ajuste. Como «Atajos de una tecla»: un almacenamiento bloqueado (modo privado, política) nunca
 * rompe el juego; vale el valor por defecto y el cambio dura la sesión.
 */
@Injectable({ providedIn: 'root' })
export class InstantTextSettings {
  private readonly state = signal(readStored());

  /** true = el texto de los diálogos aparece de golpe. */
  readonly enabled = this.state.asReadonly();

  set(value: boolean): void {
    this.state.set(value);
    try {
      localStorage.setItem(INSTANT_TEXT_STORAGE_KEY, value ? 'on' : 'off');
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
    return localStorage.getItem(INSTANT_TEXT_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}
