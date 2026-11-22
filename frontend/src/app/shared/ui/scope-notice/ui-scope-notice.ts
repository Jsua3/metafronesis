import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { UiBadge } from '../badge/ui-badge';

/**
 * Frase de la regla RN-01 en BORRADOR (VD-23, decisión 17): la usa el componente mientras Psicología no fije el texto
 * oficial y las pantallas donde va (acceso, aviso previo y resultado). Cambiarla es decisión de Psicología.
 */
export const SCOPE_NOTICE_DRAFT_TEXT = 'SIEP es un simulador con fines educativos; no realiza diagnósticos clínicos.';

/**
 * Aviso de alcance (plan visual F2-11; RN-01): nota con nombre («Alcance del simulador»), no una alerta. Lleva la
 * frase de la regla marcada como borrador, de forma visible (insignia) y para el lector (texto), hasta que Psicología
 * la valide. Se coloca FUERA de los bloques de texto validado (aviso previo del juego, F6-2).
 */
@Component({
  selector: 'ui-scope-notice',
  imports: [MatIconModule, UiBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-scope-notice',
    role: 'note',
    'aria-label': 'Alcance del simulador',
    'data-draft': 'true',
  },
  template: `
    <mat-icon class="ui-scope-notice__icon" aria-hidden="true">school</mat-icon>
    <p class="ui-scope-notice__text">{{ text }}</p>
    <p class="ui-scope-notice__draft">
      <ui-badge tone="warning">Borrador</ui-badge>
      <span class="ui-scope-notice__draft-note">Texto pendiente de validación por Psicología.</span>
    </p>
  `,
  styleUrl: './ui-scope-notice.scss',
})
export class UiScopeNotice {
  protected readonly text = SCOPE_NOTICE_DRAFT_TEXT;
}
