import {
  ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, input,
  model, signal, viewChild, viewChildren,
} from '@angular/core';

export interface UiSegmento {
  valor: string;
  etiqueta: string;
  /** Cuántos hay en ese segmento: se escribe como texto («Solicitudes · 3»), nunca solo como un globo de color. */
  cuenta?: number | null;
}

/**
 * Segmentado (DISENO C5): elegir UNA vista o UN filtro entre pocos, como el control segmentado de iOS. Semántica de
 * grupo de opciones (`radiogroup` + `radio` con `aria-checked`) y tabulador itinerante: una sola parada de Tab; las
 * flechas eligen la vecina, Inicio y Fin los extremos (el mismo teclado que la cápsula de tema).
 *
 * El indicador es una pieza aparte que se desliza con el resorte suave hasta la opción elegida, medida en el DOM (los
 * segmentos miden lo que su texto pide; si no caben, la pista se desplaza en horizontal y nunca desborda la página).
 * Hasta medir (o sin maquetación, como en jsdom) la opción elegida pinta su propio fondo.
 */
@Component({
  selector: 'ui-segmentado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-segmentado',
    '[class.ui-segmentado--medido]': 'medido()',
    '[class.ui-segmentado--listo]': 'listo()',
    '[class.ui-segmentado--mas-inicio]': 'masInicio()',
    '[class.ui-segmentado--mas-fin]': 'masFin()',
  },
  template: `
    <div #pista class="ui-segmentado__pista" role="radiogroup" [attr.aria-label]="etiqueta()" (keydown)="teclado($event)"
      (scroll)="bordes()">
      <span #indicador class="ui-segmentado__indicador ds-motion" aria-hidden="true"></span>
      @for (opcion of opciones(); track opcion.valor) {
        <button #segmento type="button" role="radio" class="ui-segmentado__opcion"
          [attr.aria-checked]="opcion.valor === valor()" [attr.tabindex]="opcion.valor === enfocable() ? 0 : -1"
          [attr.data-valor]="opcion.valor" (click)="elegir(opcion.valor)">
          <span class="ui-segmentado__texto">{{ opcion.etiqueta }}</span>
          @if (opcion.cuenta !== undefined && opcion.cuenta !== null) {
            <span class="ui-segmentado__cuenta">&ngsp;<span class="ui-segmentado__punto" aria-hidden="true">·</span> {{ opcion.cuenta }}</span>
          }
        </button>
      }
    </div>
  `,
  styleUrl: './ui-segmentado.scss',
})
export class UiSegmentado {
  readonly opciones = input.required<readonly UiSegmento[]>();
  readonly valor = model.required<string>();
  /** Nombre del grupo (lo que se elige): «Estado del caso», «Vista». */
  readonly etiqueta = input.required<string>();

  /** La opción que recibe el Tab: la elegida o, si el valor no está entre las opciones, la primera. */
  protected readonly enfocable = computed(() => {
    const opciones = this.opciones();
    return opciones.some(opcion => opcion.valor === this.valor()) ? this.valor() : opciones[0]?.valor;
  });
  protected readonly medido = signal(false);
  /**
   * El indicador solo se desliza después del primer cuadro medido: así no entra volando desde la izquierda al cargar la
   * página, solo cuando la persona cambia de opción.
   */
  protected readonly listo = signal(false);
  /**
   * Si la pista se desplaza (opciones que no caben en un teléfono), el borde por donde hay más se desvanece: sin esa
   * pista visual, «Administradores» o «Por aprobar» quedaban cortadas sin que nada dijera que se puede deslizar.
   */
  protected readonly masInicio = signal(false);
  protected readonly masFin = signal(false);

  private readonly pista = viewChild.required<ElementRef<HTMLElement>>('pista');
  private readonly indicador = viewChild.required<ElementRef<HTMLElement>>('indicador');
  private readonly segmentos = viewChildren<ElementRef<HTMLButtonElement>>('segmento');

  constructor() {
    // Lleva el indicador a la opción elegida cada vez que cambian el valor o las opciones.
    afterRenderEffect({ write: () => this.medir(this.valor(), this.segmentos()) });
    // Un cambio de tamaño mueve los segmentos: se vuelve a medir. Se observan la pista (giro del teléfono, columna que
    // se estrecha) Y cada opción: una cuenta que pasa de 9 a 10 o una fuente que termina de cargar ensancha una opción
    // sin cambiar el ancho de una pista ya limitada, y el indicador quedaría corto o corrido.
    // Se rehace al cambiar las opciones, para observar también las nuevas.
    afterRenderEffect(onCleanup => {
      const segmentos = this.segmentos();
      if (typeof ResizeObserver === 'undefined') return;
      const observador = new ResizeObserver(() => this.medir(this.valor(), this.segmentos()));
      observador.observe(this.pista().nativeElement);
      for (const segmento of segmentos) observador.observe(segmento.nativeElement);
      onCleanup(() => observador.disconnect());
    });
  }

  protected elegir(valor: string): void {
    this.valor.set(valor);
  }

  /** Flechas, Inicio y Fin: eligen y llevan el foco (patrón de grupo de opciones del APG). */
  protected teclado(evento: KeyboardEvent): void {
    const opciones = this.opciones();
    if (!opciones.length) return;
    const actual = Math.max(0, opciones.findIndex(opcion => opcion.valor === this.enfocable()));
    const destino: Record<string, number> = {
      ArrowRight: (actual + 1) % opciones.length,
      ArrowDown: (actual + 1) % opciones.length,
      ArrowLeft: (actual - 1 + opciones.length) % opciones.length,
      ArrowUp: (actual - 1 + opciones.length) % opciones.length,
      Home: 0,
      End: opciones.length - 1,
    };
    const indice = destino[evento.key];
    if (indice === undefined) return;
    evento.preventDefault();
    this.valor.set(opciones[indice].valor);
    this.segmentos()[indice]?.nativeElement.focus();
  }

  /** Posición y ancho del indicador, en px de la pista; sin maquetación (ancho 0) se deja el fondo propio de la opción. */
  private medir(valor: string, segmentos: readonly ElementRef<HTMLButtonElement>[]): void {
    const elegido = segmentos.find(segmento => segmento.nativeElement.dataset['valor'] === valor)?.nativeElement;
    const indicador = this.indicador().nativeElement;
    if (!elegido || !elegido.offsetWidth) {
      this.medido.set(false);
      return;
    }
    indicador.style.setProperty('--_x', `${elegido.offsetLeft}px`);
    indicador.style.setProperty('--_ancho', `${elegido.offsetWidth}px`);
    this.medido.set(true);
    if (!this.listo() && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => this.listo.set(true));
    // Si la pista se desplaza (muchas opciones en un teléfono), la elegida queda a la vista. Se mueve solo la pista:
    // `scrollIntoView` podría desplazar también la página al cargarla.
    const pista = this.pista().nativeElement;
    if (pista.scrollWidth > pista.clientWidth) {
      const inicio = elegido.offsetLeft;
      const fin = inicio + elegido.offsetWidth;
      if (inicio < pista.scrollLeft) pista.scrollLeft = inicio;
      else if (fin > pista.scrollLeft + pista.clientWidth) pista.scrollLeft = fin - pista.clientWidth;
    }
    this.bordes();
  }

  /** Qué bordes de la pista esconden opciones (1 px de tolerancia por el redondeo de los anchos). */
  protected bordes(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.pista().nativeElement;
    const desborda = scrollWidth > clientWidth + 1;
    this.masInicio.set(desborda && scrollLeft > 1);
    this.masFin.set(desborda && scrollLeft + clientWidth < scrollWidth - 1);
  }
}
