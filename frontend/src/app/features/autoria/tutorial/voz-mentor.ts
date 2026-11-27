import { inject, signal } from '@angular/core';
import { Howl } from 'howler';

import { InstantTextSettings } from '../../../core/a11y/instant-text-settings.service';
import { volumeForLevel } from '../../simulator/audio-director.service';
import { MS_POR_CARACTER, pausaTras } from '../../simulator/caso/ritmo-texto';
import { VolumeSettings } from '../../simulator/volume-settings.service';
import { reducirMovimiento } from '../guia/guia.service';

/** Alturas del blip (archivos `blip-<altura>.wav` en la carpeta de la voz). */
const ALTURAS = ['bajo', 'medio', 'alto'] as const;
/** Un blip cada tantas letras: con 20 ms por letra suena a sílabas, no a ametralladora. */
const LETRAS_POR_BLIP = 3;
/** Los blips acompañan al texto: un poco más bajos que los efectos de la interfaz. */
const VOLUMEN_BASE = 0.35;

/**
 * La voz del mentor del tutorial: escribe el texto letra a letra con el ritmo de los diálogos del juego
 * (`caso/ritmo-texto`) y, como en los juegos de rol clásicos, suena un «blip» con el timbre del mentor cada pocas letras,
 * sin palabras. Con «Texto instantáneo» o movimiento reducido el texto sale entero y no suena nada. Respeta el volumen y
 * el silencio de los efectos del juego. Si el audio no está disponible, el texto se escribe igual, en silencio.
 *
 * Se crea en un contexto de inyección (`useFactory` del componente), con la carpeta de la voz.
 */
export class VozMentor {
  private readonly volumen = inject(VolumeSettings);
  private readonly instantaneo = inject(InstantTextSettings);
  private readonly visible = signal('');
  private readonly enCurso = signal(false);
  /** Lo que ya se escribió del texto actual. */
  readonly escrito = this.visible.asReadonly();
  /** ¿Todavía se está escribiendo? */
  readonly escribiendo = this.enCurso.asReadonly();

  private texto = '';
  private letras = 0;
  private espera: ReturnType<typeof setTimeout> | null = null;
  private blips: Howl[] | null = null;

  constructor(private readonly carpeta: string) {}

  /** Empieza a decir `texto` desde cero (corta lo que estuviera diciendo). */
  decir(texto: string): void {
    this.callar();
    this.texto = texto;
    if (!texto || reducirMovimiento() || this.instantaneo.enabled()) {
      this.visible.set(texto);
      return;
    }
    this.visible.set('');
    this.enCurso.set(true);
    let pos = 0;
    const paso = () => {
      const caracter = texto[pos];
      pos++;
      this.visible.set(texto.slice(0, pos));
      if (/[\p{L}\p{N}]/u.test(caracter) && this.letras++ % LETRAS_POR_BLIP === 0) this.blip(caracter);
      if (pos >= texto.length) {
        this.espera = null;
        this.enCurso.set(false);
        return;
      }
      this.espera = setTimeout(paso, MS_POR_CARACTER + pausaTras(texto[pos - 1], texto[pos]));
    };
    this.espera = setTimeout(paso, MS_POR_CARACTER);
  }

  /** Muestra el texto entero de una vez (clic sobre el texto). */
  completar(): void {
    this.callar();
    this.visible.set(this.texto);
  }

  /** Deja de escribir y de sonar. */
  callar(): void {
    if (this.espera !== null) clearTimeout(this.espera);
    this.espera = null;
    this.letras = 0;
    this.enCurso.set(false);
  }

  private blip(caracter: string): void {
    if (this.volumen.sfxMuted()) return;
    const blips = this.cargar();
    if (!blips.length) return;
    // La altura depende de la letra: la misma palabra suena igual cada vez, como una voz y no como ruido.
    const howl = blips[caracter.toLowerCase().charCodeAt(0) % blips.length];
    try {
      howl.volume(volumeForLevel(VOLUMEN_BASE, this.volumen.sfxLevel()));
      howl.play();
    } catch {
      // Sin audio: el texto sigue escribiéndose en silencio.
    }
  }

  private cargar(): Howl[] {
    if (this.blips) return this.blips;
    try {
      this.blips = typeof Audio === 'undefined' ? [] : ALTURAS.map((altura) => new Howl({ src: [`${this.carpeta}/blip-${altura}.wav`], preload: true }));
    } catch {
      this.blips = [];
    }
    return this.blips;
  }
}
