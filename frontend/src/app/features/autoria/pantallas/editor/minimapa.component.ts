import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

export interface NodoMini { id: string; x: number; y: number; elegida: boolean; aviso: boolean }

const ANCHO = 176;

/**
 * Minimapa del lienzo de Caminos (EDITOR-PRO.md, punto 3): el caso entero en una esquina, con un recuadro de lo que se
 * ve. Pulsar o arrastrar dentro mueve la cámara a ese punto.
 *
 * Patrón: componente de presentación. Recibe el mundo, los nodos y la ventana visible (en coordenadas del mundo) y
 * emite el punto del mundo al que ir; no conoce la cámara.
 */
@Component({
  selector: 'app-minimapa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg class="mini" [attr.viewBox]="'0 0 ' + mundo().w + ' ' + mundo().h" [attr.width]="ANCHO" [attr.height]="alto()"
         preserveAspectRatio="xMidYMid meet"
         (pointerdown)="empezar($event)" (pointermove)="mover($event)" (pointerup)="soltar($event)" (pointercancel)="soltar($event)">
      <rect class="fondo" x="0" y="0" [attr.width]="mundo().w" [attr.height]="mundo().h" />
      @for (n of nodos(); track n.id) {
        <rect class="nodo" [class.elegida]="n.elegida" [class.aviso]="n.aviso" [attr.x]="n.x" [attr.y]="n.y"
              [attr.width]="tamNodo().w" [attr.height]="tamNodo().h" rx="10" />
      }
      <rect class="ventana" [attr.x]="ventana().x" [attr.y]="ventana().y" [attr.width]="ventana().w" [attr.height]="ventana().h"
            [attr.stroke-width]="trazo()" rx="6" />
    </svg>
  `,
  styles: `
    :host {
      display: block; padding: 0.375rem; border: 1px solid var(--l-filo-fuerte); border-radius: var(--l-radio-chico, 0.5rem);
      background: color-mix(in oklab, var(--l-superficie) 94%, transparent); box-shadow: var(--l-sombra);
    }
    .mini { display: block; cursor: crosshair; touch-action: none; }
    .fondo { fill: transparent; }
    .nodo { fill: var(--l-filo-fuerte); }
    .nodo.aviso { fill: var(--ds-warning-text); }
    .nodo.elegida { fill: var(--ds-primary); }
    .ventana { fill: color-mix(in oklab, var(--ds-primary) 8%, transparent); stroke: var(--ds-primary); }
  `,
})
export class MinimapaComponent {
  readonly mundo = input.required<{ w: number; h: number }>();
  readonly tamNodo = input.required<{ w: number; h: number }>();
  readonly nodos = input.required<NodoMini[]>();
  readonly ventana = input.required<{ x: number; y: number; w: number; h: number }>();
  readonly ir = output<{ x: number; y: number }>();
  protected readonly ANCHO = ANCHO;
  protected readonly alto = computed(() => Math.round(Math.min(120, Math.max(56, (ANCHO * this.mundo().h) / this.mundo().w))));
  /** El filo de la ventana se ve de 2 px a cualquier tamaño de mundo. */
  protected readonly trazo = computed(() => (2 * Math.max(this.mundo().w / ANCHO, this.mundo().h / this.alto())).toFixed(1));
  private readonly arrastrando = signal(false);

  protected empezar(e: PointerEvent): void {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    this.arrastrando.set(true);
    this.mover(e);
  }

  protected mover(e: PointerEvent): void {
    if (!this.arrastrando()) return;
    const svg = e.currentTarget as SVGSVGElement;
    const caja = svg.getBoundingClientRect();
    if (!caja.width || !caja.height) return;
    // preserveAspectRatio «meet»: el mundo ocupa la caja con la misma escala en los dos ejes, centrado.
    const k = Math.min(caja.width / this.mundo().w, caja.height / this.mundo().h);
    const ox = (caja.width - this.mundo().w * k) / 2, oy = (caja.height - this.mundo().h * k) / 2;
    this.ir.emit({ x: (e.clientX - caja.left - ox) / k, y: (e.clientY - caja.top - oy) / k });
  }

  protected soltar(e: PointerEvent): void {
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    this.arrastrando.set(false);
  }
}
