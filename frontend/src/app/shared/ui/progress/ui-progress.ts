import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Barra de progreso (plan visual F2-4): `role="progressbar"` con nombre (`label`), mínimo, máximo, valor y un texto
 * legible («3 de 5», «40 %»). Sin valor es indeterminada. El relleno avanza con `transform` (no anima el ancho).
 */
@Component({
  selector: 'ui-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-progress ds-motion',
    role: 'progressbar',
    'aria-valuemin': '0',
    '[attr.aria-label]': 'label()',
    '[attr.aria-valuemax]': 'max()',
    '[attr.aria-valuenow]': 'now()',
    '[attr.aria-valuetext]': 'valueText()',
    '[class.ui-progress--indeterminate]': 'now() === null',
    '[style.--_ratio]': 'ratio()',
  },
  template: '<span class="ui-progress__track"><span class="ui-progress__fill"></span></span>',
  styleUrl: './ui-progress.scss',
})
export class UiProgress {
  readonly label = input.required<string>();
  readonly value = input<number | null>(null);
  readonly max = input(100);

  protected readonly now = computed(() => {
    const value = this.value();
    return value === null || value === undefined ? null : Math.min(Math.max(value, 0), this.max());
  });
  protected readonly ratio = computed(() => {
    const now = this.now();
    return now === null || this.max() <= 0 ? null : String(now / this.max());
  });
  protected readonly valueText = computed(() => {
    const now = this.now();
    if (now === null) return null;
    return this.max() === 100 ? `${now} %` : `${now} de ${this.max()}`;
  });
}
