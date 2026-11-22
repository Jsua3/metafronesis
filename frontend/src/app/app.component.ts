import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { LiveRegionAnnouncer } from './core/a11y/live-announcer.service';
import { readRouteChrome } from './shared/layout/route-chrome';
import { UiToastHost } from './shared/ui/toast/ui-toast-host';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, UiToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="psy-skip-link" href="#main-content" (click)="skipTo($event, 'main-content')">Saltar al contenido principal</a>
    @if (isGameRoute()) {
      <!-- El destino siempre existe (#main-content, el contenedor del juego); se enfoca #game-area cuando el mundo ya está. -->
      <a class="psy-skip-link" href="#main-content" (click)="skipTo($event, 'game-area', 'main-content')">Saltar al juego</a>
    }
    <!-- Diferido: el anfitrión trae el tooltip y el overlay del CDK (~80 kB) y no hace falta para el primer pintado.
         Los avisos emitidos antes de montarlo los pinta y anuncia al montarse (NotificationService conserva la lista). -->
    @defer (on idle) {
      <ui-toast-host [placement]="inGame() ? 'game' : 'portal'" />
    }
    <router-outlet />
  `
})
export class AppComponent {
  constructor() {
    // Las regiones vivas (polite y assertive) tienen que existir ANTES de que alguien anuncie: una región que nace con
    // su texto no se lee. Se monta aquí, fuera del @defer del anfitrión de avisos, y no depende de ningún componente.
    inject(LiveRegionAnnouncer);
  }

  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Solo dentro de un caso hay un «juego» al que saltar. */
  readonly isGameRoute = computed(() => /\/portal\/simulador\/\d+/.test(this.url()));

  /** Pantalla a sangre del juego (la sala y el caso: `chrome: 'hidden'`): ahí los avisos van arriba a la izquierda. */
  readonly inGame = computed(() => {
    this.url();
    return readRouteChrome(this.router) === 'hidden';
  });

  /**
   * Con <base href="/">, un href="#x" navega a "/#x" (la portada). Se intercepta el clic y se mueve el foco al
   * destino, o al de respaldo si aún no existe (p. ej. el mundo antes del consentimiento) o, si tampoco, al primer
   * <main> de la página.
   */
  skipTo(event: Event, targetId: string, fallbackId?: string): void {
    event.preventDefault();
    const target = document.getElementById(targetId)
      ?? (fallbackId ? document.getElementById(fallbackId) : null)
      ?? document.querySelector<HTMLElement>('main');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
  }
}
