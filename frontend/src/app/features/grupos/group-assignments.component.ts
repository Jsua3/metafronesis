import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, Subscription, firstValueFrom } from 'rxjs';

import { AssignmentService } from '../../core/api/assignment.service';
import { mensajeDeCarga, mensajeDeError } from '../../core/api/mensaje-de-error.util';
import { Assignment } from '../../core/models/assignment.model';
import { SimulationCaseSummary } from '../../core/models/revision.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { AssignmentDialogComponent, AssignmentDialogData, AssignmentDialogResult } from './assignment-dialog.component';
import { windowText } from './assignment-window.util';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
type HttpLikeError = { status?: number };

interface AssignmentRow {
  assignment: Assignment;
  title: string;
  detail: string;
  label: string;
  tone: Tone;
  window: string;
}

function statusOf(assignment: Assignment): { label: string; tone: Tone } {
  if (!assignment.active) return { label: 'En pausa', tone: 'warning' };
  switch (assignment.state) {
    case 'SCHEDULED': return { label: 'Aún no abre', tone: 'info' };
    case 'CLOSED': return { label: 'Ya cerró', tone: 'neutral' };
    default: return { label: 'Abierto', tone: 'success' };
  }
}

/**
 * «Casos asignados» de un grupo (plan visual F10-5†; C7, RF-14, RF-15, CU-06, RN-04): cada asignación con su caso, su estado
 * (abierto, aún no abre, ya cerró o en pausa) y su ventana con palabras. Asignar y cambiar las fechas pasan por un diálogo;
 * pausar y retirar piden confirmar lo que le pasa al grupo (sin acceso no se inicia ni se sigue el caso). Cada acción avisa
 * su resultado y un error del servidor se dice con su mensaje, sin cambiar la lista. El destino de hoy es el grupo: el de un
 * estudiante concreto lo habilitará el servidor después (decisión 5).
 */
@Component({
  selector: 'app-group-assignments',
  imports: [RouterLink, UiBadge, UiButton, UiErrorState, UiIconButton, UiSection, UiSkeleton],
  templateUrl: './group-assignments.component.html',
  styleUrl: './group-assignments.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupAssignmentsComponent {
  private readonly service = inject(AssignmentService);
  private readonly dialog = inject(UiDialog);
  private readonly notify = inject(NotificationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private loadSubscription: Subscription | null = null;

  readonly grupoId = input.required<number>();
  /** Los casos publicados: sirven para nombrar cada asignación y para ofrecer los que el grupo aún no tiene. */
  readonly cases = input<SimulationCaseSummary[]>([]);
  /** Si los casos publicados ya llegaron: «sin casos que asignar» solo es verdad cuando se pudieron leer. */
  readonly casesStatus = input<'loading' | 'ready' | 'failed'>('ready');
  /** Cuántos casos tiene asignados el grupo, cuando termina de cargar y cada vez que cambian: el detalle del grupo los cuenta. */
  readonly assignedChange = output<number>();
  /** «Reintentar» tras fallar la carga de los casos publicados: esa lista la trae quien contiene este componente. */
  readonly retryCases = output<void>();

  protected readonly assignments = signal<Assignment[]>([]);
  private readonly loading = signal(true);
  protected readonly error = signal<HttpLikeError | null>(null);
  protected readonly busy = signal(false);

  protected readonly state = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => this.assignments().length === 0),
  });
  protected readonly errorKind = computed(() => errorKindFromStatus(this.error()?.status));

  protected readonly rows = computed<AssignmentRow[]>(() => this.assignments()
    .filter(assignment => assignment.target.type === 'GROUP')
    .map(assignment => {
      const found = this.cases().find(item => item.caseVersionId === assignment.caseVersionId);
      const status = statusOf(assignment);
      return {
        assignment,
        title: found?.title ?? assignment.caseTitle ?? `Caso ${assignment.caseVersionId}`,
        detail: found ? `${found.code} · v${found.semanticVersion}` : '',
        label: status.label,
        tone: status.tone,
        window: windowText(assignment.opensAt, assignment.closesAt),
      };
    }));

  /** Los casos publicados que el grupo todavía no tiene asignados. */
  protected readonly assignable = computed(() => {
    const taken = new Set(this.assignments().map(assignment => assignment.caseVersionId));
    return this.cases().filter(item => !taken.has(item.caseVersionId));
  });
  /** Por qué no se puede asignar todavía (null si se puede): sin saber qué tiene el grupo o qué hay publicado se ofrecería a ciegas. */
  protected readonly assignReason = computed(() => {
    if (this.loading()) return 'Cargando los casos del grupo…';
    if (this.error()) return 'Primero reintenta cargar los casos asignados.';
    if (this.casesStatus() === 'loading') return 'Cargando los casos publicados…';
    if (this.casesStatus() === 'failed') return 'No pudimos cargar tus casos publicados. Reintenta para poder asignar.';
    if (!this.cases().length) return 'Aún no tienes casos publicados. Publica uno en «Casos» y vuelve aquí para asignarlo.';
    return this.assignable().length ? null : 'Ya asignaste a este grupo todos tus casos publicados. Para ofrecer otro, publícalo en «Casos».';
  });
  protected readonly busyReason = computed(() => (this.busy() ? 'Hay un cambio en curso: espera un momento.' : null));
  /** El motivo que se ve junto al botón y, cuando hay una salida (publicar un caso, reintentar), el camino para tomarla. */
  protected readonly motivoVisible = computed<{ texto: string; salida: 'casos' | 'reintentar-casos' | null } | null>(() => {
    const texto = this.assignReason() ?? this.busyReason();
    if (!texto) return null;
    const cargado = !this.loading() && !this.error();
    if (cargado && this.casesStatus() === 'failed') return { texto, salida: 'reintentar-casos' };
    if (cargado && this.casesStatus() === 'ready' && !this.assignable().length) return { texto, salida: 'casos' };
    return { texto, salida: null };
  });
  protected readonly errorTexto = computed(() => mensajeDeCarga(this.error()?.status, 'No pudimos cargar los casos asignados.'));

  constructor() {
    effect(() => {
      const groupId = this.grupoId();
      untracked(() => this.load(groupId));
    });
    effect(() => {
      const count = this.assignments().length;
      // Solo un grupo que terminó de cargar tiene un conteo que decir (ni el del anterior ni el de una carga fallida).
      if (!this.loading() && !this.error()) untracked(() => this.assignedChange.emit(count));
    });
    inject(DestroyRef).onDestroy(() => this.loadSubscription?.unsubscribe());
  }

  /** Pide las asignaciones del grupo; una petición anterior (de otro grupo) se cancela y la lista vieja no se enseña. */
  protected load(groupId = this.grupoId()): void {
    this.loadSubscription?.unsubscribe();
    this.assignments.set([]);
    this.error.set(null);
    this.loading.set(true);
    this.loadSubscription = this.service.list(groupId).subscribe({
      next: rows => {
        this.assignments.set(rows);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (error: HttpLikeError) => {
        this.error.set(error ?? {});
        this.loading.set(false);
      },
    });
  }

  protected async assign(): Promise<void> {
    const options = this.assignable();
    if (!options.length || this.busy()) return;
    const ref = this.dialog.open<AssignmentDialogResult | undefined, AssignmentDialogData>(AssignmentDialogComponent, {
      data: { mode: 'create', cases: options },
    });
    const result = await firstValueFrom(ref.closed, { defaultValue: undefined });
    if (!result || result.caseVersionId === undefined) return;
    this.run(
      this.service.create({ caseVersionId: result.caseVersionId, target: { type: 'GROUP', groupId: this.grupoId() }, opensAt: result.opensAt, closesAt: result.closesAt }),
      created => this.assignments.update(rows => [...rows, created]),
      'Caso asignado al grupo.', 'No fue posible asignar el caso al grupo.',
    );
  }

  protected async changeDates(row: AssignmentRow): Promise<void> {
    if (this.busy()) return;
    const ref = this.dialog.open<AssignmentDialogResult | undefined, AssignmentDialogData>(AssignmentDialogComponent, {
      data: { mode: 'edit', cases: [], assignment: row.assignment, title: row.title },
    });
    const result = await firstValueFrom(ref.closed, { defaultValue: undefined });
    if (!result) return;
    this.run(
      this.service.update(row.assignment.id, { opensAt: result.opensAt, closesAt: result.closesAt }),
      updated => this.replace(updated),
      'Fechas actualizadas.', 'No fue posible cambiar las fechas.',
    );
  }

  protected async togglePause(row: AssignmentRow): Promise<void> {
    if (this.busy()) return;
    if (row.assignment.active) {
      const confirmed = await this.dialog.confirm({
        title: `¿Pausar «${row.title}» para el grupo?`,
        message: 'Mientras esté en pausa, nadie del grupo podrá iniciar ni seguir este caso. Puedes reanudarlo cuando quieras.',
        confirmLabel: 'Pausar',
      });
      if (!confirmed) return;
    }
    const pausing = row.assignment.active;
    this.run(
      this.service.update(row.assignment.id, { active: !pausing }),
      updated => this.replace(updated),
      pausing ? 'Asignación en pausa.' : 'Asignación reanudada.',
      pausing ? 'No fue posible pausar la asignación.' : 'No fue posible reanudar la asignación.',
    );
  }

  protected async remove(row: AssignmentRow): Promise<void> {
    if (this.busy()) return;
    const confirmed = await this.dialog.confirm({
      title: `¿Retirar «${row.title}» del grupo?`,
      message: 'Los estudiantes del grupo dejarán de ver el caso, incluso quienes ya lo empezaron. Puedes volver a asignarlo después.',
      confirmLabel: 'Retirar',
      tone: 'danger',
    });
    if (!confirmed) return;
    this.run(
      this.service.remove(row.assignment.id),
      () => this.assignments.update(rows => rows.filter(item => item.id !== row.assignment.id)),
      'Caso retirado del grupo.', 'No fue posible retirar el caso del grupo.',
      // El botón que se pulsó desaparece con la fila: el foco va a «Asignar un caso», que sigue ahí.
      () => afterNextRender(() => this.host.querySelector<HTMLElement>('[data-ga-assign]')?.focus(), { injector: this.injector }),
    );
  }

  private replace(updated: Assignment): void {
    this.assignments.update(rows => rows.map(item => (item.id === updated.id ? updated : item)));
  }

  /**
   * Una acción sobre el servidor: ocupa la sección mientras dura, avisa su resultado y, si falla, no toca la lista. Si el
   * grupo cambió mientras tanto, la respuesta (de otro grupo) no se aplica a la lista que se está viendo.
   */
  private run<T>(call: Observable<T>, apply: (value: T) => void, success: string, failure: string, afterApply?: () => void): void {
    const groupId = this.grupoId();
    this.busy.set(true);
    call.subscribe({
      next: value => {
        if (this.grupoId() === groupId) {
          apply(value);
          afterApply?.();
        }
        this.busy.set(false);
        this.notify.success(success);
      },
      error: (error: unknown) => {
        const text = mensajeDeError(error, failure);
        if (text) this.notify.error(text);
        this.busy.set(false);
      },
    });
  }
}
