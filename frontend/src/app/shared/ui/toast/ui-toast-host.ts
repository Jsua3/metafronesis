import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { TemaService } from '../../../core/tema/tema.service';
import { NotificationMessage, NotificationService, NotificationType } from '../../../core/notifications/notification.service';
import { UiIconButton } from '../button/ui-icon-button';

const ICONS: Record<NotificationType, string> = {
  success: 'check_circle',
  info: 'info',
  warning: 'warning',
  error: 'error',
};

/**
 * Avisos del sistema con el lenguaje visual (plan visual §2.5 y §2.7, F2-7) sobre `NotificationService` (≤ 4,
 * deduplicados, errores persistentes). NUNCA mueven el foco. Cada aviso se anuncia una vez por las regiones vivas
 * persistentes de la app (`LiveRegionAnnouncer`; los errores en modo `assertive`): un `role="alert"` dentro de la app
 * quedaría oculto a los lectores mientras haya un diálogo abierto, y una región que nace con su texto no se lee. La
 * región VISIBLE vive en la CAPA SUPERIOR (`popover="manual"`), así un error queda visible y operable aunque haya un
 * diálogo encima. El puntero o el foco encima pausan el cierre automático (WCAG 2.2.1) y cerrar un aviso con el
 * teclado devuelve el foco a donde estaba (2.4.3). Entrada 200 ms con `@starting-style`; salida 160 ms con
 * `animate.leave`.
 */
@Component({
  selector: 'ui-toast-host',
  imports: [MatIconModule, UiIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // La piel va en el anfitrión (un contenedor, nunca `body`: REGLA-010). Vive en `app.component`, fuera del shell del
  // portal, así que no la hereda: en el juego, siempre oscura; en el portal y la portada, la del tema (DISENO C13).
  host: {
    class: 'ui-toast-host',
    '[class.ui-toast-host--game]': "placement() === 'game'",
    '[attr.data-skin]': "placement() === 'game' ? 'game' : tema.piel()",
  },
  template: `
    <section #region class="ui-toast-host__region" popover="manual" aria-label="Mensajes del sistema">
      @for (message of messages(); track message.id) {
        <article class="ui-toast ds-motion" [class]="'ui-toast--' + message.type" animate.leave="ui-toast--leaving"
          (mouseenter)="notifications.pause(message.id)" (mouseleave)="onPointerLeave($event, message.id)"
          (focusin)="onFocusIn($event, message.id)" (focusout)="onFocusOut($event, message.id)">
          <mat-icon class="ui-toast__icon" aria-hidden="true">{{ icons[message.type] }}</mat-icon>
          <p class="ui-toast__text">{{ message.text }}</p>
          <button ui-icon-button icon="close" label="Cerrar aviso" (click)="dismiss($event, message.id)"></button>
        </article>
      }
    </section>
  `,
  styleUrl: './ui-toast-host.scss',
})
export class UiToastHost {
  /**
   * Dónde se apilan los avisos. `portal`: abajo a la derecha. `game` (F6-1): arriba a la izquierda, bajo la cabecera
   * del juego: abajo a la derecha están «Interactuar», la cruceta táctil y el pie del diálogo, abajo a la izquierda
   * «Salida segura», y a la derecha el panel de diálogo.
   */
  readonly placement = input<'portal' | 'game'>('portal');
  protected readonly notifications = inject(NotificationService);
  protected readonly tema = inject(TemaService);
  protected readonly messages = toSignal(this.notifications.messages$, { initialValue: [] });
  protected readonly icons = ICONS;
  private readonly announcer = inject(LiveRegionAnnouncer);
  private readonly announced = new Set<number>();
  private readonly region = viewChild.required<ElementRef<HTMLElement>>('region');
  /** Dónde estaba el foco antes de entrar a cada aviso (para devolverlo al cerrarlo). */
  private readonly returnFocus = new Map<number, HTMLElement>();
  private shownCount = 0;
  private open = false;

  constructor() {
    this.notifications.messages$.pipe(takeUntilDestroyed()).subscribe(messages => this.announceNew(messages));
    effect(() => this.syncTopLayer(this.messages().length));
  }

  /** Muestra la región en la capa superior con el primer aviso, la vuelve a subir con cada aviso nuevo y la oculta sin avisos. */
  private syncTopLayer(count: number): void {
    const region = this.region().nativeElement;
    if (typeof region.showPopover !== 'function' || !region.isConnected) return;
    const grew = count > this.shownCount;
    this.shownCount = count;
    if (count === 0) {
      if (this.open) region.hidePopover();
      this.open = false;
      return;
    }
    // Un aviso nuevo debe quedar por encima de un diálogo abierto después: se vuelve a subir, salvo que el foco esté
    // dentro (ocultarla un instante lo perdería).
    if (this.open && grew && !region.contains(document.activeElement)) {
      region.hidePopover();
      this.open = false;
    }
    if (!this.open) {
      region.showPopover();
      this.open = true;
    }
  }

  protected onFocusIn(event: FocusEvent, id: number): void {
    this.notifications.pause(id);
    const from = event.relatedTarget;
    const item = event.currentTarget as HTMLElement;
    if (from instanceof HTMLElement && !item.contains(from) && !this.returnFocus.has(id)) this.returnFocus.set(id, from);
  }

  /** Cerrar con el teclado: el foco vuelve a donde estaba antes de entrar al aviso. */
  protected dismiss(event: Event, id: number): void {
    const item = (event.currentTarget as HTMLElement).closest('.ui-toast');
    const hadFocus = !!item?.contains(document.activeElement);
    const back = this.returnFocus.get(id);
    this.returnFocus.delete(id);
    this.notifications.dismiss(id);
    if (hadFocus && back?.isConnected) back.focus();
  }

  /** El puntero sale: se reanuda solo si el foco no sigue dentro del aviso. */
  protected onPointerLeave(event: Event, id: number): void {
    const item = event.currentTarget as HTMLElement;
    if (item.contains(item.ownerDocument.activeElement)) return;
    this.notifications.resume(id);
  }

  /** El foco sale: se reanuda solo si no pasa a otro punto del aviso ni queda el puntero encima. */
  protected onFocusOut(event: Event, id: number): void {
    const item = event.currentTarget as HTMLElement;
    const next = (event as FocusEvent).relatedTarget;
    if (next instanceof Node && item.contains(next)) return;
    if (item.matches(':hover')) return;
    this.notifications.resume(id);
  }

  private announceNew(messages: readonly NotificationMessage[]): void {
    const visible = new Set(messages.map(message => message.id));
    for (const id of this.announced) if (!visible.has(id)) this.announced.delete(id);
    for (const id of this.returnFocus.keys()) if (!visible.has(id)) this.returnFocus.delete(id);
    for (const message of messages) {
      if (this.announced.has(message.id)) continue;
      this.announced.add(message.id);
      this.announcer.announce(message.text, message.type === 'error' ? 'assertive' : 'polite');
    }
  }
}
