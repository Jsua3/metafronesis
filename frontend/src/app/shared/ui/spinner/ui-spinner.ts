import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Indicador de actividad indeterminada (plan visual F2-1 y F2-4). Decorativo por defecto (`aria-hidden`): quien lo
 * usa anuncia el estado (p. ej. el `aria-busy` del botón). Con `label` se anuncia como `role="status"`. Con
 * movimiento reducido deja de girar y queda como un anillo estático.
 */
@Component({
  selector: 'ui-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-spinner ds-motion',
    '[attr.role]': "label() ? 'status' : null",
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': "label() ? null : 'true'",
    '[style.--_size]': "size() + 'px'",
  },
  template: '',
  styleUrl: './ui-spinner.scss',
})
export class UiSpinner {
  /** Lado en píxeles CSS. */
  readonly size = input(20);
  readonly label = input<string | null>(null);
}
