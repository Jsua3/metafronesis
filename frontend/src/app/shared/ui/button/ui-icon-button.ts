import {
  ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation, computed, effect, inject, input,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { describeHostWith } from '../describe';
import { UI_TOOLTIP_TAP_VISIBLE_MS, injectUiTooltip } from '../tooltip/ui-tooltip';
import { guardClicks, uniqueUiId } from './click-guard';
import { UiButtonVariant } from './ui-button';

/**
 * Botón de solo icono (plan visual F2-1). `icon` y `label` son obligatorios: el `label` es el nombre accesible
 * (`aria-label`); sin él la plantilla no compila. Cuadrado de 44 px. Fantasma por defecto. En un `<button>` el
 * tipo por defecto es `button` (un icono dentro de un formulario —mostrar contraseña, borrar fila— nunca debe
 * enviarlo). Con `disabledReason` sigue enfocable, explica el motivo y no dispara el clic. Un globo muestra el
 * `label` (o el motivo) con el ratón y con el foco de teclado: el icono solo no basta para quien ve.
 */
@Component({
  selector: 'button[ui-icon-button], a[ui-icon-button]',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ui-icon-button ds-motion',
    '[class.ui-icon-button--primary]': "variant() === 'primary'",
    '[class.ui-icon-button--secondary]': "variant() === 'secondary'",
    '[class.ui-icon-button--ghost]': "variant() === 'ghost'",
    '[class.ui-icon-button--danger]': "variant() === 'danger'",
    '[attr.type]': 'isButton ? type() : null',
    '[attr.aria-label]': 'label()',
    '[attr.aria-disabled]': "disabledReason() ? 'true' : null",
  },
  template: `
    <mat-icon class="ui-icon-button__icon" aria-hidden="true">{{ icon() }}</mat-icon>
    @if (disabledReason()) {
      <span hidden [id]="reasonId">{{ disabledReason() }}</span>
    }
  `,
  styleUrl: './ui-icon-button.scss',
})
export class UiIconButton {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  readonly variant = input<UiButtonVariant>('ghost');
  readonly disabledReason = input<string | null>(null);
  readonly type = input<'button' | 'submit' | 'reset'>('button');

  protected readonly isButton = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.tagName === 'BUTTON';
  protected readonly reasonId = uniqueUiId('ui-icon-button-reason');
  private readonly blocked = computed(() => !!this.disabledReason());

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
    effect(() => tooltip.setText(this.disabledReason() ?? this.label()));
  }
}
