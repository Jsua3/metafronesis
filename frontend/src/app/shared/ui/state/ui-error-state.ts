import {
  ChangeDetectionStrategy, Component, ElementRef, Injectable, afterNextRender, booleanAttribute, computed, inject, input,
  output, viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { UiButton } from '../button/ui-button';
import { ERROR_STATE_COPY, STATE_ACTION_COPY, UiErrorKind } from './state-copy';

export type { UiErrorKind } from './state-copy';

/**
 * Recuerda EN QUÉ BLOQUE se pulsó «Reintentar» (el contenedor del estado de error). Lo normal es que el bloque pase a
 * «cargando» (el estado de error se desmonta, y con él el botón que tenía el foco) y, si falla otra vez, se monte un
 * estado de error NUEVO en ese mismo bloque: ese recibe el foco (WCAG 2.4.3), sin ventana de tiempo, y solo si el
 * foco se perdió (si la persona ya está en otro control, no se le roba).
 */
@Injectable({ providedIn: 'root' })
export class UiRetryTracker {
  private block: Element | null = null;

  markRetry(block: Element | null): void {
    this.block = block;
  }

  consumeRetry(block: Element | null): boolean {
    const matches = block !== null && block === this.block;
    if (matches) this.block = null;
    return matches;
  }
}

function focusWasLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

/**
 * Estado de error (plan visual §2.5, F2-5): nunca tragado. Mensaje humano, «Reintentar» donde puede cambiar algo
 * (red, servidor) y el detalle técnico plegado con el código HTTP. Bloqueante: `role="alert"`; parcial (un bloque):
 * `role="status"` y el resto de la página sigue viva. Tras un reintento fallido el foco va a su título.
 */
@Component({
  selector: 'ui-error-state',
  imports: [MatIconModule, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-error-state',
    '[class.ui-error-state--blocking]': 'blocking()',
    '[attr.role]': "blocking() ? 'alert' : 'status'",
  },
  template: `
    <mat-icon class="ui-error-state__icon" aria-hidden="true">{{ copy().icon }}</mat-icon>
    <p #title class="ui-error-state__title" tabindex="-1">{{ copy().title }}</p>
    <p class="ui-error-state__message">{{ message() || copy().message }}</p>
    @if (copy().retry) {
      <button ui-button type="button" variant="secondary" (click)="onRetry()">{{ actions.retry }}</button>
    }
    @if (technical(); as technical) {
      <details class="ui-error-state__details">
        <summary>{{ actions.technicalDetail }}</summary>
        <code>{{ technical }}</code>
      </details>
    }
  `,
  styleUrl: './ui-error-state.scss',
})
export class UiErrorState {
  readonly kind = input<UiErrorKind>('server');
  readonly message = input<string | null | undefined>(null);
  readonly detail = input<string | null | undefined>(null);
  readonly status = input<number | null | undefined>(null);
  readonly blocking = input(false, { transform: booleanAttribute });
  /**
   * Al montarse mueve el foco a su título: un error bloqueante que aparece por sí solo (p. ej. el juego que no
   * carga) deja el foco en el cuerpo y quien usa teclado o lector no lo encuentra.
   */
  readonly autofocus = input(false, { transform: booleanAttribute });
  readonly retry = output<void>();

  protected readonly actions = STATE_ACTION_COPY;
  protected readonly copy = computed(() => ERROR_STATE_COPY[this.kind()]);
  protected readonly technical = computed(() => {
    const status = this.status();
    const parts = [status === null || status === undefined ? null : `HTTP ${status}`, this.detail() || null];
    return parts.filter(Boolean).join(' · ') || null;
  });

  private readonly tracker = inject(UiRetryTracker);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');
  private retryPending = false;

  constructor() {
    afterNextRender(() => {
      const retried = this.tracker.consumeRetry(this.host.parentElement);
      if (this.autofocus() || (retried && focusWasLost())) this.title().nativeElement.focus();
    });
  }

  /**
   * Para contenedores que OCULTAN el error en vez de desmontarlo (ui-table): si esta instancia tenía un reintento
   * pendiente, el foco va a su título.
   */
  focusAfterRetry(): void {
    if (!this.retryPending) return;
    this.retryPending = false;
    this.tracker.consumeRetry(this.host.parentElement);
    this.title().nativeElement.focus();
  }

  /** El bloque cargó bien: se olvida el reintento pendiente. */
  clearRetry(): void {
    this.retryPending = false;
    this.tracker.consumeRetry(this.host.parentElement);
  }

  protected onRetry(): void {
    this.retryPending = true;
    this.tracker.markRetry(this.host.parentElement);
    this.retry.emit();
  }
}
