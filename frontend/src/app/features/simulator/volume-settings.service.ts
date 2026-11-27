import { Injectable, signal } from '@angular/core';

/** Clave del ajuste en el almacenamiento local: por navegador, sin identificadores de persona. */
export const VOLUME_STORAGE_KEY = 'siep.volumen.v1';
/** Escalones de las barras de volumen: 0 (sin sonido) a 10 (el máximo). */
export const VOLUME_STEPS = 10;
/** Nivel de partida: el volumen que el juego tenía antes de que hubiera barras. */
export const VOLUME_DEFAULT_LEVEL = 6;

interface StoredVolume {
  music: number;
  sfx: number;
  musicMuted: boolean;
  sfxMuted: boolean;
}

const DEFAULTS: StoredVolume = { music: VOLUME_DEFAULT_LEVEL, sfx: VOLUME_DEFAULT_LEVEL, musicMuted: false, sfxMuted: false };

/** Un nivel válido de las barras (entero entre 0 y {@link VOLUME_STEPS}). */
export function clampVolumeLevel(level: number): number {
  if (!Number.isFinite(level)) return VOLUME_DEFAULT_LEVEL;
  return Math.min(VOLUME_STEPS, Math.max(0, Math.round(level)));
}

/**
 * Volumen de la música y de los sonidos de acciones, con su silencio, recordados entre sesiones. Como «Texto
 * instantáneo»: un almacenamiento bloqueado (modo privado, política) nunca rompe el juego; vale el valor por defecto
 * y el cambio dura la sesión.
 */
@Injectable({ providedIn: 'root' })
export class VolumeSettings {
  private readonly stored = readStored();
  private readonly music = signal(this.stored.music);
  private readonly sfx = signal(this.stored.sfx);
  private readonly musicSilenced = signal(this.stored.musicMuted);
  private readonly sfxSilenced = signal(this.stored.sfxMuted);

  readonly musicLevel = this.music.asReadonly();
  readonly sfxLevel = this.sfx.asReadonly();
  readonly musicMuted = this.musicSilenced.asReadonly();
  readonly sfxMuted = this.sfxSilenced.asReadonly();

  setMusicLevel(level: number): void { this.music.set(clampVolumeLevel(level)); this.save(); }
  setSfxLevel(level: number): void { this.sfx.set(clampVolumeLevel(level)); this.save(); }
  setMusicMuted(muted: boolean): void { this.musicSilenced.set(muted); this.save(); }
  setSfxMuted(muted: boolean): void { this.sfxSilenced.set(muted); this.save(); }

  private save(): void {
    const value: StoredVolume = { music: this.music(), sfx: this.sfx(), musicMuted: this.musicSilenced(), sfxMuted: this.sfxSilenced() };
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Sin almacenamiento el ajuste vale solo en esta sesión.
    }
  }
}

function readStored(): StoredVolume {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<StoredVolume>;
    return {
      music: clampVolumeLevel(typeof parsed.music === 'number' ? parsed.music : DEFAULTS.music),
      sfx: clampVolumeLevel(typeof parsed.sfx === 'number' ? parsed.sfx : DEFAULTS.sfx),
      musicMuted: parsed.musicMuted === true,
      sfxMuted: parsed.sfxMuted === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}
