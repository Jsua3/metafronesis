import {
  ChangeDetectionStrategy, Component, ViewEncapsulation, computed, effect, inject, input, signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { describeHostWith } from '../describe';
import { UiSpinner } from '../spinner/ui-spinner';
import { UI_TOOLTIP_TAP_VISIBLE_MS, injectUiTooltip } from '../tooltip/ui-tooltip';
import { guardClicks, uniqueUiId } from './click-guard';

export type UiButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type UiButtonSize = 'sm' | 'md' | 'lg';

/** Retardo antes de mostrar el indicador de carga (plan visual §2.5): una acción rápida no parpadea. */
export const UI_BUTTON_SPINNER_DELAY_MS = 150;

/**
 * Botón del lenguaje visual (plan visual F2-1). Es un ATRIBUTO sobre `<button>` o `<a>`: conserva la semántica
 * nativa (tipo, envío de formulario, href, foco). Con `disabledReason` o `loading` queda `aria-disabled` —sigue
 * enfocable y su motivo se lee por `aria-describedby`— y bloquea el clic antes que cualquier otro oyente: no hay
 * doble envío ni clics «muertos» sin explicación. Cargando, el indicador aparece a los 150 ms en el lugar del icono
 * (o encima del texto, que conserva su sitio): el ancho no cambia. Con el ratón, el motivo también se ve en un globo
 * a los 400 ms (§2.6); al PULSAR el botón bloqueado (clic rápido o toque, sin hover) el motivo aparece al instante y
 * se anuncia; el lector ya lo tiene por aria-describedby.
 *
 * Los estilos son globales con nombres BEM (`ViewEncapsulation.None`), como Material: el anfitrión es el propio
 * `<button>`/`<a>` del consumidor.
 */
@Component({
  selector: 'button[ui-button], a[ui-button]',
  imports: [MatIconModule, UiSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ui-button ds-motion',
    '[class.ui-button--primary]': "variant() === 'primary'",
    '[class.ui-button--secondary]': "variant() === 'secondary'",
    '[class.ui-button--ghost]': "variant() === 'ghost'",
    '[class.ui-button--danger]': "variant() === 'danger'",
    '[class.ui-button--sm]': "size() === 'sm'",
    '[class.ui-button--md]': "size() === 'md'",
    '[class.ui-button--lg]': "size() === 'lg'",
    '[class.ui-button--loading]': 'loading()',
    '[class.ui-button--spinner-overlay]': 'showSpinner() && !icon()',
    '[attr.aria-disabled]': "blocked() ? 'true' : null",
    '[attr.aria-busy]': "loading() ? 'true' : null",
  },
  template: `
    @if (icon()) {
      <span class="ui-button__icon-slot" aria-hidden="true">
        @if (showSpinner()) {
          <ui-spinner [size]="16" />
        } @else {
          <mat-icon class="ui-button__icon" aria-hidden="true">{{ icon() }}</mat-icon>
        }
      </span>
    }
    <span class="ui-button__label"><ng-content /></span>
    @if (iconEnd()) {
      <mat-icon class="ui-button__icon" aria-hidden="true">{{ iconEnd() }}</mat-icon>
    }
    @if (showSpinner() && !icon()) {
      <ui-spinner class="ui-button__spinner--overlay" [size]="16" />
    }
    @if (disabledReason()) {
      <span hidden [id]="reasonId">{{ disabledReason() }}</span>
    }
  `,
  styleUrl: './ui-button.scss',
})
export class UiButton {
  readonly variant = input<UiButtonVariant>('primary');
  readonly size = input<UiButtonSize>('md');
  readonly loading = input(false);
  readonly disabledReason = input<string | null>(null);
  readonly icon = input<string | undefined>(undefined);
  readonly iconEnd = input<string | undefined>(undefined);

  protected readonly reasonId = uniqueUiId('ui-button-reason');
  protected readonly showSpinner = signal(false);
  protected readonly blocked = computed(() => this.loading() || !!this.disabledReason());

  constructor() {
    const tooltip = injectUiTooltip({ describe: false });
    const announcer = inject(LiveRegionAnnouncer);
    guardClicks(() => this.blocked(), () => {
      const reason = this.disabledReason();
      if (!reason) return;
      tooltip.showNow(UI_TOOLTIP_TAP_VISIBLE_MS);
      announcer.announce(reason, 'polite');
    });
    describeHostWith(() => (this.disabledReason() ? this.reasonId : null));
    effect(() => tooltip.setText(this.disabledReason()));
    effect(onCleanup => {
      if (!this.loading()) {
        this.showSpinner.set(false);
        return;
      }
      const timer = setTimeout(() => this.showSpinner.set(true), UI_BUTTON_SPINNER_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }
}
