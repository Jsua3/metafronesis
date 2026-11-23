import { Injectable, NgZone, inject } from '@angular/core';
import { Howl } from 'howler';
import { FADE_TICK_MS, fadeStep } from './audio-fade.util';
import type { Activation, Intensity } from '../../core/models/simulation.model';

export type MusicLayer = 'ambient' | 'tension' | 'resolution' | 'crisis';
export type SoundEffect =
  | 'footstep_tile'
  | 'footstep_wood'
  | 'door_open'
  | 'item_pickup'
  | 'ui_select'
  | 'ui_confirm'
  | 'ui_cancel'
  | 'dialogue_advance'
  | 'crisis_start'
  | 'session_complete';

interface StemTrack {
  howl: Howl;
  volume: number;
  targetVolume: number;
}

/**
 * Con una sola capa de música cargada (hoy solo `ambient`), bajarla o apagarla por la escena deja el
 * caso sin música justo en los momentos más tensos: las otras capas no existen para tomar el relevo.
 * Mientras sea la única, no baja de esta fracción de su volumen.
 */
const SINGLE_STEM_AMBIENT_FLOOR = 0.6;

/** Ganancia de efectos concretos respecto al volumen base de los SFX (recoger es un detalle, no un aviso). */
const SFX_GAIN: Partial<Record<SoundEffect, number>> = { item_pickup: 0.7 };

/**
 * Expuesta para pruebas: antes el test recargaba todo el módulo (reload dinámico) para forzar
 * esta detección con otro `Audio`. Vitest trata cualquier `import()` dinámico en un archivo con
 * `vi.mock()` como si fuera una llamada de mock fuera del alcance de nivel superior y rechaza el
 * archivo entero ("was defined outside of the module's top level scope"), así que la detección
 * se extrae a una función exportada que el test llama directamente con el `Audio` que simula.
 */
export function detectHtml5VolumeWorks(AudioCtor: typeof Audio): boolean {
  try {
    const probe = new AudioCtor();
    probe.volume = 0.5;
    return probe.volume === 0.5;
  } catch {
    return false;
  }
}


@Injectable({ providedIn: 'root' })
export class AudioDirectorService {
  private stems = new Map<MusicLayer, StemTrack>();
  private readonly zone = inject(NgZone);
  private sfx = new Map<SoundEffect, Howl>();
  private introLament?: Howl;
  private musicVolume = 0.42;
  private musicMuted = false;
  private sfxMuted = false;
  // Bajo a propósito: los SFX de UI acompañan, no protagonizan.
  private sfxVolume = 0.5;
  private fadeInterval?: number;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private initialized = false;
  /** iOS/iPadOS ignoran HTMLMediaElement.volume (siempre 1): allí se conserva Web Audio,
   *  que sí permite volumen, fundido y un bucle sin hueco. En el resto, HTML5 transmite la
   *  pista. Por instancia (no constante de módulo) para que los dobles de `Audio` en pruebas,
   *  fijados antes de crear el servicio, se detecten igual que `reducedMotion` arriba. */
  private readonly html5Works = detectHtml5VolumeWorks(window.Audio);

  /**
   * La música pesa unos 2,4 MB por pista. Con audio HTML5 basta con leer su cabecera al crearla: el navegador la transmite al
   * sonar y no la descarga entera antes de que la estudiante pueda caminar (en el aula, 30 equipos por el mismo Wi-Fi). Con
   * Web Audio (iOS) hace falta el archivo entero para decodificarlo, como antes.
   */
  private musicPreload(): boolean | 'metadata' {
    return this.html5Works ? 'metadata' : true;
  }

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Música adaptativa: el proyecto aún NO tiene stems propios (siep_*.ogg).
    // No se hace ninguna request hasta que existan los assets — los métodos de
    // música degradan a no-op cuando `stems` está vacío (sin 404 en consola).
    const stemFiles: Partial<Record<MusicLayer, string>> = {
      ambient: 'assets/game/audio/Musica_PsicoGame.mp3',
    };

    for (const [layer, src] of Object.entries(stemFiles) as [MusicLayer, string][]) {
      const howl = new Howl({
        src: [src],
        loop: true,
        volume: 0,
        preload: this.musicPreload(),
        // Pista de ~150 s. Con HTML5 se transmite; Web Audio la decodificaría entera (~50 MB de PCM).
        // Solo donde el navegador respeta el volumen del elemento; en iOS/iPadOS se queda en Web Audio.
        html5: this.html5Works,
        onloaderror: (_: number, err: unknown) => console.warn(`[AudioDirector] No se pudo cargar ${src}:`, err),
      });
      this.stems.set(layer, { howl, volume: 0, targetVolume: 0 });
    }

    // SFX mapeados a assets reales del pack Kenney UI Audio (CC0) ya presente.
    const base = 'assets/game/kenney/ui-audio/Audio';
    const sfxFiles: Record<SoundEffect, string> = {
      footstep_tile:    'assets/game/audio/footstep_concrete_000.ogg',
      footstep_wood:    'assets/game/audio/footstep_concrete_001.ogg',
      door_open:        `${base}/switch3.ogg`,
      item_pickup:      `${base}/rollover5.ogg`,
      ui_select:        `${base}/rollover1.ogg`,
      ui_confirm:       `${base}/click1.ogg`,
      ui_cancel:        `${base}/mouserelease1.ogg`,
      dialogue_advance: `${base}/click2.ogg`,
      crisis_start:     `${base}/switch13.ogg`,
      session_complete: `${base}/click5.ogg`,
    };

    for (const [key, src] of Object.entries(sfxFiles) as [SoundEffect, string][]) {
      this.sfx.set(key, new Howl({
        src: [src],
        volume: this.sfxVolume * (SFX_GAIN[key] ?? 1),
        mute: this.sfxMuted,
        preload: true,
        onloaderror: (_: number, err: unknown) => console.warn(`[AudioDirector] SFX error ${src}:`, err),
      }));
    }
  }

  playIntroLament(): void {
    if (!this.initialized || this.musicMuted) return;
    this.stems.forEach(stem => {
      stem.targetVolume = 0;
      stem.volume = 0;
      stem.howl.volume(0);
      stem.howl.pause();
    });
    if (!this.introLament) {
      this.introLament = new Howl({
        src: ['assets/game/audio/PsicoLament.mp3'],
        loop: true,
        volume: this.musicVolume,
        preload: this.musicPreload(),
        html5: this.html5Works,
        onloaderror: (_: number, err: unknown) => console.warn('[AudioDirector] No se pudo cargar PsicoLament:', err),
      });
    }
    this.introLament.volume(this.musicMuted ? 0 : this.musicVolume);
    if (!this.introLament.playing()) this.introLament.play();
  }

  stopIntroLament(): void {
    this.introLament?.stop();
  }

  /**
   * Las capas siguen a la escena y a la persona (nunca a una cifra): la intensidad de la escena elige la capa
   * (LOW = solo la calma; MEDIUM = la tensión a medias; HIGH = la tensión completa) y una persona en crisis
   * suma la capa de crisis. Un valor desconocido suena como una escena de intensidad media.
   */
  setScene(intensity: Intensity, activation: Activation): void {
    if (!this.initialized || this.stems.size === 0) return;

    if (activation === 'CRISIS') {
      this.setAmbientTarget(0);
      this.setTargetVolume('tension', 0.3);
      this.setTargetVolume('resolution', 0);
      this.setTargetVolume('crisis', 1.0);
    } else if (intensity === 'LOW') {
      this.setAmbientTarget(1.0);
      this.setTargetVolume('tension', 0);
      this.setTargetVolume('resolution', 0);
      this.setTargetVolume('crisis', 0);
    } else if (intensity === 'HIGH') {
      this.setAmbientTarget(0.2);
      this.setTargetVolume('tension', 1.0);
      this.setTargetVolume('resolution', 0);
      this.setTargetVolume('crisis', 0);
    } else {
      this.setAmbientTarget(0.75);
      this.setTargetVolume('tension', 0.5);
      this.setTargetVolume('resolution', 0);
      this.setTargetVolume('crisis', 0);
    }

    this.stems.forEach(stem => {
      if (!stem.howl.playing()) stem.howl.play();
    });
  }

  playResolution(): void {
    if (!this.initialized || this.stems.size === 0) return;
    const res = this.stems.get('resolution');
    if (res?.howl.playing()) return; // evita restart en llamadas múltiples
    this.setAmbientTarget(0.3);
    this.setTargetVolume('tension', 0);
    this.setTargetVolume('resolution', 1.0);
    this.setTargetVolume('crisis', 0);
    this.stems.get('resolution')?.howl.play();
  }

  playSfx(effect: SoundEffect): void {
    if (!this.initialized || this.sfxMuted) return;
    if (this.reducedMotion && (effect === 'footstep_tile' || effect === 'footstep_wood')) return;
    this.sfx.get(effect)?.play();
  }

  isMusicMuted(): boolean { return this.musicMuted; }

  isSfxMuted(): boolean { return this.sfxMuted; }

  toggleMusicMuted(): boolean {
    this.setMusicMuted(!this.musicMuted);
    return this.musicMuted;
  }

  toggleSfxMuted(): boolean {
    this.setSfxMuted(!this.sfxMuted);
    return this.sfxMuted;
  }

  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    this.introLament?.mute(muted);
    // El silencio no depende de volume(). En HTML5 Howler no toca el volumen del nodo
    // mientras está silenciado: por eso volume(0) va antes de mute(true), y mute(false)
    // antes de cualquier fundido posterior (setScene).
    if (muted) {
      this.stems.forEach(stem => {
        stem.targetVolume = 0;
        stem.volume = 0;
        stem.howl.volume(0);
        stem.howl.mute(true);
      });
    } else {
      this.stems.forEach(stem => stem.howl.mute(false));
    }
  }

  setSfxMuted(muted: boolean): void {
    this.sfxMuted = muted;
    this.sfx.forEach(howl => howl.mute(muted));
  }

  pause(): void { this.stems.forEach(s => s.howl.pause()); }

  resume(): void {
    this.stems.forEach(s => {
      try {
        if (!s.howl.playing()) s.howl.play();
      } catch {
        // Browsers can close the WebAudio context after route changes or teardown.
      }
    });
  }

  stopAll(): void {
    this.introLament?.stop();
    this.stems.forEach(s => s.howl.stop());
    this.stopFadeLoop();
  }

  dispose(): void {
    this.stopAll();
    this.introLament?.unload();
    this.introLament = undefined;
    this.stems.forEach(s => s.howl.unload());
    this.sfx.forEach(h => h.unload());
    this.stems.clear();
    this.sfx.clear();
    this.initialized = false;
  }

  /** Volumen pedido a `ambient`, con el piso de {@link SINGLE_STEM_AMBIENT_FLOOR} mientras sea la única capa. */
  private setAmbientTarget(wanted: number): void {
    this.setTargetVolume('ambient', this.stems.size === 1 ? Math.max(wanted, SINGLE_STEM_AMBIENT_FLOOR) : wanted);
  }

  private setTargetVolume(layer: MusicLayer, vol: number): void {
    const stem = this.stems.get(layer);
    if (!stem) return;
    stem.targetVolume = this.musicMuted ? 0 : vol * this.musicVolume;
    this.ensureFadeLoop();
  }

  /** Fuera de la zona: un setInterval dentro de ella dispararía la detección
   *  de cambios de toda la app 30 veces por segundo. */
  private ensureFadeLoop(): void {
    if (this.fadeInterval !== undefined) return;
    this.zone.runOutsideAngular(() => {
      this.fadeInterval = window.setInterval(() => this.fadeTick(), FADE_TICK_MS);
    });
  }

  private fadeTick(): void {
    let fading = false;
    this.stems.forEach(stem => {
      const next = fadeStep(stem.volume, stem.targetVolume);
      if (next !== stem.volume) {
        stem.volume = next;
        stem.howl.volume(Math.max(0, Math.min(1, next)));
      }
      if (next !== stem.targetVolume) fading = true;
    });
    if (!fading) this.stopFadeLoop();
  }

  private stopFadeLoop(): void {
    if (this.fadeInterval === undefined) return;
    window.clearInterval(this.fadeInterval);
    this.fadeInterval = undefined;
  }
}
