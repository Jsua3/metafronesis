import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal,
} from '@angular/core';

import { UiFiguraPixel } from '../figura-pixel/ui-figura-pixel';
import { UiPiezaPixel } from './ui-pieza-pixel';
import {
  ESCENAS, capasDeEscena, escalaQueCabe, type ClavePieza, type EscalaVineta, type NombreEscena,
} from './vineta-catalogo';

export type MarcoVineta = 'suelo' | 'placa' | 'ninguno';
export type AlineacionVineta = 'inicio' | 'centro' | 'fin';

/** Vista de una capa para la plantilla: discriminada por `tipo`, sin `in` en la plantilla. */
type CapaVista =
  | { tipo: 'pieza'; pieza: ClavePieza; x: number; y: number; cuadro: number; flota: boolean; orden: number }
  | { tipo: 'kit'; kit: string; x: number; y: number; orden: number };

/**
 * Viñeta del simulador (personalidad visual del portal, ronda 3). Patrón Composite: compone una escena pequeña con
 * capas (`ui-pieza-pixel`, las hojas) de la biblioteca del simulador y un personaje del kit (`ui-figura-pixel`), todo a
 * la MISMA escala entera y `pixelated`. Presentacional: recibe el nombre de la escena (`ESCENAS`) y, si se quiere, el
 * personaje que hace de protagonista (el avatar del estudiante); no pide datos a nadie.
 *
 * Es decorativa (aria-hidden): acompaña un título, nunca lo reemplaza. La escala que se pide es la máxima; si el sitio
 * no alcanza (teléfono), baja al entero que cabe, sin recortar ni suavizar. Entra con un fundido de 240 ms (lo que flota
 * llega después) y se queda quieta: nada en bucle.
 */
@Component({
  selector: 'ui-vineta',
  imports: [UiPiezaPixel, UiFiguraPixel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-vineta',
    'aria-hidden': 'true',
    '[class.ui-vineta--placa]': "marco() === 'placa'",
    '[class.ui-vineta--suelo]': "marco() === 'suelo'",
    '[class.ui-vineta--inicio]': "alinear() === 'inicio'",
    '[class.ui-vineta--fin]': "alinear() === 'fin'",
    '[attr.data-escena]': 'escena()',
    '[style.--vineta-e]': 'escalaFinal()',
    '[style.--vw]': 'datos().ancho',
    '[style.--vh]': 'datos().alto',
  },
  template: `
    <div class="ui-vineta__escena">
      @for (capa of capas(); track $index) {
        @if (capa.tipo === 'pieza') {
          <ui-pieza-pixel [pieza]="capa.pieza" [x]="capa.x" [y]="capa.y" [cuadro]="capa.cuadro" [flota]="capa.flota"
            [orden]="capa.orden" />
        } @else {
          <ui-pieza-pixel [x]="capa.x" [y]="capa.y" [orden]="capa.orden">
            <ui-figura-pixel [personaje]="capa.kit" [escala]="escalaFinal()" />
          </ui-pieza-pixel>
        }
      }
    </div>
  `,
  styleUrl: './ui-vineta.scss',
})
export class UiVineta {
  readonly escena = input.required<NombreEscena>();
  /** Personaje del kit que reemplaza al protagonista de la escena (`'camila/bata'`); inválido o vacío, se ignora. */
  readonly personaje = input<string | null | undefined>(null);
  /** Escala máxima (entera). En un sitio estrecho baja sola al entero que cabe. */
  readonly escala = input<EscalaVineta>(2);
  /** `suelo`: una sombra escalonada bajo la escena; `placa`: un marco con superficie y suelo; `ninguno`: solo el arte. */
  readonly marco = input<MarcoVineta>('suelo');
  readonly alinear = input<AlineacionVineta>('centro');

  /** Ancho disponible medido (px); null hasta la primera medida o sin ResizeObserver. */
  private readonly disponible = signal<number | null>(null);

  protected readonly datos = computed(() => ESCENAS[this.escena()] ?? ESCENAS.estudio);
  protected readonly escalaFinal = computed(() => {
    // La placa suma su relleno a cada lado (2 × 12 px del arte a la escala elegida, aprox.): se descuenta al medir.
    const extra = this.marco() === 'placa' ? 24 : 0;
    return escalaQueCabe(this.datos().ancho + extra, this.disponible(), this.escala());
  });
  protected readonly capas = computed<CapaVista[]>(() =>
    capasDeEscena(this.datos(), this.personaje()).map(c => 'pieza' in c
      ? { tipo: 'pieza', pieza: c.pieza, x: c.x, y: c.y ?? 0, cuadro: c.cuadro ?? 0, flota: !!c.flota, orden: c.orden }
      : { tipo: 'kit', kit: c.kit, x: c.x, y: c.y ?? 0, orden: c.orden }));

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    // Observer: la escala sigue al ancho del sitio (el teléfono gira, la barra lateral se pliega). Sin ResizeObserver
    // (jsdom) se queda la máxima.
    afterNextRender(() => {
      if (typeof ResizeObserver !== 'function') return;
      const observador = new ResizeObserver(entradas => {
        const ancho = entradas[0]?.contentRect.width;
        if (ancho) this.disponible.set(Math.floor(ancho));
      });
      observador.observe(host);
      destroyRef.onDestroy(() => observador.disconnect());
    });
  }
}
