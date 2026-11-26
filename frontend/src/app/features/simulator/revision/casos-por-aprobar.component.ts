import { ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { SimulationCaseSummary } from '../../../core/models/simulation.model';
import { UiButton } from '../../../shared/ui/button/ui-button';
import { UiSection } from '../../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../../shared/ui/skeleton/ui-skeleton';
import { UiErrorState } from '../../../shared/ui/state/ui-error-state';
import { CasosPorAprobarService } from './casos-por-aprobar.service';

/**
 * «Casos por aprobar (N)» arriba de la pantalla «Revisión» de la administración. En la prueba de uso la administradora abrió
 * «Revisión» buscando qué aprobar y encontró la valoración de intentos de estudiantes: los casos enviados a revisión
 * estaban en «Casos → Ver revisión». Aquí están a la vista, cada uno con su acción («Revisar y aprobar» abre el caso en
 * su revisión, donde está «Aprobar y publicar»). Para otros roles no pinta nada ni pide nada: aprobar es solo del ADMIN.
 * La cifra sale de `CasosPorAprobarService`, la misma de la insignia del menú.
 */
@Component({
  selector: 'app-casos-por-aprobar',
  imports: [RouterLink, UiButton, UiErrorState, UiSection, UiSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <ui-section [title]="titulo()">
        @switch (estado()) {
          @case ('loading') { <ui-skeleton shape="row" aria-busy="true" /> }
          @case ('error') {
            <ui-error-state kind="server" message="No pudimos cargar los casos por aprobar." (retry)="cargar()" />
          }
          @default {
            @if (!casos().length) {
              <p class="cpa-vacio">No hay casos esperando tu aprobación.</p>
            } @else {
              <ul class="cpa-lista">
                @for (caso of casos(); track caso.caseVersionId) {
                  <li class="cpa-fila">
                    <span class="cpa-texto"><strong>{{ caso.title }}</strong><span>{{ caso.code }} · En revisión de Psicología</span></span>
                    <a ui-button variant="primary" size="sm" [routerLink]="['/portal/casos', caso.caseVersionId, 'editor', 'revision']">Revisar y aprobar<span class="ds-sr-only"> «{{ caso.title }}»</span></a>
                  </li>
                }
              </ul>
            }
          }
        }
      </ui-section>
    }
  `,
  styles: `
    :host { display: block; margin-block-start: var(--ds-space-5); }
    .cpa-vacio { margin: 0; color: var(--ds-text-2); }
    .cpa-lista { display: grid; gap: var(--ds-space-3); margin: 0; padding: 0; list-style: none; }
    .cpa-fila {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ds-space-2) var(--ds-space-4);
      padding: var(--ds-space-3) var(--ds-space-4); border: 1px solid var(--ds-border); border-radius: var(--ds-radius-md);
    }
    .cpa-texto { display: grid; gap: var(--ds-space-1); min-inline-size: 0; overflow-wrap: anywhere; }
    .cpa-texto > span { color: var(--ds-text-2); font-size: var(--ds-type-body-s-size); line-height: var(--ds-type-body-s-line); }
  `,
})
export class CasosPorAprobarComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private carga: Subscription | null = null;

  protected readonly visible = computed(() => this.auth.currentUser()?.role === 'ADMIN');
  protected readonly estado = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly casos = signal<SimulationCaseSummary[]>([]);
  protected readonly titulo = computed(() => (this.estado() === 'ready' ? `Casos por aprobar (${this.casos().length})` : 'Casos por aprobar'));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.carga?.unsubscribe());
  }

  ngOnInit(): void {
    if (this.visible()) this.cargar();
  }

  protected cargar(): void {
    this.carga?.unsubscribe();
    this.estado.set('loading');
    // El servicio (y con él el cliente HTTP) se pide solo para quien aprueba.
    this.carga = this.injector.get(CasosPorAprobarService).cargar().subscribe({
      next: lista => { this.casos.set(lista); this.estado.set('ready'); },
      error: () => this.estado.set('error'),
    });
  }
}
