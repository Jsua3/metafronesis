import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

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
    <button type="button" class="aviso u-boton u-sombra" [class.aviso--cerrada]="bloqueada()" [attr.aria-disabled]="bloqueada() ? 'true' : null"
      [style.left.px]="x()" [style.top.px]="y()" [style.--x]="x() + 'px'" (click)="cruzar.emit()">
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
    <span class="aviso__cola" [style.left.px]="x()" [style.top.px]="y()" aria-hidden="true"><app-pixel-icono nombre="cola-abajo" /></span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    /* Contenedor de tamaño: el cartel se acota al ancho del lienzo (100cqw) y no se sale por un borde. */
    :host { position: absolute; inset: 0; pointer-events: none; container-type: size; }
    /* Bloque U1: el cartel es la placa-botón del cuadro de diálogo (marco, trama, sombra de tramado y estados de sobre, foco y
       pulsado de la hoja común) con la tecla E de las fichas y una cola de pixel que se monta un punto sobre su canto. */
    /* Centrado sobre su puerta, salvo junto a un borde del lienzo: ahí se corre lo justo para quedar entero (la cola
       sigue señalando la puerta, que es otro elemento). Si el cartel es más ancho que el lienzo, manda el borde izquierdo. */
    .aviso {
      --borde: calc(2 * var(--pixel-px, 2px));
      --dx: clamp(calc(var(--borde) - var(--x, 0px)), -50%, calc(100cqw - var(--x, 0px) - 100% - var(--borde)));
      position: absolute; transform: none; translate: var(--dx) calc(-100% - 3 * var(--pixel-px, 2px)); pointer-events: auto;
      gap: calc(3 * var(--pixel-px, 2px)); padding: 0 calc(5 * var(--pixel-px, 2px)) 1px calc(3 * var(--pixel-px, 2px));
      font-family: var(--pixel-f-texto); font-size: calc(var(--pixel-tam, 14px) * 1.05); font-weight: 600; line-height: 1.2;
    }
    .aviso:active { transform: none; translate: var(--dx) calc(-100% - 2 * var(--pixel-px, 2px)); }
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
    @media (prefers-reduced-motion: reduce) {
      .aviso:active { translate: var(--dx) calc(-100% - 3 * var(--pixel-px, 2px)); }
    }
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
  /** Quien juega quiere pasar (o intenta pasar por la puerta cerrada). */
  readonly cruzar = output<void>();

  protected readonly detalle = computed(() => this.falta() ?? 'Todavía no se puede pasar.');
}
