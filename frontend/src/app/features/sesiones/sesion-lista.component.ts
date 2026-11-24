import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api/api-error.util';
import { SesionesApi } from '../../core/api/sesiones.api';
import { SesionResumen } from '../../core/models/sesion.model';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  UiBadge, UiButton, UiCelda, UiCeldaPrincipal, UiDataStateValue, UiDialog, UiEmptyState, UiPageActions, UiPageHeader,
  UiSegmentado, UiTable, UiTableRow, UiTableTable,
} from '../../shared/ui';
import { SesionDialogComponent, SesionDialogData, SesionDialogResult } from './sesion-dialog.component';
import { ESTADOS, FILTROS, horario } from './sesion-presentacion';

/** Lista de sesiones del docente, filtrada por momento (próximas, en curso, terminadas, todas). */
@Component({
  selector: 'app-sesion-lista',
  imports: [
    RouterLink, UiBadge, UiButton, UiCelda, UiCeldaPrincipal, UiEmptyState, UiPageActions, UiPageHeader, UiSegmentado,
    UiTable, UiTableRow, UiTableTable,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- BORRADOR: textos pendientes de Psicología (VD-23). -->
    <ui-page-header title="Sesiones" description="Programa una clase con un grupo y un caso de la biblioteca, y guíala en vivo.">
      <button ui-button uiPageActions type="button" icon="add" (click)="nueva()">Nueva sesión</button>
    </ui-page-header>
    <ui-segmentado etiqueta="Momento de la sesión" [opciones]="filtros" [(valor)]="filtro" />
    @if (estado() === 'ready' && sesiones().length === 0) {
      <ui-empty-state
        [kind]="filtro() === 'todas' ? 'first-use' : 'no-results'"
        [title]="filtro() === 'todas' ? 'Aún no tienes sesiones' : 'No hay sesiones aquí'"
        description="Una sesión entrega un caso a un grupo en un horario."
        [withAction]="filtro() === 'todas'" actionLabel="Nueva sesión" (action)="nueva()" />
    } @else {
      <ui-table label="Sesiones" [state]="estado()" apilar>
        <table ui-table>
          <thead>
            <tr><th>Caso</th><th>Grupo</th><th>Horario</th><th>Estado</th><th>Convocados</th></tr>
          </thead>
          <tbody>
            @for (s of sesiones(); track s.id) {
              <tr uiRow>
                <td uiCeldaPrincipal>
                  <a [routerLink]="['/portal/sesiones', s.id]">{{ s.caso.titulo }}</a>
                  <span class="sl-sub">{{ s.espacioAcademico }}</span>
                </td>
                <td uiCelda="Grupo">{{ s.grupo?.nombre ?? '—' }}</td>
                <td uiCelda="Horario">{{ horario(s.inicio, s.fin) }}</td>
                <td uiCelda="Estado"><ui-badge [tone]="estados[s.estado].tono">{{ estados[s.estado].etiqueta }}</ui-badge></td>
                <td uiCelda="Convocados">{{ s.totalConvocados }}</td>
              </tr>
            }
          </tbody>
        </table>
      </ui-table>
    }
  `,
  styles: [`
    :host { display: grid; gap: var(--ds-space-5); }
    .sl-sub { display: block; color: var(--ds-text-2); font-size: var(--ds-type-body-s-size); }
  `],
})
export class SesionListaComponent {
  private readonly api = inject(SesionesApi);
  private readonly dialog = inject(UiDialog);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly filtros = FILTROS;
  protected readonly estados = ESTADOS;
  protected readonly horario = horario;
  protected readonly filtro = signal('proximas');
  protected readonly sesiones = signal<SesionResumen[]>([]);
  protected readonly estado = signal<UiDataStateValue>('loading');

  constructor() {
    effect(() => this.cargar(this.filtro()));
  }

  private cargar(valor: string): void {
    const filtro = FILTROS.find(f => f.valor === valor) ?? FILTROS[0];
    this.estado.set('loading');
    this.api.listar(filtro.estados).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: filas => { this.sesiones.set(filas); this.estado.set('ready'); },
      error: err => {
        this.estado.set('error');
        // BORRADOR: texto pendiente de Psicología (VD-23).
        const texto = apiErrorMessage(err, 'No pudimos cargar las sesiones.');
        if (texto) this.notify.error(texto);
      },
    });
  }

  protected nueva(): void {
    const ref = this.dialog.open<SesionDialogResult | undefined, SesionDialogData>(SesionDialogComponent, { data: { modo: 'crear' } });
    ref.closed.subscribe(resultado => {
      if (resultado) void this.router.navigate(['/portal/sesiones', resultado.id]);
    });
  }
}
