import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ANCHOS } from '../../modelo/geometria';

@Component({
  selector: 'app-manija-de-ancho',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
    <div tabindex="0" role="slider" aria-label="Ancho de la sala" aria-valuemin="960" aria-valuemax="1920"
      [attr.aria-valuenow]="ancho()" [attr.aria-valuetext]="ancho() + ' px'" (keydown)="tecla($event)"
      (pointerdown)="iniciar($event)" (pointerup)="soltar($event)" (pointercancel)="cancelar()">↔</div>
  `,
  styles: [`
    :host { position: absolute; right: 0; top: 50%; z-index: var(--ds-z-elevado); transform: translateY(-50%); }
    [role=slider] { min-width: 44px; min-height: 44px; touch-action: none; cursor: ew-resize; }
  `],
})
export class ManijaDeAnchoComponent {
  readonly ancho = input.required<number>();
  readonly escala = input<number>(1);
  readonly cambio = output<number>();
  private inicio: { x: number; ancho: number; puntero: number } | null = null;

  protected tecla(evento: KeyboardEvent): void {
    const paso = evento.key === 'ArrowRight' || evento.key === 'ArrowUp' ? 1
      : evento.key === 'ArrowLeft' || evento.key === 'ArrowDown' ? -1 : 0;
    if (!paso) return;
    evento.preventDefault(); evento.stopPropagation();
    const indice = ANCHOS.indexOf(this.ancho());
    const siguiente = ANCHOS[Math.max(0, Math.min(ANCHOS.length - 1, indice + paso))];
    if (siguiente !== this.ancho()) this.cambio.emit(siguiente);
  }

  protected iniciar(evento: PointerEvent): void {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    (evento.currentTarget as HTMLElement).setPointerCapture?.(evento.pointerId);
    this.inicio = { x: evento.clientX, ancho: this.ancho(), puntero: evento.pointerId };
  }

  protected soltar(evento: PointerEvent): void {
    const inicio = this.inicio;
    if (!inicio || inicio.puntero !== evento.pointerId) return;
    this.inicio = null; evento.stopPropagation();
    const propuesto = inicio.ancho + (evento.clientX - inicio.x) / this.escala();
    const siguiente = ANCHOS.reduce((a, b) => Math.abs(b - propuesto) < Math.abs(a - propuesto) ? b : a);
    if (siguiente !== inicio.ancho) this.cambio.emit(siguiente);
  }

  protected cancelar(): void { this.inicio = null; }
}
