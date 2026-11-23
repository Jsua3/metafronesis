import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal,
  untracked, viewChild, output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, firstValueFrom, forkJoin } from 'rxjs';

import { apiErrorMessage } from '../../core/api/api-error.util';
import { AuthoringApi } from '../../core/api/authoring.api';
import { revisionConflictOf } from '../../core/api/revision-conflict.util';
import {
  CaseLifecycle, CaseLifecycleAction, CaseLifecycleState, CaseTransitionRequest, CaseValidation,
} from '../../core/models/simulation.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton, UiButtonVariant } from '../../shared/ui/button/ui-button';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { statusLabel } from '../../shared/ui/labels';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { statusTone } from './case-labels.util';
import {
  CaseReviewDecision, CaseReviewDecisionData, CaseReviewDecisionDialogComponent,
} from './case-review-decision-dialog.component';
import { shortDate, summarize } from './case-review.util';

/** A qué elemento del editor llevar a quien autora cuando elige un hallazgo. */
export interface ValidationTarget {
  nodeId?: number;
  mapId?: number;
}

type PanelAction = Extract<CaseLifecycleAction, 'submit' | 'approve' | 'reject' | 'archive'>;
type DecisionAction = Extract<PanelAction, 'approve' | 'reject'>;

interface PanelActionSpec {
  action: PanelAction;
  label: string;
  icon: string;
  variant: UiButtonVariant;
}

/** Lo que impide enviar o aprobar, tal como lo dice el servidor (`CASE_NOT_PUBLISHABLE`). */
interface ReviewBlocker {
  code: string;
  message: string;
}

/** Las acciones que el panel sabe hacer, en el orden en que se ofrecen; «clonar» vive en el encabezado del editor. */
const ACTIONS: readonly PanelActionSpec[] = [
  { action: 'submit', label: 'Enviar a revisión', icon: 'fact_check', variant: 'primary' },
  { action: 'approve', label: 'Aprobar y publicar', icon: 'task_alt', variant: 'primary' },
  { action: 'reject', label: 'Devolver a borrador', icon: 'undo', variant: 'secondary' },
  { action: 'archive', label: 'Archivar', icon: 'inventory_2', variant: 'ghost' },
];

const DONE_TEXT: Record<PanelAction, string> = {
  submit: 'El caso se envió a revisión.',
  approve: 'El caso se publicó.',
  reject: 'El caso volvió a borrador.',
  archive: 'La versión se archivó.',
};

const STATE_HELP: Record<CaseLifecycleState, string> = {
  DRAFT: 'Es un borrador: todavía se puede editar. Cuando esté listo, envíalo a revisión.',
  IN_REVIEW: 'Está en revisión: no se puede modificar hasta que se apruebe o se devuelva a borrador.',
  PUBLISHED: 'Está publicado: los estudiantes asignados ya lo ven. Para cambiarlo, clona la versión.',
  ARCHIVED: 'Está archivado: los estudiantes ya no lo ven. Para retomarlo, clona la versión.',
};

const BUSY_REASON = 'Hay una acción en curso: espera a que termine.';

const REASON_LABELS: Record<string, string> = { FORMA: 'Forma', CONTENIDO: 'Contenido' };
const DECISION_LABELS: Record<string, string> = { APPROVED: 'Aprobada', REJECTED: 'Devuelta a borrador' };

function readBlockers(raw: unknown): ReviewBlocker[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is { code?: unknown; message: string } => typeof item === 'object' && item !== null
      && typeof (item as { message?: unknown }).message === 'string')
    .map(item => ({ code: typeof item.code === 'string' ? item.code : 'BLOCKER', message: item.message }));
}

/**
 * Revisión del caso en el editor (plan visual F10-6†; RF-12, RF-13, CU-05; contratos C4 y C6). Dice en qué estado está
 * la versión y ofrece SOLO las transiciones que el servidor permite (`allowedTransitions`: la pantalla no calcula
 * permisos); cada una confirma antes de actuar y manda la revisión del editor (`X-Case-Revision`). Debajo, qué falta
 * para publicar —los hallazgos de la validación en lenguaje llano— con un enlace a la escena o al mapa. Lo que impide
 * enviar se ve junto al botón (y se lee con él), no en un globo.
 *
 * Vive en una pestaña, y una pestaña inactiva se destruye: la transición en vuelo NO muere con el panel (el servidor ya
 * la recibió) y quien muestra el caso se entera por `AuthoringApi.caseChanges`, no por una salida de este panel. El
 * panel se pone al día solo: relee el estado y la validación cuando cambia la revisión del caso (se guardó algo en
 * otra parte del editor) y con «Revisar de nuevo».
 */
@Component({
  selector: 'app-case-review-panel',
  imports: [UiBadge, UiButton, UiErrorState, UiSection, UiSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="ds-sr-only" role="status">{{ statusText() }}</p>

    @switch (state()) {
      @case ('loading') {
        <div class="rv-loading" aria-busy="true">
          <ui-skeleton shape="card" [lines]="2" />
          <ui-skeleton shape="card" [lines]="3" />
        </div>
      }
      @case ('error') {
        <ui-error-state [kind]="errorKind()" [status]="errorStatus()" (retry)="refresh()" />
      }
      @case ('ready') {
        @if (lifecycle(); as current) {
          <ui-section class="rv-section" title="Estado del caso">
            <div class="rv-state">
              <ui-badge [tone]="tone(current.state)">{{ label(current.state) }}</ui-badge>
              <p #stateHelp class="rv-lead" tabindex="-1">{{ help(current.state) }}</p>
            </div>
            @if (current.blockedReason; as blocked) {
              <p class="rv-blocked">Falta para avanzar: {{ blocked.message }}</p>
            }
            @if (blockers().length > 0) {
              <div class="rv-blockers">
                <p class="rv-blockers__title">No se pudo completar la acción:</p>
                <ul>
                  @for (blocker of blockers(); track blocker.code) {
                    <li>{{ blocker.message }}</li>
                  }
                </ul>
              </div>
            }
            @if (actions().length > 0) {
              <div class="rv-actions">
                @for (item of actions(); track item.action) {
                  <button ui-button type="button" [variant]="item.variant" [icon]="item.icon"
                    [loading]="pending() === item.action" [disabledReason]="reasonFor(item.action)"
                    (click)="run(item.action)">{{ item.label }}</button>
                }
              </div>
            }
          </ui-section>

          @if (validation(); as result) {
            <ui-section class="rv-section" title="Qué falta para publicar">
              <p class="rv-summary">{{ summary() }}</p>
              @if (result.issues.length > 0) {
                <ul class="rv-issues">
                  @for (issue of result.issues; track $index) {
                    <li class="rv-issue">
                      <ui-badge [tone]="issue.severity === 'error' ? 'danger' : 'warning'">{{ issue.severity === 'error' ? 'Error' : 'Aviso' }}</ui-badge>
                      <span class="rv-issue__text">{{ issue.message }}</span>
                      @if (editable() && issue.nodeId) {
                        <button ui-button type="button" size="sm" variant="ghost" icon="arrow_forward"
                          (click)="issueOpen.emit({ nodeId: issue.nodeId })">Ir a la escena<span class="ds-sr-only"> del hallazgo {{ $index + 1 }}</span></button>
                      }
                      @if (editable() && issue.mapId) {
                        <button ui-button type="button" size="sm" variant="ghost" icon="arrow_forward"
                          (click)="issueOpen.emit({ mapId: issue.mapId })">Ir al mapa<span class="ds-sr-only"> del hallazgo {{ $index + 1 }}</span></button>
                      }
                    </li>
                  }
                </ul>
              }
              <div class="rv-actions">
                <button ui-button type="button" variant="secondary" icon="refresh" [loading]="validating()"
                  (click)="revalidate()">Revisar de nuevo</button>
              </div>
            </ui-section>
          }

          @if (current.review; as review) {
            <ui-section class="rv-section" title="Última revisión">
              <ul class="rv-review">
                <li>Enviada por {{ review.requestedBy || 'una persona sin nombre' }} el {{ date(review.requestedAt) }}.</li>
                @if (review.decision) {
                  <li>{{ decisionLabel(review.decision) }} por {{ review.decidedBy || 'una persona sin nombre' }} el {{ date(review.decidedAt) }}.</li>
                }
                @if (review.reason) {
                  <li>Motivo: {{ reasonLabel(review.reason) }}.</li>
                }
                @if (review.note) {
                  <li class="rv-review__note">Nota: {{ review.note }}</li>
                }
                @if (review.contentReview; as proof) {
                  <li>Constancia de contenido: {{ proof.reviewer }}, {{ date(proof.reviewedOn) }}, {{ proof.reference }}.</li>
                }
              </ul>
            </ui-section>
          }
        }
      }
    }
  `,
  styles: [`
    :host { display: block; color: var(--ds-text-1); }
    .rv-section { display: block; min-width: 0; margin-block-start: var(--ds-space-5); }
    .rv-section:first-of-type { margin-block-start: 0; }
    .rv-loading { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ds-space-4); }
    .rv-state { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ds-space-3) var(--ds-space-4); margin-block: var(--ds-space-3); }
    .rv-lead, .rv-blocked, .rv-summary {
      margin: 0;
      color: var(--ds-text-2);
      font-size: var(--ds-type-body-s-size);
      line-height: var(--ds-type-body-s-line);
    }
    .rv-blocked { margin-block-start: var(--ds-space-3); color: var(--ds-text-1); }
    .rv-summary { color: var(--ds-text-1); font-weight: var(--ds-type-h3-weight); }
    .rv-blockers {
      margin-block-start: var(--ds-space-4);
      padding: var(--ds-space-3) var(--ds-space-4);
      border: 1px solid var(--ds-border-strong);
      border-radius: var(--ds-radius-md);
      background: var(--ds-warning-bg);
      color: var(--ds-warning-text);
      font-size: var(--ds-type-body-s-size);
      line-height: var(--ds-type-body-s-line);
    }
    .rv-blockers__title { margin: 0 0 var(--ds-space-2); font-weight: var(--ds-type-h3-weight); }
    .rv-blockers ul { margin: 0; padding-inline-start: var(--ds-space-5); }
    .rv-actions { display: flex; flex-wrap: wrap; gap: var(--ds-space-3); margin-block-start: var(--ds-space-4); }
    .rv-issues {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ds-space-3);
      margin: var(--ds-space-4) 0 0;
      padding: 0;
      list-style: none;
    }
    .rv-issue {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ds-space-2) var(--ds-space-3);
      padding: var(--ds-space-3);
      border: 1px solid var(--ds-border);
      border-radius: var(--ds-radius-md);
      background: var(--ds-surface-1);
    }
    .rv-issue__text { flex: 1 1 16rem; min-width: 0; overflow-wrap: anywhere; }
    .rv-review {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ds-space-2);
      margin: var(--ds-space-3) 0 0;
      padding: 0;
      list-style: none;
      color: var(--ds-text-2);
      font-size: var(--ds-type-body-s-size);
      line-height: var(--ds-type-body-s-line);
    }
    .rv-review__note { overflow-wrap: anywhere; color: var(--ds-text-1); }
  `],
})
export class CaseReviewPanelComponent {
  private readonly api = inject(AuthoringApi);
  private readonly dialog = inject(UiDialog);
  private readonly notify = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly caseVersionId = input.required<number>();
  /** La revisión del editor: viaja en `X-Case-Revision` de cada transición y, al cambiar, el panel se pone al día. */
  readonly revision = input<number | null>(null);
  /** El caso admite cambios (borrador): solo entonces los hallazgos llevan a la escena o al mapa. */
  readonly editable = input(true);

  /** Quien autora eligió un hallazgo: el editor lo lleva a la escena o al mapa. */
  readonly issueOpen = output<ValidationTarget>();

  protected readonly lifecycle = signal<CaseLifecycle | null>(null);
  protected readonly validation = signal<CaseValidation | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<unknown>(null);
  protected readonly busy = signal(false);
  protected readonly pending = signal<PanelAction | null>(null);
  protected readonly validating = signal(false);
  protected readonly blockers = signal<ReviewBlocker[]>([]);
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = signal('');

  protected readonly state = uiDataState({ loading: this.loading, error: this.error, isEmpty: computed(() => false) });
  protected readonly errorStatus = computed(() => {
    const failure = this.error();
    return failure instanceof HttpErrorResponse ? failure.status : null;
  });
  protected readonly errorKind = computed(() => errorKindFromStatus(this.errorStatus()));
  protected readonly summary = computed(() => summarize(this.validation()));
  protected readonly actions = computed(() => {
    const allowed = this.lifecycle()?.allowedTransitions ?? [];
    return ACTIONS.filter(item => allowed.includes(item.action));
  });

  private readonly stateHelp = viewChild<ElementRef<HTMLElement>>('stateHelp');
  /** Una vez que el servidor dijo que exige la constancia de contenido, el diálogo la pide como obligatoria. */
  private contentReviewRequired = false;
  /** Lo escrito en el diálogo de cada decisión: si el servidor la rechaza, al reabrirla no hay que volver a escribirlo. */
  private readonly drafts: Partial<Record<DecisionAction, CaseReviewDecision>> = {};
  private asking = false;
  private destroyed = false;
  private loadRun: Subscription | undefined;

  constructor() {
    this.destroyRef.onDestroy(() => { this.destroyed = true; });
    // Al abrirse y cada vez que cambia el caso o su revisión (se guardó algo en otra parte del editor): con lo ya a
    // la vista se relee sin esqueleto; la primera vez se carga con él.
    effect(() => {
      const id = this.caseVersionId();
      this.revision();
      untracked(() => this.load(id));
    });
  }

  protected tone(state: string) {
    return statusTone(state);
  }

  protected label(state: string): string {
    return statusLabel(state);
  }

  protected help(state: CaseLifecycleState): string {
    return STATE_HELP[state] ?? '';
  }

  protected date(value: string | null | undefined): string {
    return shortDate(value);
  }

  protected decisionLabel(decision: string): string {
    return DECISION_LABELS[decision] ?? decision;
  }

  protected reasonLabel(reason: string): string {
    return REASON_LABELS[reason] ?? reason;
  }

  /** Por qué una acción no se puede hacer ahora (en curso o impedida por el servidor), o `null`. */
  protected reasonFor(action: PanelAction): string | null {
    if (this.busy()) return BUSY_REASON;
    if (action === 'submit' || action === 'approve') return this.lifecycle()?.blockedReason?.message ?? null;
    return null;
  }

  protected refresh(): void {
    this.load(this.caseVersionId());
  }

  /** «Revisar de nuevo»: relee la validación Y el estado (lo que impide avanzar puede haberse resuelto) y lo anuncia. */
  protected revalidate(): void {
    if (this.validating()) return;
    this.validating.set(true);
    this.statusText.set('');
    this.fetch(this.caseVersionId(), true);
  }

  protected async run(action: PanelAction): Promise<void> {
    if (this.asking || this.reasonFor(action)) return;
    this.asking = true;
    let request: CaseTransitionRequest | null;
    try {
      request = await this.ask(action);
    } finally {
      this.asking = false;
    }
    if (request) this.send(action, request);
  }

  private load(id: number): void {
    const quiet = this.lifecycle()?.caseVersionId === id;
    if (!quiet) {
      this.loading.set(true);
      this.error.set(null);
    }
    this.fetch(id, false, quiet);
  }

  /** Lee el estado y la validación juntos; `announce` pone el titular en la región de estado; `quiet` conserva lo visible. */
  private fetch(id: number, announce: boolean, quiet = true): void {
    this.loadRun?.unsubscribe();
    this.loadRun = forkJoin({ lifecycle: this.api.lifecycle(id), validation: this.api.validateCase(id) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ lifecycle, validation }) => {
          this.lifecycle.set(lifecycle);
          this.validation.set(validation);
          this.blockers.set([]);
          this.loading.set(false);
          this.validating.set(false);
          if (announce || !quiet) this.statusText.set(summarize(validation));
        },
        error: (err: unknown) => {
          this.validating.set(false);
          if (quiet && this.lifecycle()) {
            // Lo que ya se veía sigue a la vista: solo se avisa que no se pudo actualizar.
            const message = apiErrorMessage(err, 'No fue posible actualizar la revisión del caso.');
            if (message) this.notify.error(message);
            return;
          }
          this.error.set(err ?? new Error('No fue posible cargar la revisión.'));
          this.loading.set(false);
        },
      });
  }

  /** La confirmación o el diálogo de cada acción; `null` si la persona se arrepiente (Cancelar, Esc). */
  private async ask(action: PanelAction): Promise<CaseTransitionRequest | null> {
    switch (action) {
      case 'submit':
        return (await this.dialog.confirm({
          title: 'Enviar a revisión',
          message: 'Quien revisa el caso decidirá si se publica. Mientras esté en revisión no podrás modificarlo.',
          confirmLabel: 'Enviar',
        })) ? { action } : null;
      case 'archive':
        return (await this.dialog.confirm({
          title: 'Archivar versión',
          message: this.lifecycle()?.state === 'PUBLISHED'
            ? 'Los estudiantes dejarán de ver esta versión en su catálogo y no se podrá modificar. Podrás clonarla para seguir trabajando.'
            : 'La versión quedará archivada y no se podrá modificar. Podrás clonarla para seguir trabajando.',
          confirmLabel: 'Archivar',
          tone: 'danger',
        })) ? { action, scope: 'version' } : null;
      case 'approve':
      case 'reject': {
        const ref = this.dialog.open<CaseReviewDecision | undefined, CaseReviewDecisionData, CaseReviewDecisionDialogComponent>(
          CaseReviewDecisionDialogComponent,
          { data: { mode: action, contentReviewRequired: this.contentReviewRequired, draft: this.drafts[action] } },
        );
        const decision = await firstValueFrom(ref.closed);
        if (!decision) {
          delete this.drafts[action];
          return null;
        }
        this.drafts[action] = decision;
        return { action, ...decision };
      }
    }
  }

  /**
   * La transición NO se cancela si el panel se destruye (una pestaña inactiva se destruye): el servidor ya recibió la
   * orden, así que el aviso sale igual y `AuthoringApi.caseChanges` le dice al editor que relea el caso.
   */
  private send(action: PanelAction, request: CaseTransitionRequest): void {
    this.busy.set(true);
    this.pending.set(action);
    this.blockers.set([]);
    this.api.transitionCase(this.caseVersionId(), request, this.revision() ?? undefined).subscribe({
      next: lifecycle => {
        this.notify.success(DONE_TEXT[action]);
        if (this.destroyed) return;
        this.settleBusy();
        // El ciclo que devuelve la transición ya es el estado: no hace falta otra lectura.
        this.lifecycle.set(lifecycle);
        if (action === 'approve' || action === 'reject') delete this.drafts[action];
        // El botón que se pulsó ya no está (o cambió de sitio): el foco vuelve a la descripción del estado nuevo.
        afterNextRender(() => this.stateHelp()?.nativeElement.focus(), { injector: this.injector });
      },
      error: (err: unknown) => {
        if (!this.destroyed) this.settleBusy();
        this.fail(err);
      },
    });
  }

  private settleBusy(): void {
    this.busy.set(false);
    this.pending.set(null);
  }

  private fail(err: unknown): void {
    if (revisionConflictOf(err)) {
      this.notify.error('Este caso cambió en otra sesión: se actualizó lo que ves. Revisa y vuelve a intentarlo.');
      return;
    }
    const body = err instanceof HttpErrorResponse ? (err.error as { code?: unknown; blockers?: unknown } | null) : null;
    if (body?.code === 'INVALID_TRANSITION') {
      // Otra pestaña o persona ya cambió el estado: el servidor lo dice con el código del estado; aquí, en palabras.
      this.notify.error('El caso ya cambió de estado desde otra pestaña o sesión: se actualizó lo que ves.');
      if (!this.destroyed) this.refresh();
      return;
    }
    if (body?.code === 'CASE_NOT_PUBLISHABLE') {
      const blockers = readBlockers(body.blockers);
      if (blockers.length > 0) {
        // S3-3: la constancia que falta llega como un bloqueo `ETHICS.NO_CONTENT_REVIEW` (409), ya no como un 400
        // `CONTENT_REVIEW_REQUIRED`: el siguiente intento de aprobar la pide como obligatoria en el diálogo.
        if (blockers.some(blocker => blocker.code === 'ETHICS.NO_CONTENT_REVIEW')) this.contentReviewRequired = true;
        this.blockers.set(blockers);
        // La región de estado ya existe: lo que impide avanzar se anuncia ahí (un `alert` que nace con su texto no).
        this.statusText.set(`No se pudo completar la acción: ${blockers.map(blocker => blocker.message).join(' ')}`);
        return;
      }
    }
    if (body?.code === 'CONTENT_REVIEW_REQUIRED') this.contentReviewRequired = true;
    const message = apiErrorMessage(err, 'No fue posible completar la acción.');
    if (message) this.notify.error(message);
  }
}
