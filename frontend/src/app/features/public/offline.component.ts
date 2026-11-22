import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, InjectionToken, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { TemaService } from '../../core/tema/tema.service';
import { safeReturnUrl } from '../../core/auth/return-url';
import { PaginaEstadoComponent } from '../../shared/layout/pagina-estado/pagina-estado.component';
import { UiButton } from '../../shared/ui/button/ui-button';

/**
 * Carga completa de una ruta. «Reintentar» sin conexión NO puede navegar con el Router: el navegador guarda en su
 * mapa de módulos la descarga fallida y otro import() de la misma URL fallaría aunque ya haya red.
 */
export const FULL_NAVIGATION = new InjectionToken<(url: string) => void>('FULL_NAVIGATION', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return (url: string) => document.location.assign(url);
  },
});

const STILL_OFFLINE = 'Todavía no hay conexión. Vuelve a intentarlo en un momento.';
/** Pausa entre vaciar la región viva y volver a llenarla, para que el lector anuncie el mismo texto otra vez. */
const ANNOUNCE_GAP_MS = 150;

/**
 * «Sin conexión» (plan visual F4-3; `sin-conexion?desde=`): adonde lleva una navegación que no pudo descargar su
 * código (offline-navigation.ts). Es perezosa pero se PRECARGA con red tras la primera navegación (PreloadMarkedRoutes):
 * sin red ya está cargada. Es mínima (sin barra ni enlaces del Router) para que esa precarga sea ligera y no dependa
 * de nada más. «Reintentar» carga de nuevo la ruta pedida si es interna; sin red, lo dice y no recarga.
 */
@Component({
  selector: 'app-offline',
  imports: [PaginaEstadoComponent, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="portal" [attr.data-skin]="tema.piel()">
    <main id="main-content" tabindex="-1" class="sin-red">
      <app-pagina-estado tipo="sin-conexion" titulo="Sin conexión"
        texto="No pudimos cargar esta parte de SIEP porque no hay conexión."
        detalle="Lo que hiciste hasta el último guardado está a salvo. Cuando vuelva la conexión, sigue donde quedaste.">
        <button ui-button type="button" (click)="retry()">Reintentar</button>
      </app-pagina-estado>
      <!-- Región viva SIEMPRE presente (una que nace con su texto no se anuncia): se vacía y se vuelve a llenar en
           cada reintento sin red, para que se oiga cada vez. -->
      <p class="sin-red__aviso" role="status" aria-live="polite">{{ offlineNotice() }}</p>
    </main>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .sin-red {
      display: grid;
      justify-items: start;
      gap: var(--ds-space-5);
      max-width: 40rem;
      margin-inline: auto;
      padding: var(--ds-space-8) var(--ds-space-4);
    }
    .sin-red app-pagina-estado { justify-self: stretch; }
    .sin-red__aviso {
      margin: 0;
      color: var(--ds-text-2);
      font-size: var(--ds-type-body-s-size);
    }
  `],
})
export class OfflineComponent {
  protected readonly tema = inject(TemaService);
  private readonly from = inject(ActivatedRoute).snapshot.queryParamMap.get('desde');
  private readonly fullNavigation = inject(FULL_NAVIGATION);
  /** Se pulsó «Reintentar» sin red: se dice, en vez de recargar hacia la página de error del navegador. */
  protected readonly offlineNotice = signal('');

  /** «Reintentar»: carga completa de la ruta pedida si es interna (return-url.ts); si no, el inicio. */
  protected retry(): void {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Vaciar y volver a llenar tras una pausa breve: el mismo texto otra vez no se anunciaría.
      this.offlineNotice.set('');
      setTimeout(() => this.offlineNotice.set(STILL_OFFLINE), ANNOUNCE_GAP_MS);
      return;
    }
    this.fullNavigation(safeReturnUrl(this.from) ?? '/');
  }
}
