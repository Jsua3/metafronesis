import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationSkipped, NavigationStart, Router } from '@angular/router';

/** Umbral antes de mostrar la línea de cambio de ruta (plan visual §2.5). */
export const UI_ROUTE_PROGRESS_DELAY_MS = 120;

/**
 * Línea de progreso del cambio de ruta (plan visual §2.5, F2-4): 2 px bajo la barra de navegación (F3 la coloca),
 * visible solo si la navegación tarda más de 120 ms; se va al terminar, cancelarse, saltarse o fallar. Es
 * decorativa: el cambio de página lo anuncia el título de la pestaña (F3).
 */
@Component({
  selector: 'ui-route-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-route-progress ds-motion',
    'aria-hidden': 'true',
    '[class.ui-route-progress--active]': 'active()',
  },
  template: '<span class="ui-route-progress__bar"></span>',
  styleUrl: './ui-route-progress.scss',
})
export class UiRouteProgress {
  protected readonly active = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) {
        this.clear();
        this.timer = setTimeout(() => this.active.set(true), UI_ROUTE_PROGRESS_DELAY_MS);
      } else if (
        event instanceof NavigationEnd || event instanceof NavigationCancel
        || event instanceof NavigationError || event instanceof NavigationSkipped
      ) {
        this.clear();
        this.active.set(false);
      }
    });
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  private clear(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
