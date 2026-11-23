import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { CaseAccessCache } from '../../core/api/case-access.cache';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { CatalogItem, SimulationCaseSummary, StudentAttemptSummary } from '../../core/models/simulation.model';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiFiltros } from '../../shared/ui/filtros/ui-filtros';
import { plural, statusLabel } from '../../shared/ui/labels';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { UiPortadaCaso } from '../../shared/ui/portada-caso/ui-portada-caso';
import { UiSegmentado, UiSegmento } from '../../shared/ui/segmentado/ui-segmentado';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiVacioIlustrado } from '../../shared/ui/vacio-ilustrado/ui-vacio-ilustrado';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiTable, UiTableRow, UiTableTable } from '../../shared/ui/table/ui-table';
import { UiTooltip } from '../../shared/ui/tooltip/ui-tooltip';
import { attemptTone, formatDate } from '../dashboard/student-dashboard.util';
import { blockedNotice } from './case-lock.util';
import { CASOS_COPY } from './casos-copy';
import { EstadoCaso, estadoCaso, ultimoRecorrido } from './estado-caso.util';

type HttpLikeError = { status?: number };
type FiltroEstado = 'todos' | 'sin' | 'curso' | 'terminados';

/** Hasta tener más casos que estos, la búsqueda sobra: cuatro filtros de estado bastan (DISENO §4.2). */
const CASOS_PARA_BUSCAR = 8;

/** Una tarjeta de la biblioteca: el caso, lo que el estudiante lleva de él y a dónde lo manda cada acción. */
interface TarjetaCaso {
  item: SimulationCaseSummary;
  estado: EstadoCaso;
  portada: string | null | undefined;
  /** Los intentos de este caso, del más reciente al más antiguo. */
  intentos: StudentAttemptSummary[];
  /** El intento que se revisa en la página de cierre, si ya hay uno terminado. */
  recorrido: StudentAttemptSummary | null;
  /** El caso venía pedido por dirección y estaba bloqueado (`?bloqueado=`): se marca para que se vea cuál era. */
  resaltado: boolean;
}

/**
 * Casos del estudiante: la biblioteca completa y el historial por caso (DISENO §4.2, DP-07). Es el destino de «Ver todos
 * tus casos» de Inicio. Cada tarjeta dice el estado en palabras y ofrece UNA acción: «Ver ficha» (sin empezar), «Continuar»
 * (lo abierto, directo al umbral con `?intento=continuar`), «Ver tu recorrido» (terminado, navega a la página de cierre) o,
 * bloqueado, el motivo en un botón deshabilitado. Los intentos de cada caso viven dentro de su tarjeta, sin la columna
 * «Caso» (era el mismo nombre en cada fila) ni la de duración (tiempo de reloj que engañaba, P6).
 *
 * El acceso sale de `CaseAccessCache` si está fresco. El historial tiene su propio error con «Reintentar», distinto de
 * «sin intentos» (RF-24). Si se llegó aquí desde un caso bloqueado pedido por dirección (`caseUnlockedGuard`), un aviso del
 * sistema dice cuál y por qué.
 */
@Component({
  selector: 'app-simulation-catalog',
  imports: [
    UiBadge, UiButton, UiCabeceraIlustrada, UiCard, UiErrorState, UiFiltros, UiPortadaCaso, UiVacioIlustrado, UiSegmentado, UiSkeleton,
    UiTable, UiTableRow, UiTableTable, UiTooltip,
  ],
  templateUrl: './simulation-catalog.component.html',
  styleUrl: './simulation-catalog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimulationCatalogComponent {
  private readonly simulationService = inject(SimulationService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(CaseAccessCache);
  private readonly notify = inject(NotificationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  /** La tarjeta desde la que se abrió un recorrido: al volver, el foco regresa a ella UNA sola vez. */
  private retorno: string | null = (() => {
    try { return sessionStorage.getItem('siep.catalogo.retorno'); } catch { return null; }
  })();

  protected readonly copy = CASOS_COPY;
  protected readonly filtro = signal<FiltroEstado | string>('todos');
  protected readonly busqueda = signal('');
  /** El caso que se está abriendo: su portada lleva la transición de vistas hasta el umbral del juego (DP-10). */
  protected readonly entrando = signal<number | null>(null);
  /** ?bloqueado=<id> de la guardia: reactivo (la guardia puede redirigir a esta misma ruta y Angular la reutiliza). */
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);
  private readonly blockedId = computed(() => Number(this.query()?.get('bloqueado')) || null);

  protected readonly isStudent = this.auth.hasRole('ESTUDIANTE');
  /** ED-5 (E2): solo el estudiante juega; el administrador ve el catálogo para editarlo. */
  protected readonly canPlay = this.auth.hasRole('ESTUDIANTE');
  protected readonly canEdit = this.auth.hasRole('ADMIN');

  private readonly cases = signal<SimulationCaseSummary[]>([]);
  private readonly casesLoading = signal(true);
  private readonly casesError = signal<HttpLikeError | null>(null);
  private readonly history = signal<StudentAttemptSummary[]>([]);
  private readonly historyLoading = signal(false);
  private readonly historyError = signal<HttpLikeError | null>(null);
  /** Desbloqueo lineal del estudiante (SIEP-RF-12): si no llega, no se inventa ningún bloqueo. */
  private readonly catalogItems = signal<CatalogItem[]>([]);
  private readonly catalogSettled = signal(!this.isStudent);
  /**
   * El catálogo de acceso falló (Codex B4a, hallazgo 3): sin él no se sabe qué está bloqueado, así que las tarjetas no se
   * pintan con un «abierto» inventado; se muestra el error de los casos y su reintento lo vuelve a pedir.
   */
  private readonly catalogError = signal<HttpLikeError | null>(null);
  private readonly casesOrCatalogError = computed(() => this.casesError() ?? this.catalogError());
  /** El historial respondió al menos una vez (bien o mal): hasta entonces las tarjetas no saben si hay algo abierto. */
  private readonly historySettled = signal(!this.isStudent);

  /** Las tarjetas esperan al primer historial (la acción de cada caso depende de él); un reintento no las recarga. */
  protected readonly casesState = uiDataState({
    loading: computed(() => this.casesLoading() || !this.historySettled() || !this.catalogSettled()),
    error: this.casesOrCatalogError,
    isEmpty: computed(() => this.cases().length === 0),
  });
  protected readonly historyState = uiDataState({
    loading: this.historyLoading,
    error: this.historyError,
    isEmpty: computed(() => this.history().length === 0),
  });
  protected readonly statusText = computed(() => (this.casesState() === 'loading' ? this.copy.cargando : ''));
  protected readonly casesErrorKind = computed(() => errorKindFromStatus(this.casesOrCatalogError()?.status));
  protected readonly historyErrorKind = computed(() => errorKindFromStatus(this.historyError()?.status));
  protected readonly titulo = this.isStudent ? this.copy.titulo : 'Casos';

  protected readonly cards = computed<TarjetaCaso[]>(() => this.cases().map(item => {
    const catalogo = this.catalogItems();
    // Sin la entrada del catálogo no se inventa ningún bloqueo: el caso se ve como abierto y el servidor decide al entrar.
    const entrada = catalogo.find(candidato => candidato.caseVersionId === item.caseVersionId)
      ?? { caseVersionId: item.caseVersionId, code: item.code, title: item.title, description: item.description, order: 0, unlocked: true, completed: false, locked: false };
    const intentos = this.history()
      .filter(intento => intento.caseVersionId === item.caseVersionId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return {
      item,
      estado: estadoCaso(entrada, intentos, catalogo),
      portada: entrada.portada ?? item.portada,
      intentos,
      recorrido: ultimoRecorrido(intentos),
      resaltado: this.blockedId() === item.caseVersionId,
    };
  }));
  protected readonly filtradas = computed(() => {
    const filtro = this.filtro();
    const texto = this.busqueda().trim().toLowerCase();
    return this.cards().filter(card => {
      if (this.isStudent && !coincide(filtro, card.estado)) return false;
      return !texto || `${card.item.title} ${card.item.code}`.toLowerCase().includes(texto);
    });
  });
  protected readonly opciones = computed<UiSegmento[]>(() => {
    const contar = (clave: FiltroEstado) => this.cards().filter(card => coincide(clave, card.estado)).length;
    return [
      { valor: 'todos', etiqueta: this.copy.filtros.todos, cuenta: this.cards().length },
      { valor: 'sin', etiqueta: this.copy.filtros.sin, cuenta: contar('sin') },
      { valor: 'curso', etiqueta: this.copy.filtros.curso, cuenta: contar('curso') },
      { valor: 'terminados', etiqueta: this.copy.filtros.terminados, cuenta: contar('terminados') },
    ];
  });
  protected readonly conBusqueda = computed(() => this.cards().length > CASOS_PARA_BUSCAR);
  protected readonly hayFiltros = computed(() => this.filtro() !== 'todos');

  protected readonly emptyCases = this.isStudent ? this.copy.sinCasosEstudiante : this.copy.sinCasosOtros;

  protected readonly notice = computed(() => {
    const id = this.blockedId();
    return id ? blockedNotice(this.catalogItems(), id) : null;
  });

  protected readonly plural = plural;
  protected readonly tone = attemptTone;
  protected readonly formatDate = formatDate;
  protected readonly statusLabel = statusLabel;

  constructor() {
    effect(() => {
      if (!this.retorno || this.casesState() !== 'ready') return;
      const tarjeta = this.cards().find(card => String(card.item.caseVersionId) === this.retorno);
      if (!tarjeta) return;
      // Se consume ya: si las tarjetas cambian después (filtros, recarga del historial), el foco no vuelve a saltar.
      this.retorno = null;
      afterNextRender(() => {
        this.host.nativeElement.querySelector<HTMLElement>(`[data-case-id="${tarjeta.item.caseVersionId}"] .cs-acciones button`)?.focus();
        try { sessionStorage.removeItem('siep.catalogo.retorno'); } catch { /* almacenamiento bloqueado */ }
      }, { injector: this.injector });
    });
    this.loadCases();
    if (this.isStudent) {
      this.loadAccess();
    }
    // El aviso llega con el catálogo (de él sale el motivo) y se dice una vez por caso pedido: un toast se anuncia solo.
    let avisado: number | null = null;
    effect(() => {
      const mensaje = this.notice();
      const id = this.blockedId();
      if (!mensaje || id === avisado) return;
      avisado = id;
      untracked(() => this.notify.info(mensaje));
    });
  }

  /** Quita el filtro de estado y la búsqueda (la acción del vacío «sin resultados»). */
  protected limpiarFiltros(): void {
    this.filtro.set('todos');
    this.busqueda.set('');
  }

  /** Reintento del bloque de casos: vuelve a pedir lo que falló (la lista, el catálogo de acceso o los dos). */
  protected reintentarCasos(): void {
    if (this.catalogError()) this.loadCatalog();
    if (this.casesError() || !this.catalogError()) this.loadCases();
  }

  protected loadCases(): void {
    this.casesLoading.set(true);
    this.simulationService.listCases().subscribe({
      next: cases => {
        this.cases.set(cases);
        this.casesError.set(null);
        this.casesLoading.set(false);
      },
      error: (error: HttpLikeError) => {
        this.casesError.set(error ?? {});
        this.casesLoading.set(false);
      },
    });
  }

  protected loadHistory(): void {
    this.historyLoading.set(true);
    this.simulationService.attemptHistory().subscribe({
      next: history => {
        this.history.set(history);
        this.historyError.set(null);
        this.historyLoading.set(false);
        this.historySettled.set(true);
        this.guardarSiCompleto();
      },
      error: (error: HttpLikeError) => {
        this.historyError.set(error ?? {});
        this.historyLoading.set(false);
        this.historySettled.set(true);
      },
    });
  }

  /** El catálogo de acceso (desbloqueo lineal), por separado del historial: cada uno con su error y su reintento. */
  private loadCatalog(): void {
    this.catalogSettled.set(false);
    this.simulationService.getCatalog().subscribe({
      next: catalogo => {
        this.catalogItems.set(catalogo);
        this.catalogError.set(null);
        this.catalogSettled.set(true);
        this.guardarSiCompleto();
      },
      error: (error: HttpLikeError) => {
        this.catalogError.set(error ?? {});
        this.catalogSettled.set(true);
      },
    });
  }

  /**
   * Guarda en la caché el catálogo y el historial solo cuando los dos llegaron bien: lo guardado siempre es un par
   * coherente. El permiso (`ticket`) se pidió al salir las peticiones, así que una respuesta de otra sesión se descarta.
   */
  private guardarSiCompleto(): void {
    if (!this.accessTicket || this.catalogError() || this.historyError() || !this.catalogSettled() || !this.historySettled()) return;
    this.cache.guardarAcceso(this.accessTicket, { catalogo: this.catalogItems(), historial: this.history() });
  }

  private accessTicket: ReturnType<CaseAccessCache['ticket']> = null;

  private loadAccess(): void {
    const previo = this.cache.acceso();
    if (previo) {
      this.catalogItems.set(previo.catalogo);
      this.history.set(previo.historial);
      this.catalogSettled.set(true);
      this.historySettled.set(true);
      return;
    }
    // Antes, un forkJoin: si fallaba el catálogo se perdía también el historial y el error decía «historial» (Codex B4a, 3).
    this.accessTicket = this.cache.ticket();
    this.loadCatalog();
    this.loadHistory();
  }

  /**
   * Entrar al caso. Con un intento abierto se continúa directo (`?intento=continuar`: el juego lo retoma sin el diálogo, F6-2,
   * RN-07). Sin él, primero la ficha del caso (F10-1, RF-16): contexto, personajes y objetivos, sin crear el intento. El título
   * y la portada viajan en el estado de la navegación para que el umbral pinte desde el primer cuadro (DP-10).
   */
  protected openCase(card: TarjetaCaso, resume: boolean): void {
    this.entrando.set(card.item.caseVersionId);
    const umbral = { titulo: card.item.title, portada: card.portada ?? null };
    void this.router.navigate(
      resume ? ['/portal/simulador', card.item.caseVersionId] : ['/portal/simulador', card.item.caseVersionId, 'ficha'],
      resume ? { queryParams: { intento: 'continuar' }, state: { umbral } } : { state: { umbral } },
    );
  }

  /** Continuar un intento de la tabla de intentos (lo abierto de ese caso). */
  protected continuar(card: TarjetaCaso): void {
    this.openCase(card, true);
  }

  protected openEditor(caseVersionId: number): void {
    void this.router.navigate(['/portal/casos', caseVersionId, 'editor']);
  }

  /** «Ver tu recorrido»: la página de cierre del intento (DP-13), con URL estable. */
  protected openReport(attempt: StudentAttemptSummary): void {
    try { sessionStorage.setItem('siep.catalogo.retorno', String(attempt.caseVersionId)); } catch { /* almacenamiento bloqueado */ }
    void this.router.navigate(['/portal/simulador', attempt.caseVersionId, 'cierre', attempt.attemptId]);
  }
}

/** Si un estado entra en el filtro elegido: «En curso» incluye lo que está en pausa. */
function coincide(filtro: string, estado: EstadoCaso): boolean {
  switch (filtro) {
    case 'sin': return !estado.abierto && estado.clave !== 'terminado';
    case 'curso': return estado.abierto;
    case 'terminados': return estado.clave === 'terminado';
    default: return true;
  }
}
