import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const NUMBER_FORMAT = new Intl.NumberFormat('es-CO');

/**
 * Cifra con rótulo (plan visual F2-3): rótulo → cifra → aclaración, en ese orden de lectura. Los números salen con
 * el formato de Colombia (1.234); un texto («9,5 / 10») se muestra tal cual.
 */
@Component({
  selector: 'ui-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-stat' },
  template: `
    <span class="ui-stat__label">{{ label() }}</span>
    <span class="ui-stat__value">{{ formatted() }}</span>
    @if (hint()) {
      <span class="ui-stat__hint">{{ hint() }}</span>
    }
  `,
  styleUrl: './ui-stat.scss',
})
export class UiStat {
  readonly label = input.required<string>();
  readonly value = input.required<number | string>();
  readonly hint = input<string | null | undefined>(null);

  protected readonly formatted = computed(() => {
    const value = this.value();
    return typeof value === 'number' ? NUMBER_FORMAT.format(value) : value;
  });
}
