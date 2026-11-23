import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { UiButton } from '../../shared/ui/button/ui-button';
import { DRAFT_COPY } from './draft-copy';

/**
 * Ensayo descartado (la docente borró una escena, una respuesta o un mapa) o ya cerrado (409): se dice con su salida, nunca
 * una pantalla en blanco. No lleva `role="alert"`: lo anuncia el anunciador de la app una sola vez. «Salida segura» queda en
 * el pie, fuera de este aviso (REGLA-004).
 */
@Component({
  selector: 'app-rehearsal-gone',
  imports: [RouterLink, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="rg__text" tabindex="-1">{{ motivo() === 'closed' ? draft.rehearsalClosed.text : draft.rehearsalGone.text }}</p>
    <button ui-button class="restart" type="button" variant="primary" (click)="restart.emit()">{{ draft.rehearsalRestart.text }}</button>
    <a ui-button variant="secondary" [routerLink]="['/portal/casos', caseVersionId(), 'editor']">{{ draft.rehearsalBackToEditor.text }}</a>
  `,
  styles: [`.rg__text { margin: 0; max-inline-size: 28rem; font-size: 1.05rem; }`],
})
export class RehearsalGoneComponent {
  readonly motivo = input<'gone' | 'closed'>('gone');
  readonly caseVersionId = input.required<number>();
  readonly restart = output<void>();
  protected readonly draft = DRAFT_COPY;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => host.querySelector<HTMLElement>('.rg__text')?.focus({ preventScroll: true }));
  }
}
