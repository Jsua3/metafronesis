import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthoringApi } from '../../core/api/authoring.api';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { statusLabel } from '../../shared/ui/labels';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { UiFiltros } from '../../shared/ui/filtros/ui-filtros';
import { UiSegmentado } from '../../shared/ui/segmentado/ui-segmentado';
import { UiPortadaCaso } from '../../shared/ui/portada-caso/ui-portada-caso';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiVacioIlustrado } from '../../shared/ui/vacio-ilustrado/ui-vacio-ilustrado';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';

/**
 * Hub de edición de casos (plan visual F7-7): estados de la lista de a uno (esqueleto, error con «Reintentar», primer
 * uso con su acción) y el estado de cada caso con su etiqueta humana («Borrador», no `DRAFT`). Todo caso nuevo empieza
 * eligiendo un lugar (`casos/nuevo`): ya no hay formulario de caso en blanco.
 */
@Component({
  selector: 'app-case-authoring-hub',
  standalone: true,
  imports: [
    RouterLink, NgTemplateOutlet, UiFiltros, UiSegmentado, UiPortadaCaso,
    UiBadge, UiButton, UiCard, UiCabeceraIlustrada, UiSection, UiSkeleton,
    UiVacioIlustrado, UiErrorState,
  ],
  templateUrl: './case-authoring-hub.component.html',
  styleUrl: './case-authoring-hub.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseAuthoringHubComponent implements OnInit {
  private readonly authoringApi = inject(AuthoringApi);
  private readonly auth = inject(AuthService);

  readonly statusLabel = statusLabel;
  readonly filtro = signal('ALL');
  readonly busqueda = signal('');
  readonly opciones = computed(() => [
    ['ALL', 'Todos'], ['DRAFT', 'Borradores'], ['IN_REVIEW', 'En revisión'],
    ['PUBLISHED', 'Publicados'], ['ARCHIVED', 'Archivados'],
  ].map(([valor, etiqueta]) => ({ valor, etiqueta, cuenta: this.cases().filter(c => valor === 'ALL' || c.status === valor).length })));
  readonly filtrados = computed(() => {
    const texto = this.busqueda().trim().toLocaleLowerCase('es');
    return this.cases().filter(c => (this.filtro() === 'ALL' || c.status === this.filtro()) &&
      c.title.toLocaleLowerCase('es').includes(texto));
  });
  // Sin caseId no se agrupa: nunca se mezclan casos antiguos por accidente.
  readonly grupos = computed(() => {
    const grupos = new Map<string, SimulationCaseSummary[]>();
    const admin = this.auth.currentUser()?.role === 'ADMIN';
    for (const caso of this.filtrados()) {
      const clave = admin && caso.caseId != null ? `caso-${caso.caseId}` : `version-${caso.caseVersionId}`;
      grupos.set(clave, [...(grupos.get(clave) ?? []), caso]);
    }
    return [...grupos.values()].map(versiones => versiones.sort((a, b) =>
      Number(b.status === 'PUBLISHED') - Number(a.status === 'PUBLISHED') ||
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.caseVersionId - a.caseVersionId));
  });
  readonly cases = signal<SimulationCaseSummary[]>([]);
  readonly loading = signal(true);
  /** La LISTA no pudo cargarse (el texto va en el estado de error de la lista). */
  readonly error = signal('');

  /** Estado de la lista de casos: una sola señal, de a uno. */
  readonly listState = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => this.cases().length === 0),
  });
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = computed(() => (this.listState() === 'loading' ? 'Cargando casos…' : ''));

  ngOnInit(): void {
    this.loadCases();
  }

  statusTone(status: string | null | undefined): UiBadgeTone {
    const normalized = (status ?? '').toUpperCase();
    if (normalized === 'PUBLISHED') return 'success';
    if (normalized === 'IN_REVIEW') return 'info';
    return 'neutral';
  }

  accion(status: string): string {
    switch (status) {
      case 'DRAFT': return 'Seguir editando';
      case 'IN_REVIEW': return 'Ver revisión';
      case 'PUBLISHED': return 'Abrir en el editor';
      default: return 'Ver';
    }
  }

  fecha(valor: string | null | undefined): string | null {
    if (!valor) return null;
    // BK-4 entrega hora de Bogotá sin zona; no depende de la zona del navegador.
    const fecha = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(valor) ? valor : `${valor}-05:00`);
    if (Number.isNaN(fecha.getTime())) return null;
    const minutos = Math.max(0, Math.floor((Date.now() - fecha.getTime()) / 60000));
    if (minutos < 1) return 'Editado hace un momento';
    if (minutos < 60) return `Editado hace ${minutos} min`;
    if (minutos < 1440) return `Editado hace ${Math.floor(minutos / 60)} h`;
    return `Editado hace ${Math.floor(minutos / 1440)} días`;
  }

  loadCases(): void {
    this.loading.set(true);
    this.error.set('');
    this.authoringApi.listAuthoringCases().subscribe({
      next: cases => {
        this.cases.set(cases);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No fue posible cargar los casos disponibles.');
        this.loading.set(false);
      },
    });
  }
}
