import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type UiBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/**
 * Insignia de estado (plan visual F2-3; VD-3): una píldora con TEXTO («Publicado», «Borrador»); el tono solo lo
 * acompaña (WCAG 1.4.1). Sin puntos ni iconos de color. Los textos salen de `labels.ts` (statusLabel, etc.).
 */
@Component({
  selector: 'ui-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-badge',
    '[class.ui-badge--neutral]': "tone() === 'neutral'",
    '[class.ui-badge--info]': "tone() === 'info'",
    '[class.ui-badge--success]': "tone() === 'success'",
    '[class.ui-badge--warning]': "tone() === 'warning'",
    '[class.ui-badge--danger]': "tone() === 'danger'",
  },
  template: '<ng-content />',
  styleUrl: './ui-badge.scss',
})
export class UiBadge {
  readonly tone = input<UiBadgeTone>('neutral');
}
