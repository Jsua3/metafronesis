import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';

import { Caja, situarAviso } from '../camara/camara';
import { PixelIconoComponent } from '../pixel/pixel-icono.component';

/**
 * Aviso de la puerta de una sala por piezas (diseño, sección 4.4): «E · Pasar a la sala de espera», junto a la puerta que
 * se abrió. Siempre es un botón: con teclado lo dispara E (lo escucha la escena) o Enter y Espacio si tiene el foco; con
 * ratón o con el dedo se pulsa. Cerrada con llave dice qué falta, con un candado: la forma lo dice, no solo el color
 * (WCAG 1.4.1). El anuncio para el lector de pantalla lo hace la región viva que el juego ya usa para lo cercano.
 *
 * Presentacional: lo posiciona quien lo aloja (`x`, `y` en px del contenedor, el punto al que señala la cola) y él decide
 * qué hacer con `cruzar` (cruzar la puerta o, si está cerrada, sacudirla).
 */
@Component({
  selector: 'app-aviso-de-puerta',
  standalone: true,
  imports: [PixelIconoComponent],
  template: `
    <button #placa type="button" class="aviso u-boton u-sombra" [class.aviso--cerrada]="bloqueada()" [attr.aria-disabled]="bloqueada() ? 'true' : null"
      [style.left.px]="posicion()?.x ?? 0" [style.top.px]="posicion()?.y ?? 0" [style.visibility]="posicion() ? null : 'hidden'"
      (click)="cruzar.emit()">
      @if (conTecla()) {
        <kbd class="aviso__tecla u-tecla u-tecla--letra" aria-hidden="true">E</kbd><span class="aviso__sep" aria-hidden="true">·</span>
      }
      @if (bloqueada()) {
        <svg class="aviso__candado" viewBox="0 0 7 8" shape-rendering="crispEdges" aria-hidden="true">
          <path fill="currentColor" d="M1 3h5v5H1zM2 1h3v1H2zM1 2h1v1H1zM5 2h1v1H5z" /><path class="aviso__ojo" d="M3 5h1v2H3z" />
        </svg>
      }
      <span class="aviso__texto">{{ texto() }}</span>
      @if (bloqueada()) {
        <span class="aviso__falta"><span class="aviso__oculto">: cerrada.</span> {{ detalle() }}</span>
      }
    </button>
    @if (colaVisible()) {
      <span class="aviso__cola" [style.left.px]="x()" [style.top.px]="y()" aria-hidden="true"><app-pixel-icono nombre="cola-abajo" /></span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    /* Contenedor de tamaño: el cartel se acota al ancho del lienzo (100cqw) y no se sale por un borde. */
    :host { position: absolute; inset: 0; pointer-events: none; container-type: size; }
    /* Bloque U1: el cartel es la placa-botón del cuadro de diálogo (marco, trama, sombra de tramado y estados de sobre, foco y
       pulsado de la hoja común) con la tecla E de las fichas y una cola de pixel que se monta un punto sobre su canto. */
    /* El cartel se coloca con su tamaño real y admite varias líneas en pantallas estrechas. */
    .aviso {
      position: absolute; transform: none; pointer-events: auto; box-sizing: border-box;
      width: max-content; max-width: min(32rem, calc(100cqw - 12px)); flex-wrap: wrap; white-space: normal;
      overflow-wrap: anywhere;
      gap: calc(3 * var(--pixel-px, 2px)); padding: 0 calc(5 * var(--pixel-px, 2px)) 1px calc(3 * var(--pixel-px, 2px));
      font-family: var(--pixel-f-texto); font-size: calc(var(--pixel-tam, 14px) * 1.05); font-weight: 600; line-height: 1.2;
    }
    .aviso:active { transform: none; }
    .aviso__sep { color: var(--pixel-tinta-suave); }
    .aviso__candado { width: calc(7 * var(--pixel-px, 2px)); height: calc(8 * var(--pixel-px, 2px)); flex: none; }
    .aviso__ojo { fill: var(--pixel-penumbra); }
    .aviso__falta { font-weight: 400; color: var(--pixel-tinta-suave); }
    .aviso__oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .aviso__cola {
      position: absolute; display: block; width: calc(7 * var(--pixel-px, 2px)); height: calc(4 * var(--pixel-px, 2px));
      transform: translate(-50%, -100%);
    }
    .aviso__cola app-pixel-icono { width: 100%; height: 100%; }
  `],
})
export class AvisoDePuertaComponent {
  /** Lo que hace la puerta: «Pasar a la sala de espera». */
  readonly texto = input.required<string>();
  /** Cerrada con llave (`door-status.util.ts`). */
  readonly bloqueada = input(false);
  /** Qué falta para pasar, cuando está cerrada. */
  readonly falta = input<string | null>(null);
  /** Muestra la tecla E: no en pantalla táctil ni con los atajos de una tecla apagados. */
  readonly conTecla = input(true);
  /** Punto al que señala la cola, en px del contenedor. */
  readonly x = input(0);
  readonly y = input(0);
  readonly vista = input<Caja | null>(null);
  readonly ocupadas = input<readonly Caja[]>([]);
  /** Quien juega quiere pasar (o intenta pasar por la puerta cerrada). */
  readonly cruzar = output<void>();

  protected readonly detalle = computed(() => this.falta() ?? 'Todavía no se puede pasar.');
  private readonly placa = viewChild.required<ElementRef<HTMLButtonElement>>('placa');
  private readonly tamano = signal({ ancho: 0, alto: 0 });
  private readonly medir = afterRenderEffect(onCleanup => {
    const el = this.placa().nativeElement;
    const medir = () => this.tamano.set({ ancho: el.offsetWidth, alto: el.offsetHeight });
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    onCleanup(() => observador.disconnect());
  });

  private readonly preferida = computed<Caja>(() => {
    const { ancho, alto } = this.tamano();
    return { x: this.x() - ancho / 2, y: this.y() - alto - 6, ancho, alto };
  });
  protected readonly posicion = computed(() => {
    const caja = this.preferida();
    const vista = this.vista();
    return vista && caja.ancho > 0 && caja.alto > 0 ? situarAviso(caja, vista, this.ocupadas()) : null;
  });
  protected readonly colaVisible = computed(() => {
    const p = this.posicion();
    const caja = this.preferida();
    return !!p && p.y === caja.y && this.x() > p.x + 8 && this.x() < p.x + caja.ancho - 8;
  });
}
