import { ChangeDetectionStrategy, Component, ElementRef, input, signal, viewChild } from '@angular/core';

import { UiGlifoAyuda } from './glifo-ayuda';

let siguiente = 0;

/**
 * Explicación en el lugar: pastilla de vidrio con un bocadillo de pixel art y, al pulsarla, un popover (capa superior)
 * anclado al botón. No empuja el texto de alrededor ni lo corta un overflow; Esc y el clic fuera lo cierran.
 */
@Component({
  selector: 'ui-ayuda-breve',
  imports: [UiGlifoAyuda],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--ayuda-ancla]': 'ancla' },
  template: `
    <button #boton type="button" class="ayuda__boton" [attr.aria-label]="'Ayuda: ' + termino()"
            [attr.aria-expanded]="abierta()" [attr.aria-controls]="id"
            [attr.popovertarget]="id" popovertargetaction="toggle">
      <ui-glifo-ayuda />
    </button>
    <div class="ayuda__panel" popover="auto" [id]="id" (toggle)="alternado($event)">
      <strong class="ayuda__termino">{{ termino() }}</strong>
      <span class="ayuda__texto">{{ explicacion() }}</span>
    </div>
  `,
  styleUrl: './ui-ayuda-breve.scss',
})
export class UiAyudaBreve {
  readonly termino = input.required<string>();
  readonly explicacion = input.required<string>();

  protected readonly abierta = signal(false);
  private readonly numero = ++siguiente;
  protected readonly id = `ayuda-breve-${this.numero}`;
  protected readonly ancla = `--ayuda-ancla-${this.numero}`;
  private readonly boton = viewChild.required<ElementRef<HTMLButtonElement>>('boton');

  protected alternado(e: Event): void {
    const abierto = (e as ToggleEvent).newState === 'open';
    this.abierta.set(abierto);
    // Al cerrar (Esc incluido) el foco vuelve al botón si se quedó en el panel o se perdió.
    if (!abierto) {
      const activo = document.activeElement;
      if (!activo || activo === document.body || (e.target as HTMLElement).contains(activo)) {
        this.boton().nativeElement.focus();
      }
    }
  }
}
