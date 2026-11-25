import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnInit, afterNextRender, computed, inject, signal, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { mensajeDeError } from '../../core/api/mensaje-de-error.util';
import { ReporteService } from '../../core/api/reporte.service';
import { ReporteEstudiante } from '../../core/models/reporte.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiLink } from '../../shared/ui/link/ui-link';
import { statusLabel } from '../../shared/ui/labels';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiTable, UiTableRow, UiTableTable } from '../../shared/ui/table/ui-table';
import { UiTooltip } from '../../shared/ui/tooltip/ui-tooltip';
import { attemptTone, caseStatusText, coverageLabel, formatDuration, formatStart } from './reporte-estudiante.util';

/** Cuántos intentos más trae «Ver más intentos»; el servidor da 50 por defecto y 200 como máximo por consulta. */
const PAGE_SIZE = 50;
const MAX_LIMIT = 200;

const FORBIDDEN_TEXT = 'No tienes permiso para ver el reporte de este estudiante.';
const NOT_FOUND_TEXT = 'Ese estudiante no existe o ya no está disponible.';

function positiveInt(value: string | null | undefined): number | null {
  const parsed = Number(value);
  return value && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Reporte de un estudiante (plan visual F10-7†; RF-26, CU-15, RF-25, CU-14, RQ-NEG-006; contrato C3): los intentos de
 * UN estudiante para su docente —caso, número de intento, estado, inicio, tiempo activo y tiempo de reloj— con la
 * cobertura «Mostrando X de N» y «Ver más intentos» (50 más cada vez, hasta 200 por consulta). Se llega desde el reporte
 * del grupo, que pasa el grupo y el caso elegidos para que «Volver» y el filtro conserven el contexto. Un docente solo
 * ve a los estudiantes de sus grupos: el servidor responde 403 y aquí se dice, sin sugerir un reintento que no cambia nada.
 */
@Component({
  selector: 'app-reporte-estudiante',
  imports: [
    RouterLink, UiBadge, UiButton, UiCard, UiEmptyState, UiErrorState, UiLink, UiCabeceraIlustrada, UiSection, UiSkeleton,
    UiTable, UiTableRow, UiTableTable, UiTooltip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reporte-estudiante.component.html',
  styleUrl: './reporte-estudiante.component.scss',
})
export class ReporteEstudianteComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reportes = inject(ReporteService);
  private readonly notify = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  protected readonly studentId = positiveInt(this.route.snapshot.paramMap.get('estudianteId'));
  protected readonly groupId = positiveInt(this.route.snapshot.queryParamMap.get('grupo'));
  protected readonly caseFilter = signal<number | null>(positiveInt(this.route.snapshot.queryParamMap.get('caseVersionId')));

  protected readonly report = signal<ReporteEstudiante | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<HttpErrorResponse | null>(null);
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = signal('');

  protected readonly state = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => (this.report()?.coverage.total ?? 1) === 0),
  });
  protected readonly errorStatus = computed(() => this.error()?.status ?? null);
  protected readonly errorKind = computed(() => errorKindFromStatus(this.errorStatus()));
  protected readonly errorMessage = computed(() => {
    const failure = this.error();
    if (!failure) return null;
    // El servidor responde a todo 403 con un texto genérico: la pantalla dice lo que pasó con el suyo.
    if (failure.status === 403) return FORBIDDEN_TEXT;
    if (failure.status === 404) return NOT_FOUND_TEXT;
    return null;
  });

  protected readonly titleText = computed(() => {
    const student = this.report()?.student;
    const name = student?.displayName || student?.ref;
    return name ? `Reporte de ${name}` : 'Reporte del estudiante';
  });
  /** Para volver al MISMO corte del reporte del grupo: su grupo y, si se mira un solo caso, ese caso. */
  protected readonly backParams = computed(() =>
    this.groupId === null ? null : { grupo: this.groupId, caseVersionId: this.caseFilter() });
  protected readonly filterTitle = computed(() => this.report()?.attempts[0]?.caseTitle ?? 'el caso elegido');
  // Se agrupan los intentos visibles sin alterar la paginación ni el orden del servidor.
  protected readonly caseGroups = computed(() => {
    const groups = new Map<number, { title: string; attempts: NonNullable<ReporteEstudiante['attempts']> }>();
    for (const attempt of this.report()?.attempts ?? []) {
      let group = groups.get(attempt.caseVersionId);
      if (!group) {
        group = { title: attempt.caseTitle, attempts: [] };
        groups.set(attempt.caseVersionId, group);
      }
      group.attempts.push(attempt);
    }
    return [...groups.entries()].map(([id, group]) => ({ id, ...group }));
  });
  protected readonly canLoadMore = computed(() => {
    const coverage = this.report()?.coverage;
    return !!coverage && coverage.shown < coverage.total && coverage.shown < MAX_LIMIT;
  });
  protected readonly atCap = computed(() => {
    const coverage = this.report()?.coverage;
    return !!coverage && coverage.shown < coverage.total && coverage.shown >= MAX_LIMIT;
  });
  protected readonly maxLimit = MAX_LIMIT;

  private readonly coverageLine = viewChild<ElementRef<HTMLElement>>('coverageLine');
  private limit: number | null = null;
  private run: Subscription | undefined;

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.limit = null;
    this.fetch(false);
  }

  protected showMore(): void {
    const shown = this.report()?.coverage.shown ?? 0;
    this.limit = Math.min(MAX_LIMIT, shown + PAGE_SIZE);
    this.fetch(true);
  }

  protected clearFilter(): void {
    this.caseFilter.set(null);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { caseVersionId: null }, queryParamsHandling: 'merge', replaceUrl: true });
    this.load();
  }

  protected coverage(report: ReporteEstudiante): string {
    return coverageLabel(report.coverage);
  }

  protected label(status: string): string {
    return statusLabel(status);
  }

  /** Cómo va el caso, en palabras, antes de la tabla de sus intentos. */
  protected caseStatus(attempts: readonly { ordinal: number; status: string }[]): string {
    return caseStatusText(attempts);
  }

  /** El tiempo de reloj, auxiliar del tiempo activo: se dice completo, también cuando falta el dato. */
  protected clockText(seconds: number | null): string {
    return seconds === null || seconds === undefined ? 'Tiempo de reloj: sin dato' : `Tiempo de reloj: ${formatDuration(seconds)}`;
  }

  protected tone(status: string) {
    return attemptTone(status);
  }

  protected duration(seconds: number | null): string {
    return formatDuration(seconds);
  }

  protected start(value: string | null): string {
    return formatStart(value);
  }

  private fetch(more: boolean): void {
    this.run?.unsubscribe();
    if (this.studentId === null) {
      this.error.set(new HttpErrorResponse({ status: 404 }));
      this.loading.set(false);
      return;
    }
    const options: { caseVersionId?: number; limit?: number } = {};
    const filter = this.caseFilter();
    if (filter !== null) options.caseVersionId = filter;
    if (this.limit !== null) options.limit = this.limit;

    if (more) this.loadingMore.set(true);
    else {
      this.loading.set(true);
      this.error.set(null);
    }
    this.statusText.set('');
    this.run = this.reportes.getReporteEstudiante(this.studentId, options).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: report => {
        this.report.set(report);
        this.loading.set(false);
        this.loadingMore.set(false);
        this.statusText.set(coverageLabel(report.coverage));
        // «Ver más intentos» puede desaparecer con el foco puesto en él: el foco va a la línea de cobertura.
        if (more) afterNextRender(() => this.coverageLine()?.nativeElement.focus(), { injector: this.injector });
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadingMore.set(false);
        if (more) {
          // Lo que ya se veía sigue a la vista: solo se avisa que no llegó lo demás.
          const message = mensajeDeError(err, 'No fue posible traer más intentos.');
          if (message) this.notify.error(message);
          return;
        }
        this.error.set(err instanceof HttpErrorResponse ? err : new HttpErrorResponse({ status: 500 }));
      },
    });
  }
}
