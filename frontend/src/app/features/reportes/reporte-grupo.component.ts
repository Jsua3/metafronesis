import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, LOCALE_ID, computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, Subscription, concatMap, defaultIfEmpty, filter, from, map, take } from 'rxjs';
import { Grupo, GrupoService } from '../../core/api/grupo.service';
import { ReporteService } from '../../core/api/reporte.service';
import { CaseCatalogApi } from '../../core/api/case-catalog.api';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  CoberturaCategoria, EstudianteSimulacionReporte, HitoCobertura, ReporteGrupo, ReporteSimulacionGrupo,
} from '../../core/models/reporte.model';
import { SimulationCaseSummary } from '../../core/models/revision.model';
import { UiBarras, UiBarrasDato } from '../../shared/ui/barras/ui-barras';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { UiVacioIlustrado } from '../../shared/ui/vacio-ilustrado/ui-vacio-ilustrado';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { UiProgress } from '../../shared/ui/progress/ui-progress';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { UiStat } from '../../shared/ui/stat/ui-stat';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiLink } from '../../shared/ui/link/ui-link';
import { UiTable, UiTableRow, UiTableTable } from '../../shared/ui/table/ui-table';
import { milestoneMark } from '../simulator/outcome-text.util';

type ReportView = 'idle' | 'pending' | 'loading' | 'error' | 'empty' | 'ready';

/**
 * BORRADOR (VD-23): la cobertura de cada hito en palabras, pendiente de la aprobación de Psicología. El grupo se lee
 * por pasos del caso (qué hizo la mayoría), nunca por una nota ni un promedio.
 */
const COBERTURA_PALABRAS: Record<CoberturaCategoria, string> = {
  MAYORIA: 'La mayoría cumplió este paso',
  MENOS_DE_LA_MITAD: 'Menos de la mitad cumplió este paso',
};
const COBERTURA_SIN_DATOS = 'Aún no hay datos suficientes para mostrarlo';

/**
 * Pantalla Reportes (plan visual F7-3): el reporte sale al elegir el grupo (o al llegar con `?grupo=<id>` desde
 * Grupos), así que de la sesión docente al reporte de un grupo hay dos o tres gestos (RQ-NEG-006). Distingue «aún no
 * hay consulta» («Selecciona un grupo») de «la consulta no encontró intentos» («Sin intentos en este corte»); el vacío
 * nunca se pinta como un éxito. Cambiar de grupo o de caso con una consulta en curso la cancela: solo cuenta la última.
 */
@Component({
  selector: 'app-reporte-grupo',
  standalone: true,
  imports: [
    ReactiveFormsModule, RouterLink,
    UiBarras, UiBadge, UiButton, UiCard, UiControl, UiField, UiLink, UiCabeceraIlustrada, UiVacioIlustrado, UiProgress, UiSection, UiSkeleton, UiStat,
    UiErrorState, UiTable, UiTableRow, UiTableTable,
  ],
  templateUrl: './reporte-grupo.component.html',
  styleUrl: './reporte-grupo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReporteGrupoComponent {
  private readonly reporteService = inject(ReporteService);
  private readonly grupoService = inject(GrupoService);
  private readonly casosApi = inject(CaseCatalogApi);
  private readonly notify = inject(NotificationService);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly decimal = new DecimalPipe(inject(LOCALE_ID));

  /** La consulta en curso: elegir otro corte la cancela. */
  private request: Subscription | null = null;
  private casosCargados = false;

  readonly form = this.fb.group({
    grupoId: [null as number | null, Validators.required],
    caseVersionId: [null as number | null]
  });

  readonly grupos = signal<Grupo[]>([]);
  readonly casos = signal<SimulationCaseSummary[]>([]);
  readonly reporte = signal<ReporteGrupo | null>(null);
  readonly loadingFilters = signal(false);
  readonly loadingCasos = signal(false);
  readonly errorCasos = signal('');
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly selectedGrupoId = signal<number | null>(null);
  readonly selectedCaseVersionId = signal<number | null>(null);
  readonly error = signal('');
  readonly loadFiltersError = signal('');

  readonly selectedGroup = computed(() => {
    const grupoId = this.selectedGrupoId();
    return this.grupos().find(grupo => grupo.id === grupoId) ?? null;
  });

  readonly selectedCase = computed(() => {
    const caseVersionId = this.selectedCaseVersionId();
    return this.casos().find(caso => caso.caseVersionId === caseVersionId) ?? null;
  });

  /** Lo que el reporte de un estudiante necesita para volver aquí y para mirar el mismo caso (F10-7†). */
  protected readonly studentLinkParams = computed(() => ({
    grupo: this.selectedGrupoId(),
    caseVersionId: this.selectedCaseVersionId(),
  }));

  /**
   * Sin caso elegido el servidor no consolida el grupo (`simulacion: null` a propósito): no es «nadie ha empezado»,
   * es que falta elegir el caso. Decir lo primero sería falso (pasada final).
   */
  protected readonly faltaCaso = computed(() => {
    const data = this.reporte();
    return data !== null && data.simulacion === null && (data.caseVersionId ?? null) === null;
  });
  /** La consulta respondió, pero sin intentos que mostrar. */
  private readonly sinIntentos = computed(() => {
    const data = this.reporte();
    return data !== null && (data.simulacion === null || data.simulacion.totalIntentos === 0);
  });
  private readonly dataState = uiDataState({ loading: this.loading, error: this.error, isEmpty: this.sinIntentos });

  /** Lo que muestra el resultado: nada que consultar, esqueleto, error, sin intentos o el reporte. */
  readonly view = computed<ReportView>(() => this.selectedGrupoId() === null ? 'idle' : this.dataState());
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = computed(() => (this.view() === 'loading' ? 'Generando el reporte…' : ''));

  constructor() {
    this.destroyRef.onDestroy(() => this.request?.unsubscribe());
    // Primero se escucha el formulario: la carga de grupos puede preseleccionar uno (`?grupo=`) y eso debe generar.
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      let { grupoId, caseVersionId } = this.form.getRawValue();
      if (this.selectedGrupoId() !== null && grupoId !== this.selectedGrupoId()) {
        caseVersionId = null;
        this.form.controls.caseVersionId.setValue(null, { emitEvent: false });
      }
      this.selectedGrupoId.set(grupoId);
      this.selectedCaseVersionId.set(caseVersionId);
      this.request?.unsubscribe();
      this.reporte.set(null);
      this.error.set('');
      if (grupoId === null) {
        this.loading.set(false);
        return;
      }
      if (caseVersionId === null && !this.casosCargados) return;
      this.generar();
    });
    this.cargarFiltros();
  }

  cargarFiltros() {
    this.cargarGrupos();
    this.cargarCasos();
  }

  cargarGrupos() {
    this.loadingFilters.set(true);
    this.loadFiltersError.set('');
    this.grupoService.listar().subscribe({
      next: grupos => {
        this.grupos.set(grupos);
        this.loadingFilters.set(false);
        this.preseleccionarGrupo(grupos);
      },
      error: () => {
        this.loadFiltersError.set('No fue posible cargar los grupos. Revisa la sesión o intenta de nuevo.');
        this.loadingFilters.set(false);
      }
    });
  }

  cargarCasos() {
    this.loadingCasos.set(true);
    this.errorCasos.set('');
    this.casosApi.listPublished().subscribe({
      next: casos => {
        this.casos.set(casos);
        this.casosCargados = true;
        this.loadingCasos.set(false);
        if (this.selectedGrupoId() !== null && this.selectedCaseVersionId() === null) this.generar();
      },
      error: () => {
        this.loadingCasos.set(false);
        this.errorCasos.set('No fue posible cargar los casos de simulación.');
      }
    });
  }

  /**
   * Llegar desde Grupos con `?grupo=<id>` deja ese grupo elegido y su reporte generado. Con `&caseVersionId=<id>` (la
   * vuelta desde el reporte de un estudiante, F10-7†) deja también el caso: el mismo corte que se estaba mirando.
   */
  private preseleccionarGrupo(grupos: Grupo[]): void {
    const wanted = Number(this.route?.snapshot.queryParamMap.get('grupo'));
    if (!Number.isInteger(wanted) || this.form.controls.grupoId.value !== null) return;
    if (!grupos.some(grupo => grupo.id === wanted)) return;
    const wantedCase = Number(this.route?.snapshot.queryParamMap.get('caseVersionId'));
    // Un solo patch: dos generarían dos consultas.
    this.form.patchValue({ grupoId: wanted, caseVersionId: Number.isInteger(wantedCase) && wantedCase > 0 ? wantedCase : null });
  }

  limpiar() {
    this.form.reset({ grupoId: null, caseVersionId: null });
  }

  generar() {
    const { grupoId, caseVersionId } = this.form.getRawValue();
    if (grupoId === null) return;
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.reporte.set(null);
    // Se busca en orden el primer caso con intentos; si ninguno tiene, se muestra el primero vacío.
    const casos = this.casos();
    const consulta: Observable<{ caso: SimulationCaseSummary | null; reporte: ReporteGrupo }> = caseVersionId === null && casos.length
      ? from(casos).pipe(
          concatMap(caso => this.reporteService.getReporteGrupo(grupoId, caso.caseVersionId).pipe(
            map(reporte => ({ caso, reporte })))),
          filter(({ reporte }) => (reporte.simulacion?.totalIntentos ?? 0) > 0),
          take(1),
          defaultIfEmpty(null),
          concatMap(resultado => resultado
            ? from([resultado])
            : this.reporteService.getReporteGrupo(grupoId, casos[0].caseVersionId).pipe(map(reporte => ({ caso: casos[0], reporte })))),
        )
      : this.reporteService.getReporteGrupo(grupoId, caseVersionId).pipe(map(reporte => ({ caso: null, reporte })));
    this.request = consulta.subscribe({
      next: ({ caso, reporte }) => {
        if (caso) {
          this.form.controls.caseVersionId.setValue(caso.caseVersionId, { emitEvent: false });
          this.selectedCaseVersionId.set(caso.caseVersionId);
        }
        this.reporte.set(reporte);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No pudimos generar el reporte.');
        this.loading.set(false);
      }
    });
  }

  exportar() {
    const { grupoId, caseVersionId } = this.form.getRawValue();
    // El servidor exporta por caso: sin caso elegido no hay qué exportar.
    if (grupoId === null || caseVersionId === null) return;
    this.exporting.set(true);
    this.reporteService.exportarCsv(grupoId, caseVersionId).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-${this.selectedGroup()?.codigo || grupoId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.notify.success('El archivo CSV se descargó correctamente.');
        this.exporting.set(false);
      },
      error: () => {
        this.notify.error('No fue posible exportar el reporte.');
        this.exporting.set(false);
      }
    });
  }

  /** Los porcentajes publicados no permiten reconstruir cantidades sin revelar celdas suprimidas. */
  barrasHitos(sim: ReporteSimulacionGrupo): UiBarrasDato[] {
    return sim.hitos.filter(h => h.porcentaje != null).map(h => ({
      etiqueta: h.label, valor: h.porcentaje!, tono: 'info', patron: 'rayas',
    }));
  }

  barrasDecisiones(sim: ReporteSimulacionGrupo): UiBarrasDato[] {
    const suma = (clave: keyof EstudianteSimulacionReporte['clases']) => sim.estudiantes.reduce((n, e) => n + e.clases[clave], 0);
    return [
      { etiqueta: 'Recomendadas', valor: suma('recommended'), tono: 'success', patron: 'liso' },
      { etiqueta: 'Aceptables', valor: suma('acceptable'), tono: 'info', patron: 'rayas' },
      { etiqueta: 'Con riesgo', valor: suma('risky'), tono: 'warning', patron: 'puntos' },
      { etiqueta: 'Contraindicadas', valor: suma('contraindicated'), tono: 'danger', patron: 'rayas' },
    ];
  }

  /**
   * La lectura del gráfico de hitos en palabras: el paso menos logrado (con empates) y por qué no hay «de N». El servidor
   * da solo el porcentaje (y lo oculta en grupos de menos de 20), no cuántas personas lo cumplieron.
   */
  descripcionHitos(sim: ReporteSimulacionGrupo): string {
    const filas = this.barrasHitos(sim);
    const base = 'Cada barra es el porcentaje del grupo que cumplió ese paso. El servidor no informa cuántas personas son. Los pasos sin porcentaje disponible no aparecen.';
    if (!filas.length) return base;
    const minimo = Math.min(...filas.map(fila => fila.valor));
    const menos = filas.filter(fila => fila.valor === minimo).map(fila => `«${fila.etiqueta}»`);
    const lectura = menos.length === 1
      ? `El paso menos logrado es ${menos[0]}, con ${this.porcentaje(minimo)} %.`
      : `Los pasos menos logrados, empatados con ${this.porcentaje(minimo)} %, son ${menos.join(', ')}.`;
    return `${base} ${lectura}`;
  }

  /** La lectura del reparto de decisiones: qué clase predomina (con empates) y cuántas decisiones piden atención. */
  descripcionDecisiones(sim: ReporteSimulacionGrupo): string {
    const filas = this.barrasDecisiones(sim);
    const total = this.totalDecisiones(sim);
    const maximo = Math.max(...filas.map(fila => fila.valor));
    const mayores = filas.filter(fila => fila.valor === maximo).map(fila => `«${fila.etiqueta}»`);
    const predomina = mayores.length === 1 ? `Predomina ${mayores[0]} con ${maximo}.` : `Empatan ${mayores.join(' y ')} con ${maximo} cada una.`;
    const valor = (etiqueta: string) => filas.find(fila => fila.etiqueta === etiqueta)?.valor ?? 0;
    const atencion = valor('Con riesgo') + valor('Contraindicadas');
    const piden = atencion === 0
      ? 'Ninguna decisión es de riesgo ni contraindicada.'
      : `Piden atención ${atencion} (${valor('Con riesgo')} con riesgo y ${valor('Contraindicadas')} contraindicadas).`;
    return `Reparto de ${total} decisiones registradas en este corte. ${predomina} ${piden}`;
  }

  totalDecisiones(sim: ReporteSimulacionGrupo): number {
    return this.barrasDecisiones(sim).reduce((total, fila) => total + fila.valor, 0);
  }

  /** Un porcentaje con coma decimal y un decimal como máximo («62,5»). */
  porcentaje(value: number): string {
    return this.decimal.transform(value, '1.0-1') ?? '0';
  }

  /** La cobertura de un hito en palabras; sin categoría (celda mínima), dice que aún no hay datos suficientes. */
  coberturaPalabras(hito: HitoCobertura): string {
    return (hito.cobertura && COBERTURA_PALABRAS[hito.cobertura]) || COBERTURA_SIN_DATOS;
  }

  /** La palabra «clave» de un hito que decide el final. */
  marca(hito: HitoCobertura): string | null {
    return milestoneMark(hito);
  }

  /** «2 de 3»: los hitos que cumplió en su último intento completado; sin ese dato, un guion. */
  hitosCumplidosTexto(estudiante: EstudianteSimulacionReporte, sim: ReporteSimulacionGrupo): string {
    if (estudiante.hitosCumplidos === null || estudiante.hitosCumplidos === undefined) return '—';
    const keysDelCaso = new Set(sim.hitos.map(hito => hito.key));
    return `${estudiante.hitosCumplidos.filter(key => keysDelCaso.has(key)).length} de ${sim.hitos.length}`;
  }

  completionRate(sim: ReporteSimulacionGrupo) {
    if (!sim.totalIntentos) return 0;
    return Math.min(100, Math.round((sim.intentosCompletados / sim.totalIntentos) * 100));
  }

  safeExitRate(sim: ReporteSimulacionGrupo) {
    if (!sim.totalIntentos) return 0;
    return Math.min(100, Math.round((sim.intentosSalidaSegura / sim.totalIntentos) * 100));
  }

  estadoLabel(estado: string) {
    const normalized = estado.toUpperCase();
    if (normalized === 'COMPLETED' || normalized === 'COMPLETADO') return 'Completado';
    if (normalized === 'EN_PAUSA' || normalized === 'PAUSED') return 'En pausa (reanudable)';
    if (normalized === 'SAFE_EXITED') return 'Cerrado con salida segura';
    if (normalized === 'IN_PROGRESS' || normalized === 'EN_PROGRESO') return 'En progreso';
    return estado;
  }

  estadoTone(estado: string): UiBadgeTone {
    const normalized = estado.toUpperCase();
    if (normalized === 'COMPLETED' || normalized === 'COMPLETADO') return 'success';
    if (normalized === 'EN_PAUSA' || normalized === 'PAUSED') return 'warning';
    if (normalized === 'IN_PROGRESS' || normalized === 'EN_PROGRESO') return 'info';
    return 'neutral';
  }
}
