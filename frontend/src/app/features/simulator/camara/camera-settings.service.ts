import { Injectable, computed, signal } from '@angular/core';

/** Clave del ajuste en el almacenamiento local: por navegador, sin identificadores de persona. */
export const CAMERA_STORAGE_KEY = 'siep.camara.v1';

interface Guardado { v: 1; cercana: boolean; auto: boolean }

const POR_DEFECTO: Guardado = { v: 1, cercana: false, auto: true };

/**
 * Ajustes de la cámara del juego (bloque M1):
 * - «Vista cercana»: la cámara sigue al personaje de cerca, para quien ve poco. La alternan Z y su botón.
 * - «Acercamiento automático»: la cámara se acerca al hablar, al revisar un objeto y durante la reacción. Encendido
 *   por defecto; se apaga en los ajustes.
 * Como «Atajos de una tecla»: un almacenamiento bloqueado (modo privado, política) nunca rompe el juego; valen los
 * valores por defecto y el cambio dura la sesión.
 */
@Injectable({ providedIn: 'root' })
export class CameraSettings {
  private readonly state = signal<Guardado>(leer());

  readonly cercana = computed(() => this.state().cercana);
  readonly acercarAuto = computed(() => this.state().auto);

  setCercana(value: boolean): void {
    this.guardar({ ...this.state(), cercana: value });
  }

  toggleCercana(): void {
    this.setCercana(!this.state().cercana);
  }

  setAcercarAuto(value: boolean): void {
    this.guardar({ ...this.state(), auto: value });
  }

  private guardar(next: Guardado): void {
    this.state.set(next);
    try {
      localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Sin almacenamiento el ajuste vale solo en esta sesión.
    }
  }
}

function leer(): Guardado {
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    if (!raw) return POR_DEFECTO;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const { v, cercana, auto } = parsed as Record<string, unknown>;
      if (v === 1 && typeof cercana === 'boolean' && typeof auto === 'boolean') return { v: 1, cercana, auto };
    }
    return POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
}
