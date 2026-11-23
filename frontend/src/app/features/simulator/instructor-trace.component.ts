import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, afterNextRender, computed, inject, signal, viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { apiErrorMessage } from '../../core/api/api-error.util';
import { InstructorApi } from '../../core/api/instructor.api';
import { CanLeave } from '../../core/navigation/can-leave.guard';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  AttemptTimelineEntry, AttemptTrace, CompetencyLevelEntry, FormativeLevel, RecentAttempt, ReflectionTrace,
  ResponseClass, RubricEvaluationView, RubricSummary, TraceEvent,
} from '../../core/models/revision.model';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiCheck, UiSwitch } from '../../shared/ui/field/ui-check';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { statusLabel } from '../../shared/ui/labels';
import { UiMenu, UiMenuItem } from '../../shared/ui/menu/ui-menu';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { moverFocoEnLista } from '../grupos/mover-foco-en-lista';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSegmentado, UiSegmento } from '../../shared/ui/segmentado/ui-segmentado';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { UiStat } from '../../shared/ui/stat/ui-stat';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiTab, UiTabs } from '../../shared/ui/tabs/ui-tabs';
import { UiTable, UiTableRow, UiTableTable } from '../../shared/ui/table/ui-table';
import { DRAFT_COPY } from './draft-copy';
import { milestoneMark } from './outcome-text.util';
import { ReplaceAttemptDialogComponent, ReplaceAttemptDialogData } from './replace-attempt-dialog.component';
import { RubricaIntentoComponent } from './revision/rubrica-intento.component';
import {
  FeedbackPanelView, SummaryFeedbackKey, TraceFeedbackDialogComponent, TraceFeedbackDialogData,
} from './trace-feedback-dialog.component';
import {
  TraceAccent, cleanText, esDecisionRegistrada, esFilaDeDecision, formatTraceDate, formatTraceDuration,
  formativeLevelLabel, formativeLevelTone, haceCuanto, nombreDeCompetencia, textoDeFila, timelineEntryAccent,
  timelineEntryLabel, timelineEntryTone, timelineFeedback,
} from './trace-labels.util';

/**
 * BORRADOR (VD-23): textos nuevos de la traza docente, pendientes de la aprobación de Psicología. Sin cifras de
 * desempeño: la traza dice qué hizo la persona y en qué clase cae cada respuesta.
 */
const TRACE_COPY = {
  noTeacherLevel: 'Sin criterio equivalente',
  systemFolded: 'La valoración del sistema se mostrará cuando registres tu propia valoración.',
  // V5 (borrador, a validar con Psicología): el caso no declara competencias en sus respuestas.
  notDeclared: 'Este caso todavía no declara qué competencia evidencia cada respuesta; por eso el resultado no muestra niveles.',
  openEditor: 'Abrir el caso en el editor',
  // Sin BK-3 en el servidor no se sabe qué intento ya se valoró: «Por revisar» muestra todos los terminados.
  sinEstadoDeValoracion: 'Se muestran todos los intentos terminados: el servidor no dice cuáles ya valoraste.',
  classPanels: {
    RECOMMENDED: {
      title: 'Decisiones recomendadas',
      intro: 'Elecciones alineadas con buenas prácticas. Refuerza estos aciertos en tu retroalimentación.',
    },
    ACCEPTABLE: {
      title: 'Decisiones aceptables',
      intro: 'Elecciones que no abren un riesgo, aunque hay una ruta más sólida que puedes comentar en sesión.',
    },
    RISKY: {
      title: 'Decisiones con riesgo',
      intro: 'Elecciones que requieren revisión formativa por su posible efecto en la persona usuaria.',
    },
    CONTRAINDICATED: {
      title: 'Decisiones contraindicadas',
      intro: 'Elecciones que conviene contrastar con alternativas más pertinentes y con los principios de no revictimización.',
    },
  },
} as const;

/** Los filtros de la bandeja (DISENO §5.3). */
export type FiltroBandeja = 'por-revisar' | 'todos' | 'en-curso';
/** Las dos mitades de la pantalla en el teléfono: una a la vez. */
export type VistaRevision = 'evidencia' | 'valoracion';
export type PestanaEvidencia = 'recorrido' | 'decisiones' | 'reflexiones';

/** Una fila de la línea de tiempo con su número de decisión (estable: el mismo con o sin eventos del sistema). */
export interface FilaLinea {
  entry: AttemptTimelineEntry;
  /** Orden de la decisión registrada (1, 2, 3…); nulo en un reintento o un evento del sistema. */
  orden: number | null;
  decision: boolean;
  texto: string;
}

const ACCION_REEMPLAZAR = 'reemplazar';

/**
 * Revisión del intento (DISENO §5.3, bloque B5b): la bandeja de intentos, la evidencia y la valoración, a la vez. Desde
 * 1440 px van en tres columnas; entre 1024 y 1439 la bandeja se abre con un selector y quedan dos; por debajo de 1024,
 * una columna con el segmentado «Evidencia | Valoración». La valoración es `app-rubrica-intento` (su interior es de R2)
 * con «Guardar evaluación» siempre a la vista; salir o cambiar de intento con cambios sin guardar pregunta antes.
 *
 * La evidencia no muestra cifras de desempeño: cuenta hitos, la persona por escena, el final con su razón y las
 * decisiones por clase, con la línea de tiempo solo de decisiones por defecto (cada una con su número de orden, para
 * que la valoración pueda señalarla). El perfil automático del sistema queda plegado hasta que el docente guarda su
 * propia valoración (el servidor lo manda entonces).
 *
 * Patrones: es el contenedor (carga, decide y coordina) y la valoración es una pieza aparte que avisa por salidas
 * (Observer); los estados de la lista y del detalle son State (`uiDataState`); la API se pide solo por el adaptador
 * `InstructorApi` (Adapter). Salir con cambios sin guardar pasa por `canLeaveGuard` (la ruta) y `canLeave()` (aquí).
 */
@Component({
  selector: 'app-instructor-trace',
  standalone: true,
  imports: [
    UiBadge, UiButton, UiCard, UiCheck, UiControl, UiField, UiMenu, UiCabeceraIlustrada, UiSection, UiSegmentado, UiSkeleton,
    UiStat, UiSwitch, UiTab, UiTabs, UiEmptyState, UiErrorState, UiTable, UiTableRow, UiTableTable,
    RubricaIntentoComponent,
  ],
  templateUrl: './instructor-trace.component.html',
  styleUrl: './instructor-trace.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class InstructorTraceComponent implements OnInit, CanLeave {
  private readonly instructorApi = inject(InstructorApi);
  private readonly dialog = inject(UiDialog);
  private readonly notify = inject(NotificationService);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Lo que se está pidiendo del intento abierto: su traza, su rúbrica y la traza refrescada tras guardar. Elegir otro
   * intento las cancela todas (solo cuenta el último) y cada respuesta comprueba además que siga siendo el abierto.
   */
  private opening: Subscription | null = null;
  private rubricRequest: Subscription | null = null;
  private refreshing: Subscription | null = null;

  readonly attempts = signal<RecentAttempt[]>([]);
  readonly trace = signal<AttemptTrace | null>(null);
  readonly rubric = signal<RubricEvaluationView | null>(null);
  readonly loadingAttempts = signal(true);
  readonly attemptsError = signal('');
  readonly loadingTrace = signal(false);
  readonly traceError = signal<HttpErrorResponse | null>(null);
  /** Aviso de la carga de la rúbrica (sin rúbrica, sin permiso); los del guardado los dice la valoración. */
  readonly rubricMessage = signal('');
  readonly rubricMessageIsError = signal(false);
  readonly selectedAttemptId = signal<string | null>(null);

  // ── Maquetación ──────────────────────────────────────────────────────────────────────────────────────────────
  readonly filtro = signal<FiltroBandeja>('todos');
  readonly busqueda = signal('');
  /** Entre 1024 y 1439 px (y en el teléfono) la bandeja se abre con el selector; desde 1440 siempre está. */
  readonly bandejaAbierta = signal(false);
  readonly vista = signal<VistaRevision>('evidencia');
  readonly pestana = signal<PestanaEvidencia>('decisiones');
  /** La línea de tiempo muestra solo decisiones; el interruptor suma los eventos del sistema (puertas, recursos). */
  readonly mostrarEventos = signal(false);

  private readonly rubrica = viewChild(RubricaIntentoComponent);
  private readonly injector = inject(Injector);
  private readonly documento = inject(DOCUMENT);

  // ── R2: la valoración señala la evidencia ───────────────────────────────────────────────────────────────────
  /** La competencia del criterio que la docente tiene enfocado en la valoración (sus decisiones se resaltan). */
  readonly competenciaResaltada = signal<string | null>(null);
  /** La decisión a la que llevó una ficha de evidencia: se marca hasta que se pide otra o se cambia de intento. */
  readonly decisionDestino = signal<number | null>(null);
  /** Los números de orden de las decisiones de la competencia resaltada (RK-4); vacío sin el campo del servidor. */
  protected readonly decisionesResaltadas = computed<ReadonlySet<number>>(() => {
    const code = this.competenciaResaltada();
    const grupo = code ? this.trace()?.evidenceByCompetency?.find(item => item.code === code) : null;
    return new Set(grupo?.items.map(item => item.order) ?? []);
  });
  /** Hay otro intento por revisar además del abierto: solo entonces la valoración ofrece «Siguiente por revisar». */
  protected readonly haySiguientePendiente = computed(() =>
    this.attempts().some(attempt => this.porRevisar(attempt) && attempt.attemptId !== this.selectedAttemptId()));

  /** Estado de la lista y del detalle: una sola señal cada una, de a uno. */
  readonly listState = uiDataState({
    loading: this.loadingAttempts,
    error: this.attemptsError,
    isEmpty: computed(() => this.attempts().length === 0),
  });
  readonly detailState = uiDataState({
    loading: this.loadingTrace,
    error: this.traceError,
    isEmpty: computed(() => this.trace() === null),
  });
  protected readonly traceErrorKind = computed(() => errorKindFromStatus(this.traceError()?.status));
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = computed(() => {
    if (this.listState() === 'loading') return 'Cargando intentos…';
    if (this.detailState() === 'loading') return 'Cargando la trazabilidad…';
    // El aviso de guardado o de fallo se anuncia aquí: la región existe antes de que cambie su texto. (El resultado del
    // reemplazo docente sale por el aviso del sistema: aquí taparía los de la rúbrica y se repetiría al recargar.)
    return this.rubrica()?.mensaje() || this.rubricMessage();
  });
  /** E1-2: hay un reemplazo docente en curso (su resultado se dice con un aviso del sistema). */
  readonly replacing = signal(false);

  /** BORRADOR (VD-23): textos nuevos de la traza por hitos, pendientes de la aprobación de Psicología. */
  protected readonly copy = TRACE_COPY;

  /** BK-3 en el servidor: cada intento dice si su valoración está pendiente. Sin él, se filtra por «terminado». */
  protected readonly conEstadoDeValoracion = computed(() => this.attempts().some(attempt => !!attempt.evaluationStatus));

  /** ↑/↓, Inicio y Fin recorren la bandeja como la lista de un cliente de correo (abrir sigue siendo Intro). */
  protected recorrerBandeja(evento: KeyboardEvent): void {
    moverFocoEnLista(evento, '.tr-attempts', '.tr-attempt');
  }

  protected readonly segmentos = computed<UiSegmento[]>(() => {
    const attempts = this.attempts();
    return [
      { valor: 'por-revisar', etiqueta: 'Por revisar', cuenta: attempts.filter(attempt => this.porRevisar(attempt)).length },
      // Solo «Por revisar» lleva cifra: es la que dice cuánto trabajo queda, y con las tres no caben en la bandeja.
      { valor: 'todos', etiqueta: 'Todos' },
      { valor: 'en-curso', etiqueta: 'En curso' },
    ];
  });

  /** La bandeja filtrada por el segmentado y por la búsqueda (caso o alias). */
  protected readonly bandeja = computed(() => {
    const filtro = this.filtro();
    const texto = this.busqueda().trim().toLocaleLowerCase('es');
    return this.attempts().filter(attempt => {
      if (filtro === 'por-revisar' && !this.porRevisar(attempt)) return false;
      if (filtro === 'en-curso' && !this.enCurso(attempt)) return false;
      if (!texto) return true;
      return `${attempt.caseTitle ?? ''} ${attempt.studentAlias ?? ''}`.toLocaleLowerCase('es').includes(texto);
    });
  });

  /** El intento abierto tal como lo nombra la bandeja (para el selector de 1024-1439). */
  protected readonly elegido = computed(() => {
    const id = this.selectedAttemptId();
    const trace = this.trace();
    if (trace && trace.attemptId === id) return `${this.clean(trace.studentAlias, 'Estudiante')} · ${this.clean(trace.caseTitle, 'Caso sin título')}`;
    const attempt = this.attempts().find(item => item.attemptId === id);
    return attempt ? `${this.clean(attempt.studentAlias, 'Estudiante')} · ${this.clean(attempt.caseTitle, 'Caso sin título')}` : 'Elige un intento';
  });

  /** Sin intento abierto (lista vacía, con error o aún sin elegir) la bandeja se muestra siempre. */
  protected readonly bandejaVisible = computed(() => this.bandejaAbierta() || !this.selectedAttemptId());

  /** Las filas de la línea de tiempo: el número de orden se cuenta sobre TODAS, así no cambia con el interruptor. */
  protected readonly filasLinea = computed<FilaLinea[]>(() => {
    const item = this.trace();
    if (!item) return [];
    let orden = 0;
    const filas = this.timelineEntries(item).map(entry => ({
      entry,
      orden: esDecisionRegistrada(entry) ? ++orden : null,
      decision: esFilaDeDecision(entry),
      texto: textoDeFila(entry),
    }));
    return this.mostrarEventos() ? filas : filas.filter(fila => fila.decision);
  });

  protected readonly menuIntento: UiMenuItem[] = [
    { value: ACCION_REEMPLAZAR, label: 'Reemplazar intento', icon: 'restart_alt', tone: 'danger' },
  ];

  protected readonly vistas: UiSegmento[] = [
    { valor: 'evidencia', etiqueta: 'Evidencia' },
    { valor: 'valoracion', etiqueta: 'Valoración' },
  ];

  ngOnInit() {
    this.destroyRef.onDestroy(() => this.cancelRequests());
    // «Ver todos» del Inicio docente llega con `?evaluacion=pendiente`: la bandeja abre en «Por revisar».
    if (this.route?.snapshot.queryParamMap.get('evaluacion') === 'pendiente') this.filtro.set('por-revisar');
    this.loadAttempts();
  }

  private cancelRequests(): void {
    this.opening?.unsubscribe();
    this.rubricRequest?.unsubscribe();
    this.refreshing?.unsubscribe();
  }

  // ── Salir o cambiar de intento con cambios sin guardar ─────────────────────────────────────────────────────────
  /** Lo que lleva escrito o elegido la docente en la valoración y aún no guardó. */
  hayCambios(): boolean {
    return this.rubrica()?.hayCambios() ?? false;
  }

  /** `canLeaveGuard` de la ruta: con cambios sin guardar, se pregunta nombrando lo que se pierde. */
  canLeave(): boolean | Promise<boolean> {
    return this.hayCambios() ? this.confirmarDescarte() : true;
  }

  /** Cerrar o recargar la pestaña con cambios sin guardar: el navegador pregunta. */
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hayCambios()) event.preventDefault();
  }

  private async confirmarDescarte(): Promise<boolean> {
    const answer = await this.dialog.consequence({
      title: 'Tu valoración no está guardada',
      consequence: 'Si sigues, se pierden los niveles y las observaciones que escribiste para este intento.',
      continueLabel: 'Seguir valorando',
      proceedLabel: 'Descartar cambios',
    });
    return answer === 'proceed';
  }

  /** Elegir un intento en la bandeja: con cambios sin guardar en el abierto, se pregunta antes de cambiar. */
  elegir(attempt: Pick<RecentAttempt, 'attemptId'>): void {
    if (attempt.attemptId === this.selectedAttemptId() && this.trace()) {
      this.bandejaAbierta.set(false);
      return;
    }
    const abrir = () => {
      this.bandejaAbierta.set(false);
      this.vista.set('evidencia');
      this.open(attempt);
    };
    if (!this.hayCambios()) {
      abrir();
      return;
    }
    void this.confirmarDescarte().then(seguir => { if (seguir) abrir(); });
  }

  /** Para R2 («Siguiente por revisar →»): abre el siguiente pendiente de la bandeja después del abierto. */
  abrirSiguientePendiente(): void {
    const pendientes = this.attempts().filter(attempt => this.porRevisar(attempt));
    const actual = pendientes.findIndex(attempt => attempt.attemptId === this.selectedAttemptId());
    const siguiente = pendientes[actual + 1] ?? pendientes.find(attempt => attempt.attemptId !== this.selectedAttemptId());
    if (siguiente) this.elegir(siguiente);
  }

  /**
   * R2 («Evidencia» de un criterio): lleva a la decisión en la pestaña «Decisiones» y la marca. En el teléfono la
   * valoración se oculta al pasar a la evidencia, así que allí el foco va a la decisión; en escritorio se queda en la
   * ficha, para seguir valorando con el teclado.
   */
  irADecision(orden: number): void {
    this.pestana.set('decisiones');
    this.vista.set('evidencia');
    this.decisionDestino.set(orden);
    afterNextRender(() => {
      const destino = this.documento.querySelector<HTMLElement>(`#decision-${orden}`);
      if (!destino) return;
      const quieto = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      destino.scrollIntoView({ block: 'center', behavior: quieto ? 'auto' : 'smooth' });
      const panel = this.documento.querySelector<HTMLElement>('.tr-valoracion');
      if (!panel || getComputedStyle(panel).display === 'none') destino.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  /** Abre un intento. Basta su id: un intento fuera de la lista reciente (p. ej. de un caso republicado) también se abre. */
  open(attempt: Pick<RecentAttempt, 'attemptId'>) {
    this.cancelRequests();
    this.competenciaResaltada.set(null);
    this.decisionDestino.set(null);
    this.loadingTrace.set(true);
    this.traceError.set(null);
    this.rubricMessage.set('');
    this.rubricMessageIsError.set(false);
    this.selectedAttemptId.set(attempt.attemptId);

    this.opening = this.instructorApi.attemptTrace(attempt.attemptId).subscribe({
      next: trace => {
        this.trace.set(this.normalizeTrace(trace));
        this.loadRubric(attempt.attemptId);
      },
      error: (err: HttpErrorResponse) => {
        this.trace.set(null);
        this.rubric.set(null);
        this.traceError.set(err instanceof HttpErrorResponse ? err : new HttpErrorResponse({ status: 500 }));
        this.loadingTrace.set(false);
      }
    });
  }

  /** «Reintentar» del detalle: vuelve a pedir el intento que estaba abierto. */
  reopen() {
    const wanted = this.selectedAttemptId();
    if (wanted) this.open({ attemptId: wanted });
  }

  loadAttempts() {
    this.loadingAttempts.set(true);
    this.attemptsError.set('');
    this.instructorApi.recentAttempts().subscribe({
      next: attempts => {
        attempts = attempts ?? [];
        this.attempts.set(attempts);
        this.loadingAttempts.set(false);
        if (!this.trace()) {
          // «Ver detalle» del panel docente llega con `?intento=<id>`: se abre ESE intento aunque ya no esté en la
          // lista reciente (nunca se abre en silencio el de otra persona); sin el parámetro, el más reciente.
          const requested = this.route?.snapshot.queryParamMap.get('intento');
          // Con la bandeja filtrada («Por revisar» desde el Inicio), el primero de ESA lista.
          const primero = this.bandeja()[0] ?? attempts[0];
          if (requested) this.open({ attemptId: requested });
          else if (primero) this.open(primero);
        }
      },
      error: () => {
        this.attemptsError.set('No fue posible cargar los intentos recientes.');
        this.loadingAttempts.set(false);
      }
    });
  }

  /** Por revisar: con BK-3, la valoración pendiente; sin él, cualquier intento terminado (se dice con una nota). */
  /**
   * Varios intentos de la misma persona en el mismo caso eran filas idénticas en la bandeja: cada uno dice cuál es
   * («Intento 2 de 3», por fecha de inicio). Con uno solo, nada (pasada final).
   */
  readonly numeroIntento = computed(() => {
    const grupos = new Map<string, string[]>();
    for (const item of [...this.attempts()].sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''))) {
      const clave = `${item.studentAlias}|${item.caseVersionId ?? item.caseTitle}`;
      grupos.set(clave, [...(grupos.get(clave) ?? []), item.attemptId]);
    }
    const numeros: Record<string, string> = {};
    for (const ids of grupos.values()) {
      if (ids.length > 1) ids.forEach((id, i) => (numeros[id] = `Intento ${i + 1} de ${ids.length}`));
    }
    return numeros;
  });

  porRevisar(attempt: RecentAttempt): boolean {
    if (attempt.evaluationStatus) return attempt.evaluationStatus === 'PENDIENTE';
    return (attempt.status ?? '').toUpperCase() === 'COMPLETED';
  }

  enCurso(attempt: RecentAttempt): boolean {
    const status = (attempt.status ?? '').toUpperCase();
    return status === 'IN_PROGRESS' || status === 'PAUSED';
  }

  protected elegirFiltro(valor: string): void {
    this.filtro.set(valor as FiltroBandeja);
  }

  protected elegirVista(valor: string): void {
    this.vista.set(valor as VistaRevision);
  }

  protected elegirPestana(valor: string | undefined): void {
    if (valor) this.pestana.set(valor as PestanaEvidencia);
  }

  protected buscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  /** «Terminó hace 2 días» o «Empezó hace 3 horas»: cuándo, en palabras. */
  protected cuando(attempt: RecentAttempt): string {
    if (attempt.endedAt) return `Terminó ${haceCuanto(attempt.endedAt)}`;
    const inicio = haceCuanto(attempt.startedAt);
    return inicio ? `Empezó ${inicio}` : 'Sin fecha';
  }

  // ── Reemplazo docente (E1-2, RN-07) ────────────────────────────────────────────────────────────────────────────
  /** Solo un intento abierto (en curso o en pausa) se reemplaza; el servidor responde 409 a uno cerrado. */
  canReplace(item: AttemptTrace): boolean {
    const status = this.clean(item.status, '').toUpperCase();
    return status === 'IN_PROGRESS' || status === 'PAUSED';
  }

  protected accionIntento(valor: string | undefined, item: AttemptTrace): void {
    if (valor === ACCION_REEMPLAZAR) this.replace(item);
  }

  /** Pide el motivo en un diálogo y reemplaza el intento; al terminar recarga la traza y la lista, y lo anuncia. */
  replace(item: AttemptTrace): void {
    if (this.replacing()) return;
    const ref = this.dialog.open<string | undefined, ReplaceAttemptDialogData>(ReplaceAttemptDialogComponent, {
      data: { studentAlias: this.clean(item.studentAlias, 'Estudiante'), caseTitle: this.clean(item.caseTitle, 'Caso sin título') },
      size: 'md',
    });
    ref.closed.pipe(take(1)).subscribe(reason => {
      if (!reason) return;
      this.replacing.set(true);
      this.instructorApi.replaceAttempt(item.attemptId, reason).subscribe({
        next: () => {
          this.replacing.set(false);
          const done = `Intento reemplazado: ${this.clean(item.studentAlias, 'el estudiante')} empezará uno nuevo la próxima vez que entre.`;
          this.notify.success(done);
          if (this.selectedAttemptId() === item.attemptId) this.reopen();
          this.loadAttempts();
        },
        error: (err: unknown) => {
          this.replacing.set(false);
          const text = apiErrorMessage(err, 'No fue posible reemplazar el intento.');
          if (text) this.notify.error(text);
        },
      });
    });
  }

  // ── Retroalimentación ──────────────────────────────────────────────────────────────────────────────────────────
  openFeedback(key: SummaryFeedbackKey, item: AttemptTrace) {
    this.dialog.open<void, TraceFeedbackDialogData>(TraceFeedbackDialogComponent, {
      data: { panel: this.buildFeedbackPanel(key, item) },
      size: 'lg',
    });
  }

  /** Hay al menos una evaluación CONCLUIDA (con nivel global); una a medias no cuenta como aplicada. */
  evaluationApplied(item: AttemptTrace): boolean {
    return item.rubricEvaluations.some(evaluation => !!evaluation.overallLevel);
  }

  /** Decisiones registradas (los reintentos no cuentan): la suma de los hechos por clase. */
  totalDecisions(item: AttemptTrace): number {
    const { recommended, acceptable, risky, contraindicated } = item.counts;
    return recommended + acceptable + risky + contraindicated;
  }

  decisionsByClass(item: AttemptTrace, responseClass: ResponseClass): TraceEvent[] {
    return item.events.filter(event => this.isDecisionEvent(event) && (event.class ?? '').toUpperCase() === responseClass);
  }

  private buildFeedbackPanel(key: SummaryFeedbackKey, item: AttemptTrace): FeedbackPanelView {
    const empty = {
      decisions: [] as TraceEvent[],
      timeline: [] as AttemptTimelineEntry[],
      reflections: [] as ReflectionTrace[],
      evaluations: [] as RubricSummary[],
      missingNodes: [] as string[],
    };

    if (key === 'TOTAL') {
      return {
        key,
        title: 'Todas las decisiones del intento',
        intro: 'Resumen completo de las decisiones registradas y su clase de respuesta.',
        ...empty,
        decisions: item.events.filter(event => this.isDecisionEvent(event)),
        emptyTitle: 'Sin decisiones registradas',
        emptyMessage: DRAFT_COPY.traceNoDecisions.text,
      };
    }

    if (key === 'RECOMMENDED' || key === 'ACCEPTABLE' || key === 'RISKY' || key === 'CONTRAINDICATED') {
      const labels = this.copy.classPanels[key];
      return {
        key,
        title: labels.title,
        intro: labels.intro,
        ...empty,
        decisions: this.decisionsByClass(item, key),
        emptyTitle: 'Sin decisiones en esta categoría',
        emptyMessage: 'El estudiante no registró decisiones de esta clase en este intento.',
      };
    }

    if (key === 'REFLECTIONS') {
      return {
        key,
        title: 'Bitácoras y reflexiones',
        intro: 'Textos reflexivos que el estudiante guardó durante el caso (descifrados para revisión docente).',
        ...empty,
        reflections: item.reflections,
        missingNodes: this.nodesWithoutReflection(item),
        emptyTitle: 'Sin reflexiones registradas',
        emptyMessage: 'La bitácora es opcional por escenario. Puedes evaluar con la trazabilidad de decisiones y la rúbrica.',
      };
    }

    if (key === 'EVALUATION') {
      return {
        key,
        title: 'Evaluación docente',
        intro: this.evaluationApplied(item)
          ? 'Evaluaciones de rúbrica ya aplicadas a este intento.'
          : item.rubricEvaluations.length
            ? 'Hay una evaluación a medias: faltan criterios por calificar. Complétala en la columna «Valoración».'
            : 'Aún no hay evaluación guardada. Complétala en la columna «Valoración».',
        ...empty,
        evaluations: item.rubricEvaluations,
        emptyTitle: 'Evaluación pendiente',
        emptyMessage: 'Usa la columna «Valoración» para registrar los niveles y la retroalimentación formativa.',
      };
    }

    if (key === 'TIME') {
      return {
        key,
        title: 'Tiempo del intento',
        intro: `Duración registrada: ${this.formatDuration(item.totalDurationSeconds)}. Inicio ${this.formatDate(item.startedAt)}${item.endedAt ? ` · Cierre ${this.formatDate(item.endedAt)}` : ' · Intento aún en curso'}.`,
        ...empty,
        emptyTitle: 'Sin duración calculada',
        emptyMessage: 'No hay suficientes eventos para estimar el tiempo del intento.',
      };
    }

    return {
      key,
      title: 'Recorrido del estudiante',
      intro: 'Línea de tiempo de decisiones, herramientas y eventos clave durante la simulación.',
      ...empty,
      timeline: this.timelineEntries(item),
      emptyTitle: 'Sin eventos en el recorrido',
      emptyMessage: 'No hay eventos registrados para reconstruir la línea de tiempo.',
    };
  }

  // ── Línea de tiempo ────────────────────────────────────────────────────────────────────────────────────────────
  timelineEntries(item: AttemptTrace): AttemptTimelineEntry[] {
    if (item.timeline?.length) {
      return item.timeline;
    }
    return this.buildTimelineFallback(item);
  }

  nodesWithoutReflection(item: AttemptTrace): string[] {
    const reflected = new Set(item.reflections.map(reflection => this.clean(reflection.nodeTitle, '')));
    const visited = item.visitedNodeTitles?.length
      ? item.visitedNodeTitles
      : item.events
          .filter(event => (event.type ?? '').toUpperCase() === 'NODE_ENTERED' && event.nodeTitle)
          .map(event => this.clean(event.nodeTitle, ''))
          .filter((title, index, titles) => title && titles.indexOf(title) === index);
    return visited.filter(title => title && !reflected.has(title));
  }

  timelineEntryLabel(entry: AttemptTimelineEntry): string {
    return timelineEntryLabel(entry);
  }

  timelineFeedback(entry: AttemptTimelineEntry): string {
    return timelineFeedback(entry);
  }

  timelineEntryTone(entry: AttemptTimelineEntry): UiBadgeTone {
    return timelineEntryTone(entry);
  }

  /** Acento de la fila. Un reintento NO es una decisión registrada: sin el tono de «contraindicada». */
  timelineEntryAccent(entry: AttemptTimelineEntry): TraceAccent {
    return timelineEntryAccent(entry);
  }

  private isDecisionEvent(event: TraceEvent): boolean {
    const type = (event.type ?? '').toUpperCase();
    return type === 'DECISION_SELECTED' || type === 'PROHIBITED_DECISION_SELECTED';
  }

  private buildTimelineFallback(item: AttemptTrace): AttemptTimelineEntry[] {
    const allowed = new Set([
      'DECISION_SELECTED',
      'PROHIBITED_DECISION_SELECTED',
      'DECISION_RETRY_REQUIRED',
      'PROHIBITED_DECISION_RETRY_REQUIRED',
      'TOOL_USED',
      'ROOM_ENTERED',
      'SAFE_EXIT_REQUESTED',
      'ATTEMPT_REPLACED',
    ]);
    const start = item.startedAt ? new Date(item.startedAt).getTime() : null;
    return item.events
      .filter(event => allowed.has((event.type ?? '').toUpperCase()))
      .map(event => {
        const occurred = event.occurredAt ? new Date(event.occurredAt).getTime() : null;
        const atSeconds = start && occurred ? Math.max(0, Math.floor((occurred - start) / 1000)) : null;
        const minutes = atSeconds === null ? 0 : Math.floor(atSeconds / 60);
        const seconds = atSeconds === null ? 0 : atSeconds % 60;
        const prohibited = (event.type ?? '').toUpperCase() === 'PROHIBITED_DECISION_SELECTED';
        return {
          atSeconds,
          time: atSeconds === null ? '--:--' : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
          type: event.type,
          class: event.class ?? null,
          prohibited,
          label: this.clean(event.decisionText || event.detail || event.nodeTitle, 'Evento registrado'),
        };
      });
  }

  // ── Valoración ────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * La valoración se guardó: se vuelven a pedir la rúbrica (sus niveles guardados y el nivel global) y la traza (al
   * guardar su valoración, el servidor entrega también el perfil automático).
   */
  onValoracionGuardada(evento?: { entregada: boolean }): void {
    const attemptId = this.selectedAttemptId();
    if (!attemptId) return;
    // Entregada: la fila deja de contar «Por revisar» y «Siguiente por revisar» ya no vuelve a ella. Se marca con lo confirmado por el servidor, sin volver a pedir la bandeja ni perder la selección.
    if (evento?.entregada) {
      this.attempts.update(attempts => attempts.map(attempt =>
        attempt.attemptId === attemptId ? { ...attempt, evaluationStatus: 'APLICADA' } : attempt));
    }
    this.loadRubric(attemptId, { silencioso: true });
    this.refreshTrace(attemptId);
  }

  // ── Valoración del sistema (plegada hasta que el docente guarda la suya) ───────────────────────────────────────
  /**
   * El perfil automático por competencia junto a lo que el docente dio a los criterios de esa competencia: sus niveles,
   * «Pendiente» si el criterio existe pero aún no lo calificó, o «Sin criterio equivalente» si la rúbrica no tiene uno.
   */
  systemRows(item: AttemptTrace): { entry: CompetencyLevelEntry; name: string; teacher: string }[] {
    const criteria = this.rubric()?.criteria ?? [];
    const scores = this.rubric()?.scores ?? [];
    return (item.systemEvaluation?.competencyLevels ?? []).map(entry => {
      const matching = criteria.filter(criterion => (criterion.competency ?? '').toUpperCase() === entry.code.toUpperCase());
      const levels = matching
        .map(criterion => scores.find(score => score.criterionId === criterion.id)?.level)
        .filter((level): level is FormativeLevel => !!level);
      const teacher = !matching.length
        ? this.copy.noTeacherLevel
        : levels.length ? levels.map(level => formativeLevelLabel(level)).join(', ') : formativeLevelLabel(null);
      return { entry, name: nombreDeCompetencia(entry.name, entry.code), teacher };
    });
  }

  /** La valoración del sistema existe pero está plegada: se mostrará cuando el docente registre la suya. */
  systemEvaluationFolded(item: AttemptTrace): boolean {
    return item.systemEvaluation === null && item.systemEvaluationAvailable;
  }

  private loadRubric(attemptId: string, { silencioso = false } = {}) {
    this.rubricRequest?.unsubscribe();
    this.rubricRequest = this.instructorApi.rubric(attemptId).subscribe({
      next: rubric => {
        if (this.selectedAttemptId() !== attemptId) return;
        this.rubric.set(this.normalizeRubric(rubric));
        this.loadingTrace.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (this.selectedAttemptId() !== attemptId) return;
        // Recargar tras guardar no borra lo que ya está en pantalla: un fallo ahí no deja la columna vacía.
        if (silencioso) return;
        this.rubric.set(null);
        if (err.status === 404) {
          this.rubricMessage.set('Este caso aún no tiene rúbrica configurada. La trazabilidad sigue disponible.');
          this.rubricMessageIsError.set(false);
        } else if (err.status === 403) {
          this.rubricMessage.set('No tienes permisos para evaluar este intento.');
          this.rubricMessageIsError.set(true);
        } else {
          this.rubricMessage.set('No fue posible cargar la rúbrica de evaluación.');
          this.rubricMessageIsError.set(true);
        }
        this.loadingTrace.set(false);
      }
    });
  }

  private refreshTrace(attemptId: string) {
    this.refreshing?.unsubscribe();
    this.refreshing = this.instructorApi.attemptTrace(attemptId).subscribe({
      next: trace => {
        if (this.selectedAttemptId() === attemptId) this.trace.set(this.normalizeTrace(trace));
      },
      error: () => undefined
    });
  }

  private normalizeTrace(trace: AttemptTrace): AttemptTrace {
    return {
      ...trace,
      phaseDurations: trace.phaseDurations ?? [],
      events: trace.events ?? [],
      reflections: trace.reflections ?? [],
      rubricEvaluations: trace.rubricEvaluations ?? [],
      counts: trace.counts ?? { recommended: 0, acceptable: 0, risky: 0, contraindicated: 0 },
      milestones: trace.milestones ?? { done: [], missing: [] },
      personaPorEscena: trace.personaPorEscena ?? [],
      systemEvaluation: trace.systemEvaluation ?? null,
      systemEvaluationAvailable: !!trace.systemEvaluationAvailable,
    };
  }

  private normalizeRubric(rubric: RubricEvaluationView): RubricEvaluationView {
    return {
      ...rubric,
      criteria: rubric.criteria ?? [],
      scores: rubric.scores ?? [],
    };
  }

  // ── Presentación (delega en la utilidad compartida con el diálogo) ───────────────────────────────────────────
  statusLabel(status: string | null | undefined): string {
    return statusLabel(this.clean(status, ''));
  }

  statusTone(status: string | null | undefined): UiBadgeTone {
    const normalized = (status ?? '').toUpperCase();
    if (normalized === 'COMPLETED') return 'success';
    if (normalized === 'IN_PROGRESS') return 'info';
    if (normalized === 'PAUSED') return 'warning';
    return 'neutral';
  }

  levelLabel(level: string | null | undefined): string {
    return formativeLevelLabel(level);
  }

  levelTone(level: string | null | undefined): UiBadgeTone {
    return formativeLevelTone(level);
  }

  /** La palabra «clave» de un hito que decide el final (nada para los demás). */
  milestoneMark(milestone: { decisive: boolean }): string | null {
    return milestoneMark(milestone);
  }

  formatDate(value: string | null | undefined): string {
    return formatTraceDate(value);
  }

  formatDuration(seconds: number | null | undefined): string {
    return formatTraceDuration(seconds);
  }

  /** «21 min»: el tiempo activo en una línea, sin segundos (es una referencia, no una medida). */
  tiempoActivo(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined) return 'No disponible';
    const minutes = Math.round(seconds / 60);
    return minutes < 1 ? 'menos de un minuto' : `${minutes} min`;
  }

  clean(value: string | null | undefined, fallback: string): string {
    return cleanText(value, fallback);
  }
}
