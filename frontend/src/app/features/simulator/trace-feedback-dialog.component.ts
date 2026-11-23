import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AttemptTimelineEntry, ReflectionTrace, RubricSummary, TraceEvent } from '../../core/models/revision.model';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialogActions, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';
import { DRAFT_COPY } from './draft-copy';
import {
  cleanText, decisionFeedback, formatTraceDate, formativeLevelLabel, formativeLevelTone, responseClassAccent,
  responseClassLabel, responseClassTone, timelineEntryAccent, timelineEntryLabel, timelineEntryTone, timelineFeedback,
} from './trace-labels.util';

export type SummaryFeedbackKey =
  'TOTAL' | 'RECOMMENDED' | 'ACCEPTABLE' | 'RISKY' | 'CONTRAINDICATED' | 'REFLECTIONS' | 'EVALUATION' | 'TIME' | 'RECORRIDO';

/** Lo que el diálogo de retroalimentación muestra: una de las nueve lecturas del intento. */
export interface FeedbackPanelView {
  key: SummaryFeedbackKey;
  title: string;
  intro: string;
  decisions: TraceEvent[];
  timeline: AttemptTimelineEntry[];
  reflections: ReflectionTrace[];
  evaluations: RubricSummary[];
  emptyTitle: string;
  emptyMessage: string;
  missingNodes: string[];
}

export interface TraceFeedbackDialogData {
  panel: FeedbackPanelView;
}

/**
 * Retroalimentación docente de la traza (plan visual F7-4). Antes era un `div role="dialog"` hecho a mano, con su
 * propio fondo, bloqueo del desplazamiento y escape. Ahora es un diálogo de la biblioteca: trampa de foco, foco
 * inicial dentro, Esc y fondo cierran y el foco vuelve a la tarjeta que lo abrió. Solo muestra: no calcula nada.
 */
@Component({
  selector: 'app-trace-feedback-dialog',
  imports: [UiBadge, UiButton, UiDialogActions, UiDialogFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame [title]="panel.title" [description]="panel.intro" [dismissible]="false">
      @if (panel.decisions.length) {
        <ul class="tf-list">
          @for (decision of panel.decisions; track $index) {
            <li class="tf-card" [attr.data-accent]="accentOf(decision.class)">
              <div class="tf-card__top">
                <ui-badge [tone]="toneOf(decision.class)">{{ labelOf(decision.class) }}</ui-badge>
                <small>{{ date(decision.occurredAt) }}</small>
              </div>
              <h3 class="tf-card__title">{{ clean(decision.decisionText, 'Decisión registrada') }}</h3>
              @if (decision.nodeTitle) {
                <p class="tf-card__meta">Escenario: {{ decision.nodeTitle }}</p>
              }
              <p class="tf-card__hint">{{ feedbackOf(decision) }}</p>
            </li>
          }
        </ul>
      } @else if (panel.timeline.length) {
        <ul class="tf-list">
          @for (entry of panel.timeline; track $index) {
            <li class="tf-card" [attr.data-accent]="entryAccent(entry)">
              <div class="tf-card__top">
                <ui-badge [tone]="entryTone(entry)">{{ entryLabel(entry) }}</ui-badge>
                <small>{{ entry.time }}</small>
              </div>
              <h3 class="tf-card__title">{{ clean(entry.label, 'Evento registrado') }}</h3>
              <p class="tf-card__hint">{{ entryFeedback(entry) }}</p>
            </li>
          }
        </ul>
      } @else if (panel.reflections.length) {
        <ul class="tf-list">
          @for (reflection of panel.reflections; track reflection.nodeId) {
            <li class="tf-card">
              <div class="tf-card__top">
                <strong>{{ clean(reflection.nodeTitle, 'Escenario') }}</strong>
                @if (reflection.locked) {
                  <ui-badge>Bloqueada</ui-badge>
                }
              </div>
              <p class="tf-card__text">{{ clean(reflection.text, 'Sin texto registrado.') }}</p>
            </li>
          }
        </ul>
      } @else if (panel.evaluations.length) {
        <ul class="tf-list">
          @for (evaluation of panel.evaluations; track evaluation.id) {
            <li class="tf-card">
              <h3 class="tf-card__title">{{ clean(evaluation.rubricName, 'Rúbrica') }}</h3>
              <p class="tf-card__meta">
                {{ valuationLabel }}:
                <ui-badge [tone]="levelTone(evaluation.overallLevel)">{{ levelLabel(evaluation.overallLevel) }}</ui-badge>
              </p>
              @if (evaluation.comment) {
                <p class="tf-card__hint">{{ evaluation.comment }}</p>
              }
              <small>Evaluada: {{ date(evaluation.evaluatedAt) }}</small>
            </li>
          }
        </ul>
      } @else if (panel.key === 'TIME') {
        <!-- La duración, el inicio y el cierre ya van en la descripción del diálogo: no se repiten. -->
      } @else {
        <section class="tf-empty">
          <h3 class="tf-card__title">{{ panel.emptyTitle }}</h3>
          <p class="tf-card__hint">{{ panel.emptyMessage }}</p>
          @if (panel.missingNodes.length) {
            <p class="tf-card__meta">Escenarios visitados sin bitácora:</p>
            <ul class="tf-missing">
              @for (nodeTitle of panel.missingNodes; track nodeTitle) {
                <li>{{ nodeTitle }}</li>
              }
            </ul>
          }
        </section>
      }
      <button ui-button uiDialogActions type="button" variant="secondary" (click)="ref.close()">Cerrar</button>
    </ui-dialog-frame>
  `,
  styles: [`
    .tf-list {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ds-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .tf-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ds-space-2);
      padding: var(--ds-space-3) var(--ds-space-4);
      border: 1px solid var(--ds-border);
      border-inline-start: 4px solid var(--ds-border-strong);
      border-radius: var(--ds-radius-md);
      background: var(--ds-surface-1);
      overflow-wrap: anywhere;
    }

    .tf-card[data-accent='recommended'] { border-inline-start-color: var(--ds-success); }
    .tf-card[data-accent='acceptable'] { border-inline-start-color: var(--ds-primary); }
    .tf-card[data-accent='risky'] { border-inline-start-color: var(--ds-warning-text); }
    .tf-card[data-accent='contraindicated'] { border-inline-start-color: var(--ds-danger); }

    .tf-card__top {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ds-space-2);
    }

    .tf-card__title {
      margin: 0;
      font-size: var(--ds-type-body-size);
      line-height: var(--ds-type-body-line);
      font-weight: var(--ds-type-h3-weight);
    }

    .tf-card__meta,
    .tf-card__hint,
    .tf-card__text {
      margin: 0;
      font-size: var(--ds-type-body-s-size);
      line-height: var(--ds-type-body-s-line);
    }

    .tf-card__hint,
    .tf-card__meta,
    small {
      color: var(--ds-text-2);
    }

    .tf-empty {
      display: grid;
      gap: var(--ds-space-2);
    }

    .tf-missing {
      margin: 0;
      padding-inline-start: var(--ds-space-5);
      font-size: var(--ds-type-body-s-size);
    }
  `],
})
export class TraceFeedbackDialogComponent {
  protected readonly ref = inject<DialogRef<void>>(DialogRef);
  protected readonly panel = inject<TraceFeedbackDialogData>(DIALOG_DATA).panel;
  protected readonly valuationLabel = DRAFT_COPY.formativeValuationLabel.text;

  protected readonly clean = cleanText;
  protected readonly date = formatTraceDate;
  protected readonly labelOf = responseClassLabel;
  protected readonly toneOf = responseClassTone;
  protected readonly accentOf = responseClassAccent;
  protected readonly feedbackOf = decisionFeedback;
  protected readonly entryLabel = timelineEntryLabel;
  protected readonly entryTone = timelineEntryTone;
  protected readonly entryAccent = timelineEntryAccent;
  protected readonly entryFeedback = timelineFeedback;
  protected readonly levelLabel = formativeLevelLabel;
  protected readonly levelTone = formativeLevelTone;
}
