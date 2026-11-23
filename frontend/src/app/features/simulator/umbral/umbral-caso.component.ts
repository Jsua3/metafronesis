import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { UiButton } from '../../../shared/ui/button/ui-button';
import { UiPortadaCaso, UiPortadaTamano } from '../../../shared/ui/portada-caso/ui-portada-caso';
import { DRAFT_COPY } from '../draft-copy';
import { SafeExitButtonComponent } from '../safe-exit-button.component';
import { FirmaProgresoComponent } from './firma-progreso.component';

/** Las fases reales del arranque: cada una enciende un píxel de la firma (DISENO §4.4, C16). */
export type FaseUmbral = 'intento' | 'sala' | 'escena' | 'listo';

/** Bajo 1 s no hace falta decir qué pasa (Nielsen): antes, solo los píxeles. */
export const UMBRAL_TEXTO_MS = 1000;

/** El paso en curso, en palabras. «Preparando la escena…» es el mismo texto que la región de estado del juego. */
export const PASOS_UMBRAL: Readonly<Record<Exclude<FaseUmbral, 'listo'>, string>> = {
  intento: 'Preparando tu intento…',
  sala: 'Cargando la sala…',
  escena: 'Preparando la escena…',
};

/** La portada grande solo si cabe con la tarjeta debajo: si no, la mitad (240 × 132), también una escala entera. */
const HEROE_CABE = '(min-width: 34rem) and (min-height: 50rem)';

/**
 * El umbral del juego (DISENO §4.4, pieza 4; DP-09): la ÚNICA pantalla entre la ficha y el mundo. Reemplaza el spinner
 * de «Cargando el caso…» y le da a la espera una identidad: la luz ambiental de la portada sobre la piel game, la portada
 * del caso (la que viajó desde la ficha con la transición de vistas), su título, la línea de cuidado que nombra la salida
 * segura y el progreso honesto de tres píxeles.
 *
 * Vive DENTRO de `.game-container[data-skin="game"]`, hermano de las capas del mundo (nunca dentro de la barra, del pie
 * ni de un subárbol que se vuelva inerte: «una capa modal no va dentro del mundo»). Mientras se ve, el juego deja inertes
 * su barra y su pie, así que lo único operable es lo que hay aquí: la salida segura (si ya hay un intento en curso) y,
 * pasados 10 s, «Volver a la ficha». Las tarjetas de entrada del juego («Antes de comenzar», reanudar y el aviso de
 * respaldo) se pintan sobre su mitad de abajo, como una hoja; esta pantalla les deja el sitio (`conTarjeta`).
 *
 * Sin «Reintentar» mientras haya algo en curso (Codex 7): lo lento sigue y la persona decide si espera o vuelve. Un
 * fallo de verdad lo muestra el juego por su camino de error de siempre, que reintenta una sola cosa.
 */
@Component({
  selector: 'app-umbral-caso',
  imports: [FirmaProgresoComponent, MatIconModule, SafeExitButtonComponent, UiButton, UiPortadaCaso],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'umbral-caso ds-motion',
    '[class.umbral-caso--con-tarjeta]': 'conTarjeta()',
    '[class.umbral-caso--saliendo]': 'saliendo()',
    '[attr.data-fase]': 'fase()',
    '[attr.aria-busy]': "fase() === 'listo' ? null : 'true'",
  },
  templateUrl: './umbral-caso.component.html',
  styleUrl: './umbral-caso.component.scss',
})
export class UmbralCasoComponent {
  readonly titulo = input<string | null>(null);
  readonly portada = input<string | null>(null);
  readonly fase = input<FaseUmbral>('intento');
  /** Pasaron 10 s sin terminar de cargar: lo que está en curso sigue y se ofrece volver. */
  readonly lento = input(false);
  /** Hay una tarjeta de entrada a la vista (la tarjeta, reanudar o el aviso): la pantalla sube y le deja la mitad de abajo. */
  readonly conTarjeta = input(false);
  /** Hay un intento en curso y ninguna tarjeta trae su propia salida segura: el umbral la ofrece (REGLA-004). */
  readonly salida = input(false);
  readonly pausando = input(false);
  /** El juego muestra su indicador de arranque (`bootVisible`): el bloque del progreso lleva la clase de siempre. */
  readonly arrancando = input(false);
  readonly modo = input<'student' | 'rehearsal'>('student');
  /** El umbral se está retirando (el velo de 1 a 0): ya no recibe el puntero. */
  readonly saliendo = input(false);

  readonly volver = output<void>();
  readonly salidaSegura = output<void>();

  protected readonly cuidado = DRAFT_COPY.umbralCareLine.text;
  protected readonly textoLento = DRAFT_COPY.umbralSlow.text;

  /** Cuántos píxeles de la firma están encendidos: uno por fase cumplida. */
  protected readonly pasos = computed(() => ({ intento: 0, sala: 1, escena: 2, listo: 3 })[this.fase()]);
  protected readonly pasoTexto = computed(() => {
    const fase = this.fase();
    return fase === 'listo' ? 'Listo' : PASOS_UMBRAL[fase];
  });
  /** Pasado 1 s, el paso se dice también en texto (antes, solo los píxeles: bajo 1 s no hace falta indicador). */
  private readonly pasoUnSegundo = signal(false);
  // Con una tarjeta a la vista nada carga: se espera a la persona, y decir «Preparando…» sería mentir.
  protected readonly mostrarPaso = computed(() => this.pasoUnSegundo() && this.fase() !== 'listo' && !this.conTarjeta());
  protected readonly tamanoPortada = signal<UiPortadaTamano>(this.cabeHeroe() ? 'heroe' : 'tarjeta');
  protected readonly volverEtiqueta = computed(() => (this.modo() === 'rehearsal' ? 'Volver al editor' : 'Volver a la ficha'));

  constructor() {
    const destroyRef = inject(DestroyRef);
    const reloj = window.setTimeout(() => this.pasoUnSegundo.set(true), UMBRAL_TEXTO_MS);
    destroyRef.onDestroy(() => window.clearTimeout(reloj));
    try {
      const consulta = window.matchMedia?.(HEROE_CABE);
      const alCambiar = (evento: MediaQueryListEvent) => this.tamanoPortada.set(evento.matches ? 'heroe' : 'tarjeta');
      consulta?.addEventListener?.('change', alCambiar);
      destroyRef.onDestroy(() => consulta?.removeEventListener?.('change', alCambiar));
    } catch {
      // Sin matchMedia se queda la portada grande.
    }
  }

  private cabeHeroe(): boolean {
    try {
      return window.matchMedia?.(HEROE_CABE).matches ?? true;
    } catch {
      return true;
    }
  }
}
