import { A11yModule } from '@angular/cdk/a11y';
import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY } from 'rxjs';
import { SimulationService } from '../../core/api/simulation.service';
import { AttemptCompletionReport, AttemptTimelineEntry, DecisionReviewItem, MissedOption, SimulationAttemptState } from '../../core/models/simulation.model';
import { UiScopeNotice } from '../../shared/ui/scope-notice/ui-scope-notice';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { AvatarStore } from '../character/avatar.store';
import { toAvatarV2 } from '../character/kit/avatar-v2';
import { resolveCharacter } from '../character/kit/character-visual.resolver';
import { KitFigureComponent } from '../character/kit/kit-figure.component';
import { KitService } from '../character/kit/kit.service';
import { DRAFT_COPY } from './draft-copy';
import { levelWord, milestoneMark, missedFactsText, responseClassWord } from './outcome-text.util';
import { RECONSIDERED_LABEL, reconsideredChip } from './reconsidered.util';

/**
 * Pantalla de fin de partida (liquid-glass) extraída de SimulationPlayComponent.
 *
 * Presentacional: recibe el `report` y el `status` del intento y emite `retry`
 * cuando el estudiante decide reintentar el caso. El avatar se toma del
 * AvatarStore global para el retrato del encabezado.
 */
@Component({
  selector: 'app-attempt-outcome',
  standalone: true,
  imports: [A11yModule, NgTemplateOutlet, RouterLink, KitFigureComponent, UiEmptyState, UiErrorState, UiScopeNotice, UiSkeleton],
  template: `
    @if (status() !== 'IN_PROGRESS') {
      <section class="outcome"
        [class.liquid-glass]="status() !== 'PAUSED'"
        [class.u-placa]="status() === 'PAUSED'" [class.u-sombra]="status() === 'PAUSED'"
        [class.outcome--safe]="status() === 'SAFE_EXITED' || status() === 'PAUSED'"
        [class.outcome--pause]="status() === 'PAUSED'" role="alertdialog" aria-modal="true"
        aria-labelledby="outcome-title"
        cdkTrapFocus>
        <header class="oc-head">
          <div class="oc-avatar" aria-hidden="true">
            <app-kit-figure [visual]="playerVisual()" portrait="neutral" [scale]="3" />
          </div>
          <div class="oc-head__copy">
            <p class="oc-eyebrow">{{ eyebrow() }}</p>
            <!-- tabindex -1: el foco inicial del resultado va al título (H-05); en la pausa va a «Reanudar». -->
            <h3 id="outcome-title" tabindex="-1">{{ title() }}</h3>
          </div>
        </header>

        @if (status() === 'PAUSED') {
          <!-- Pausa calmada: lo primero es poder volver; el tablero queda plegado y sin cifras en primer plano. -->
          <p class="oc-pause-copy">{{ pauseMessage }}</p>
          @if (pauseNote()) { <p class="oc-pause-note" role="status">{{ pauseNote() }}</p> }
          <div class="oc-actions oc-actions--pause">
            <!-- Pausa reanudable real: mismo intento, sin crear uno nuevo. -->
            <button type="button" class="oc-btn oc-btn--go u-ficha u-ficha--primaria" cdkFocusInitial (click)="resume.emit()">Reanudar este intento</button>
            @if (mode() === 'rehearsal') {
              <a class="oc-btn oc-btn--line u-boton" [routerLink]="editorLink()">{{ draft.rehearsalBackToEditor.text }}</a>
            } @else {
              <a class="oc-btn oc-btn--line u-boton" routerLink="/portal/simulador">Volver al catálogo</a>
            }
          </div>
          @if (supportResources().length) {
            <div class="oc-block oc-support">
              <p class="oc-label">Apoyo profesional</p>
              <ul class="oc-support__list">
                @for (resource of supportResources(); track resource) { <li>{{ resource }}</li> }
              </ul>
            </div>
          }
          @if (report()) {
            <details class="oc-details">
              <summary class="u-boton">Ver mi seguimiento <i class="u-seguir oc-details__flecha" aria-hidden="true"></i></summary>
              <ng-container [ngTemplateOutlet]="board" />
            </details>
          }
        } @else {
          <ng-container [ngTemplateOutlet]="board" />
          <footer class="oc-actions">
            @if (mode() === 'rehearsal') {
              <!-- Ensayo (DSL-10): se repite o se vuelve al editor; nada de catálogo ni de portal de estudiantes. -->
              <button type="button" class="oc-btn oc-btn--go" (click)="retry.emit()">{{ draft.rehearsalRestart.text }}</button>
              <a class="oc-btn oc-btn--line" [routerLink]="editorLink()">{{ draft.rehearsalBackToEditor.text }}</a>
            } @else if (status() === 'REPLACED') {
              <!-- Ya existe un intento más nuevo: «reintentar» (forceNew) también lo reemplazaría. -->
              <a class="oc-btn oc-btn--go" routerLink="/portal/simulador">Volver al catálogo</a>
            } @else if (status() === 'SAFE_EXITED') {
              <!-- Cierre terminal honesto: la única continuación es un intento nuevo. -->
              <button type="button" class="oc-btn oc-btn--go" (click)="retry.emit()">Iniciar un nuevo intento</button>
              <a class="oc-btn oc-btn--line" routerLink="/portal/simulador">Volver al catálogo</a>
            } @else {
              @if (cierreLink(); as cierre) {
                <!-- Etapa 1 del cierre (DISENO §4.5): el análisis largo vive en la página del portal. La transición de salida
                     (el mundo se funde y llega la página) la decide el router por la ruta; el estado lleva el título al encabezado. -->
                <a class="oc-btn oc-btn--go" [routerLink]="cierre" [state]="{ umbral: { titulo: report()?.caseTitle ?? '' } }">Ver tu recorrido</a>
                <button type="button" class="oc-btn oc-btn--line" (click)="retry.emit()">Reintentar caso</button>
              } @else {
                <button type="button" class="oc-btn oc-btn--go" (click)="retry.emit()">Reintentar caso</button>
              }
              <a class="oc-btn oc-btn--line" routerLink="/portal/simulador">Volver al simulador</a>
            }
            @if (mode() !== 'rehearsal') {
              <a class="oc-btn oc-btn--line" routerLink="/portal/dashboard">Volver al portal</a>
            }
          </footer>
        }

        <ng-template #board>
        <!-- Aviso de alcance (RN-01, borrador de Psicología): fuera de los textos validados del resultado. -->
        <ui-scope-notice />
        @if (report(); as r) {
          <!-- Orden del cierre: final, autoevaluación breve, hitos, competencias, revisión decisión por decisión. -->
          @if (r.ending; as ending) {
            <!-- Sin tono semáforo (R-18, §3.2 M7): el final es del mismo color para todos; ending.tone queda para el docente. -->
            <div class="oc-ending" role="status">
              <p class="oc-ending__title">{{ ending.title }}</p>
              <p class="oc-ending__message">{{ ending.message }}</p>
              @if (r.persona; as persona) {
                <!-- Si el final depende de la persona, «Cómo llegaste aquí» ya la nombra: no se repite encima (V4). -->
                @if (!personaInReasons(ending.reason, persona.label)) {
                  <p class="oc-ending__persona">{{ draft.endingPersonaPrefix.text }} {{ persona.label }}.</p>
                }
              }
              @if (ending.reason && ending.reason.length) {
                <p class="oc-ending__how">{{ draft.endingReasonTitle.text }}</p>
                <ul class="oc-ending__reasons">
                  @for (reason of ending.reason; track $index) { <li>{{ reason }}</li> }
                </ul>
              }
            </div>
          }

          @if (status() === 'COMPLETED' && mode() !== 'rehearsal') {
            <!-- Autoevaluación breve (R-6): va ANTES de la revisión; vive solo aquí, no se envía ni se guarda. -->
            <section class="oc-block oc-selfcheck" aria-labelledby="oc-selfcheck-title">
              <p class="oc-label" id="oc-selfcheck-title">{{ draft.selfAssessTitle.text }}</p>
              @if (selfCheckOpen()) {
                <div class="oc-field">
                  <label for="oc-self-good">{{ draft.selfAssessGood.text }}</label>
                  <textarea #selfFirst id="oc-self-good" rows="2" maxlength="600" [value]="selfGood()" (input)="selfGood.set(valueOf($event))"></textarea>
                </div>
                <div class="oc-field">
                  <label for="oc-self-change">{{ draft.selfAssessChange.text }}</label>
                  <textarea id="oc-self-change" rows="2" maxlength="600" [value]="selfChange()" (input)="selfChange.set(valueOf($event))"></textarea>
                </div>
                <p class="oc-selfcheck__note">{{ draft.selfAssessLocalNote.text }}</p>
                <div class="oc-selfcheck__actions">
                  <button type="button" class="oc-btn oc-btn--go" (click)="collapseSelfCheck()">{{ draft.selfAssessDone.text }}</button>
                  <button type="button" class="oc-btn oc-btn--line" (click)="collapseSelfCheck()">{{ draft.selfAssessSkip.text }}</button>
                </div>
              } @else {
                <p class="oc-selfcheck__note">{{ draft.selfAssessCollapsed.text }}</p>
                <button #selfEdit type="button" class="oc-btn oc-btn--line" (click)="reopenSelfCheck()">{{ draft.selfAssessEdit.text }}</button>
              }
            </section>
          }

          @if (r.milestones; as milestones) {
            <div class="oc-milestones">
              <section class="oc-block oc-milestones__col oc-milestones__col--done" aria-labelledby="oc-milestones-done-title">
                <p class="oc-label" id="oc-milestones-done-title">{{ draft.milestonesDoneTitle.text }}</p>
                @if (milestones.done.length) {
                  <ul class="oc-milestones__list">
                    @for (milestone of milestones.done; track milestone.key) {
                      <li>{{ milestone.label }} @if (markOf(milestone); as mark) { <span class="oc-tag oc-tag--key">{{ mark }}</span> }</li>
                    }
                  </ul>
                } @else {
                  <p class="oc-muted">{{ draft.milestonesNoneDone.text }}</p>
                }
              </section>
              <section class="oc-block oc-milestones__col oc-milestones__col--missing" aria-labelledby="oc-milestones-missing-title">
                <p class="oc-label" id="oc-milestones-missing-title">{{ draft.milestonesMissingTitle.text }}</p>
                @if (milestones.missing.length) {
                  <ul class="oc-milestones__list">
                    @for (milestone of milestones.missing; track milestone.key) {
                      <li>{{ milestone.label }} @if (markOf(milestone); as mark) { <span class="oc-tag oc-tag--key">{{ mark }}</span> }</li>
                    }
                  </ul>
                } @else {
                  <p class="oc-muted">{{ draft.milestonesNoneMissing.text }}</p>
                }
              </section>
            </div>
          }

          <!-- «Frente a tu intento anterior»: el reporte aún no trae datos del intento previo; el bloque entra cuando los traiga. -->

          <!-- V5: si el caso no declara competencias, no se muestra: serían «Sin evidencia» en todas, hiciera lo que hiciera. -->
          @if (r.competencyLevels && r.competencyLevels.length && r.competenciesDeclared !== false) {
            <section class="oc-block oc-competencies" aria-labelledby="oc-competencies-title">
              <p class="oc-label" id="oc-competencies-title">{{ draft.competenciesTitle.text }}</p>
              <ul class="oc-competencies__list">
                @for (competency of r.competencyLevels; track competency.code) {
                  <li class="oc-competency" [attr.data-level]="competency.level ?? 'NONE'">
                    <p class="oc-competency__head">
                      <span class="oc-competency__name">{{ competency.name }}</span>
                      <span class="oc-competency__level">{{ levelWord(competency.level) }}</span>
                    </p>
                    @if (competency.evidence.length) {
                      <p class="oc-competency__lead">{{ draft.competencyEvidenceLead.text }}</p>
                      <ul class="oc-competency__evidence">
                        @for (item of competency.evidence; track item.order) {
                          <li><span class="oc-competency__node">{{ item.nodeTitle }}:</span> {{ item.optionText }}</li>
                        }
                      </ul>
                    }
                  </li>
                }
              </ul>
            </section>
          }

          @if (status() === 'COMPLETED') {
            <!-- Tus decisiones (C2, RN-08): la explicación y el fundamento se leen al cierre, no al decidir. -->
            <section class="oc-block oc-decisions" aria-labelledby="oc-decisions-title">
              <p class="oc-label" id="oc-decisions-title">{{ draft.decisionsTitle.text }}</p>
              @switch (decisionsState()) {
                @case ('loading') {
                  <div aria-busy="true"><ui-skeleton shape="card" [lines]="3" /></div>
                }
                @case ('error') {
                  <ui-error-state [kind]="errorKind()" [status]="errorStatus()" [message]="draft.decisionsError.text" (retry)="reloadDecisions()" />
                }
                @case ('empty') {
                  <ui-empty-state kind="no-results" [title]="draft.decisionsEmpty.text" [description]="draft.decisionsEmptyHint.text" />
                }
                @case ('ready') {
                  <ol class="oc-decisions__list">
                    @for (item of decisions(); track item.order) {
                      <li class="oc-decision" [attr.data-tone]="item.class">
                        <p class="oc-decision__node">{{ item.nodeTitle }}</p>
                        <p class="oc-decision__chosen"><span class="oc-decision__k">Elegiste:</span> {{ item.chosen.label || item.chosen.text }}</p>
                        @if (item.reconsidered; as first) {
                          <p class="oc-decision__first">{{ reconsideredLabel }}: {{ first.firstOptionText }}</p>
                        }
                        @if (item.consequence) {
                          <p class="oc-decision__consequence">{{ item.consequence }}</p>
                        }
                        @if (classWord(item.class); as word) {
                          <p class="oc-decision__tone">{{ word }}</p>
                        }
                        @if (item.prohibited) {
                          <p class="oc-chip oc-chip--alert oc-decision__note">{{ draft.decisionProhibitedNote.text }}</p>
                        }
                        @if (item.feedback.explanation) {
                          <p class="oc-decision__explanation">{{ item.feedback.explanation }}</p>
                        } @else {
                          <p class="oc-decision__empty">{{ draft.decisionNoExplanation.text }}</p>
                        }
                        @if (item.feedback.theoryBasis) {
                          <p class="oc-decision__basis"><span class="oc-decision__k">{{ draft.decisionBasisLabel.text }}:</span> {{ item.feedback.theoryBasis }}</p>
                        }
                        <!-- Las respuestas que no vio abiertas en esa escena y lo que le faltó explorar (DSL-6): solo al cierre. -->
                        @if (item.missed?.length) {
                          <div class="oc-missed">
                            <p class="oc-missed__title">{{ draft.missedTitle.text }}</p>
                            <p class="oc-missed__lead">{{ draft.missedLead.text }}</p>
                            <ul class="oc-missed__list">
                              @for (option of item.missed; track option.optionId) {
                                <li>
                                  <span class="oc-missed__text">{{ option.text }}</span>
                                  @if (classWord(option.class); as word) {
                                    <span class="oc-missed__class">{{ word }}</span>
                                  }
                                  <span class="oc-missed__needed">{{ missedNeededText(option) }}</span>
                                </li>
                              }
                            </ul>
                          </div>
                        }
                      </li>
                    }
                  </ol>
                }
              }
            </section>
          }

          @if (r.safeExitUsed || reconsidered(r)) {
            <div class="oc-chips">
              @if (r.safeExitUsed) { <span class="oc-chip">Salida segura</span> }
              <!-- No son decisiones: el juego no aplicó esa primera respuesta y se le pidió reconsiderar (L-03). -->
              @if (reconsidered(r); as chip) { <span class="oc-chip">{{ chip }}</span> }
            </div>
          }

          @if (r.timeline?.length) {
            <div class="oc-block">
              <p class="oc-label">Línea de tiempo de decisiones clave</p>
              <ol class="oc-timeline">
                @for (t of r.timeline; track $index) {
                  <li class="oc-tl" [attr.data-tl]="timelineTone(t)">
                    <span class="oc-tl__time">{{ t.time }}</span>
                    <span class="oc-tl__label">{{ t.label }}</span>
                  </li>
                }
              </ol>
            </div>
          }

          @if (r.recommendations.length) {
            <div class="oc-block oc-feedback">
              <p class="oc-label">Retroalimentación del sistema</p>
              @for (rec of r.recommendations; track rec) { <p class="oc-rec">{{ rec }}</p> }
            </div>
          }
        }

        </ng-template>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .outcome {
      position: absolute; inset: 0; z-index: 150; display: flex; flex-direction: column;
      gap: 16px; align-items: stretch; justify-content: flex-start;
      padding: clamp(20px, 4vh, 44px) clamp(20px, 6vw, 80px); overflow-y: auto;
    }
    .outcome:not(.outcome--pause) {
      background: linear-gradient(180deg, rgba(17,24,39,.96), rgba(14,19,34,.97)); color: var(--sim-ink, #F4F7FB);
    }
    .oc-head { display: flex; align-items: center; gap: 16px; }
    .oc-avatar {
      width: 96px; height: 96px; flex: 0 0 auto; border-radius: 16px; overflow: hidden;
      background: rgba(124,77,255,.14); border: 1px solid rgba(182,156,255,.4);
      display: grid; place-items: center;
    }
    .oc-eyebrow { margin: 0; color: var(--sim-lavender, #B69CFF); font-size: .8rem; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
    .outcome--safe .oc-eyebrow { color: rgba(244,247,251,.7); }
    .oc-head__copy h3 { margin: 4px 0 0; font-family: 'Poppins', system-ui, sans-serif; font-size: clamp(1.1rem, 2vw, 1.5rem); color: var(--sim-ink, #F4F7FB); }
    .oc-block {
      padding: 14px 16px; border-radius: 16px;
      background: var(--sim-surface, rgba(27,33,51,.72)); border: 1px solid var(--sim-border, rgba(182,156,255,.22));
    }
    .oc-ending {
      padding: 16px 18px; border-radius: 16px;
      background: rgba(124,77,255,.12); border: 1px solid rgba(182,156,255,.4);
    }
    .oc-ending__title { margin: 0; font-weight: 900; letter-spacing: .04em; font-size: .95rem; color: var(--sim-ink, #F4F7FB); }
    .oc-ending__message { margin: 8px 0 0; color: var(--sim-ink-soft, rgba(244,247,251,.74)); line-height: 1.55; }
    .oc-ending__persona { margin: 8px 0 0; color: var(--sim-ink-soft, rgba(244,247,251,.74)); font-style: italic; }
    .oc-ending__how { margin: 14px 0 6px; color: var(--sim-lavender, #B69CFF); font-size: .8rem; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
    .oc-ending__reasons, .oc-milestones__list, .oc-competency__evidence {
      margin: 0; padding-left: 18px; display: grid; gap: 6px; line-height: 1.5; color: var(--sim-ink-soft, rgba(244,247,251,.74));
    }
    .oc-muted { margin: 0; color: var(--sim-ink-mute, rgba(244,247,251,.5)); font-size: .86rem; }
    .oc-tag--key { margin-left: 6px; padding: 2px 9px; }
    .oc-milestones { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .oc-milestones__col--missing { border-style: dashed; }
    .oc-competencies__list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .oc-competency { padding: 10px 12px; border-radius: 12px; border-left: 3px solid rgba(182,156,255,.4); background: rgba(255,255,255,.04); }
    .oc-competency[data-level='NONE'] { border-left-color: rgba(244,247,251,.25); }
    .oc-competency p { margin: 0; }
    .oc-competency__head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-weight: 800; }
    .oc-competency__level { color: var(--sim-lavender, #B69CFF); }
    .oc-competency p.oc-competency__lead { margin-top: 8px; font-size: .8rem; color: var(--sim-ink-mute, rgba(244,247,251,.5)); }
    .oc-competency__evidence { margin-top: 4px; font-size: .86rem; }
    .oc-competency__node { font-weight: 700; }
    /* Autoevaluación breve: dos cajas de texto locales (no se envían ni se guardan). */
    .oc-field { display: grid; gap: 6px; margin-bottom: 12px; }
    .oc-field label { font-weight: 800; font-size: .9rem; }
    .oc-field textarea {
      width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 12px; resize: vertical; font: inherit; line-height: 1.5;
      color: var(--sim-ink, #F4F7FB); background: var(--sim-surface-2, rgba(18,24,42,.6)); border: 1px solid var(--sim-border, rgba(182,156,255,.22));
    }
    .oc-field textarea:focus-visible { outline: 3px solid #C9B3FF; outline-offset: 2px; }
    .oc-selfcheck__note { margin: 0 0 10px; font-size: .84rem; color: var(--sim-ink-mute, rgba(244,247,251,.5)); }
    .oc-selfcheck__actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .oc-label { margin: 0 0 10px; color: var(--sim-lavender, #B69CFF); font-size: .75rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .oc-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
    .oc-chip, .oc-tag {
      padding: 5px 11px; border-radius: 999px; font-size: .76rem; font-weight: 700;
      background: rgba(124,77,255,.16); border: 1px solid rgba(124,77,255,.4); color: #d6c6ff;
    }
    .oc-chip { background: var(--sim-surface-2, rgba(18,24,42,.6)); border-color: var(--sim-border, rgba(182,156,255,.22)); color: var(--sim-ink-soft, rgba(244,247,251,.74)); }
    .oc-chip--alert { background: rgba(226,90,79,.16); border-color: rgba(226,90,79,.45); color: #f1a79f; }
    .oc-chip--ok { border-color: rgba(110,198,122,.5); color: #a9e2b1; }
    .oc-chips--state { margin-top: 0; }
    .oc-timeline { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    /* R-19 (§3.2 M7): sin tono semáforo al cierre; la clase se lee en palabras, no en color. */
    .oc-tl {
      display: grid; grid-template-columns: 52px 1fr; gap: 10px; align-items: baseline;
      padding: 8px 10px; border-radius: 10px; border-left: 3px solid rgba(182,156,255,.4);
      background: rgba(255,255,255,.04); font-size: .82rem;
    }
    .oc-tl__time { font-family: 'JetBrains Mono', monospace; color: var(--sim-lavender, #B69CFF); }
    .oc-tl__label { color: var(--sim-ink-soft, rgba(244,247,251,.74)); line-height: 1.4; }
    .oc-rec { margin: 0 0 6px; color: var(--sim-ink-soft, rgba(244,247,251,.74)); font-size: .86rem; line-height: 1.55; }
    /* Tus decisiones (C2, RN-08): la explicación y el fundamento se leen al cierre; etiquetas formativas, en palabras.
       Sin colores nuevos: el tono del borde comparte la regla de la línea de tiempo y el texto secundario va con opacidad. */
    .oc-decisions__list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .oc-decision {
      display: grid; gap: 6px; padding: 12px 14px; border-radius: 12px; line-height: 1.5;
      border-left: 3px solid transparent;
    }
    .oc-decision p { margin: 0; }
    .oc-decision__node { font-weight: 800; }
    .oc-decision__chosen, .oc-decision__consequence, .oc-decision__explanation, .oc-decision__basis, .oc-decision__first { opacity: .86; }
    .oc-decision__k { opacity: .6; font-weight: 700; }
    .oc-decision__tone {
      font-size: var(--ds-type-caption-size); font-weight: 900; letter-spacing: .04em; text-transform: uppercase; opacity: .9;
    }
    .oc-decision__note { display: block; border-radius: 12px; }
    .oc-missed { margin-top: 6px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,.16); display: grid; gap: 4px; }
    .oc-missed__title { font-weight: 800; }
    .oc-missed__lead { opacity: .7; }
    .oc-missed__list { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
    .oc-missed__class { margin-left: 8px; opacity: .6; font-size: .86em; }
    .oc-missed__needed { display: block; opacity: .86; }
    .oc-decision__empty { font-style: italic; opacity: .6; }
    .oc-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; margin-top: auto; padding-top: 6px; }
    .oc-btn {
      display: inline-flex; align-items: center; justify-content: center; min-height: 44px; cursor: pointer; text-decoration: none;
    }
    /* Aspecto del cierre. La pausa no lo lleva: sus acciones son las piezas de pixel u-boton y u-ficha de la hoja común (U1). */
    .outcome:not(.outcome--pause) .oc-btn {
      padding: 8px 20px; border-radius: 12px; font-weight: 900;
      border: 1px solid var(--sim-border, rgba(182,156,255,.22)); background: var(--sim-surface-2, rgba(18,24,42,.6)); color: var(--sim-ink, #F4F7FB);
    }
    .outcome:not(.outcome--pause) .oc-btn--line { background: transparent; color: var(--sim-ink-soft, rgba(244,247,251,.74)); }
    .outcome:not(.outcome--pause) .oc-btn--go { background: linear-gradient(90deg, var(--sim-purple, #7C4DFF), #6336e0); border-color: transparent; color: #fff; }
    /* Hover solo con puntero fino (un híbrido táctil no queda pegado) y estilo de pulsado en todas las acciones. */
    @media (hover: hover) and (pointer: fine) {
      .outcome:not(.outcome--pause) .oc-btn:hover { border-color: rgba(182,156,255,.55); background: rgba(124,77,255,.18); }
      .outcome:not(.outcome--pause) .oc-btn--go:hover { filter: brightness(1.08); }
    }
    .outcome:not(.outcome--pause) .oc-btn:active { transform: translateY(1px); }
    .outcome:not(.outcome--pause) .oc-btn:focus-visible, .outcome:not(.outcome--pause) .oc-details summary:focus-visible { outline: 3px solid #C9B3FF; outline-offset: 3px; }

    /* Pausa calmada: acciones arriba, sin tablero en primer plano. */
    .oc-pause-note { margin: 0; max-width: 60ch; font-size: var(--ds-type-body-s-size); line-height: 1.5; color: var(--sim-ink-soft, rgba(244,247,251,.74)); }
    .oc-pause-copy { margin: 0; max-width: 60ch; font-size: 1rem; line-height: 1.6; color: var(--sim-ink-soft, rgba(244,247,251,.74)); }
    .oc-actions--pause { justify-content: flex-start; margin-top: 0; padding-top: 0; }
    .oc-support__list { margin: 0; padding-left: 18px; display: grid; gap: 6px; color: var(--sim-ink-soft, rgba(244,247,251,.74)); font-size: .86rem; line-height: 1.5; }
    .oc-details { border: 1px solid var(--sim-border, rgba(182,156,255,.22)); border-radius: 14px; padding: 4px 14px 14px; }
    .oc-details summary {
      display: flex; align-items: center; min-height: 44px; cursor: pointer; font-weight: 800;
      color: var(--sim-ink-soft, rgba(244,247,251,.74));
    }
    .oc-details > :not(summary) { margin-top: 12px; }

    /* Pausa en el lenguaje de pixel del cuadro de diálogo (bloque U1): una placa centrada sobre el velo, sin vidrio ni
       desenfoque. El velo es una sombra enorme de la propia placa; la recorta el área de juego. */
    .outcome--pause {
      inset: auto; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(720px, calc(100% - 2 * var(--pixel-borde))); max-height: calc(100% - 2 * var(--pixel-borde));
      box-sizing: border-box; gap: calc(5 * var(--pixel-px));
      padding: calc(7 * var(--pixel-px)) calc(9 * var(--pixel-px)) calc(8 * var(--pixel-px));
      box-shadow: 0 0 0 100vmax var(--pixel-velo);
      font-family: var(--pixel-f-texto);
      /* La placa no es contenedor desplazable (V6): su sombra de pixel (u-sombra, 4 px al lado y 12 px abajo) la hacía
         desbordar y salían dos barras propias, con la sombra recortada. */
      overflow: visible;
    }
    .outcome--pause .oc-avatar {
      border: calc(2 * var(--pixel-px)) solid var(--pixel-contorno); border-radius: 0;
      background: var(--pixel-ventanilla); image-rendering: pixelated;
    }
    .outcome--pause .oc-eyebrow {
      font-family: var(--pixel-f-nombre); font-weight: 700; font-size: max(var(--pixel-letra-minima), calc(var(--pixel-tam) * 0.82));
      letter-spacing: .06em; color: var(--luz);
    }
    .outcome--pause .oc-head__copy h3 { font-family: var(--pixel-f-texto); font-weight: 700; color: var(--pixel-tinta); }
    .outcome--pause .oc-pause-copy { color: var(--pixel-tinta); }
    .outcome--pause .oc-actions--pause { align-items: center; gap: calc(4 * var(--pixel-px)); }
    .outcome--pause .oc-btn, .outcome--pause .u-ficha { padding: 0 calc(8 * var(--pixel-px)) 1px; }
    .outcome--pause .oc-support {
      padding: calc(3 * var(--pixel-px)) calc(5 * var(--pixel-px)) calc(4 * var(--pixel-px)); border-radius: 0;
      background: var(--pixel-penumbra-hundida); border: 1px solid var(--pixel-separador);
    }
    .outcome--pause .oc-label {
      margin: 0 0 calc(2 * var(--pixel-px)); font-family: var(--pixel-f-nombre); font-size: var(--pixel-letra-chica);
      letter-spacing: .06em; color: var(--luz);
    }
    .outcome--pause .oc-support__list { color: var(--pixel-tinta); }
    .outcome--pause .oc-details { padding: 0; border: 0; border-radius: 0; }
    .outcome--pause .oc-details summary.u-boton { justify-content: space-between; list-style: none; color: var(--pixel-tinta); font-weight: 600; }
    .outcome--pause .oc-details summary.u-boton::-webkit-details-marker { display: none; }
    .outcome--pause .oc-details[open] .oc-details__flecha { transform: scaleY(-1); }
    .outcome--pause .oc-details > :not(summary) { margin-top: calc(4 * var(--pixel-px)); }

    /* Columna útil a 360 px (F6-6): hitos en una columna, línea de tiempo que no desborda, acciones a todo el ancho.
       Sin desplazamiento horizontal ni con el zoom del navegador al 200 %. */
    @media (max-width: 480px) {
      .outcome:not(.outcome--pause) { padding: 16px 14px; gap: 12px; }
      .outcome--pause { padding: calc(5 * var(--pixel-px)) calc(5 * var(--pixel-px)) calc(6 * var(--pixel-px)); gap: calc(4 * var(--pixel-px)); }
      .oc-head { gap: 12px; }
      .oc-milestones { grid-template-columns: minmax(0, 1fr); }
      .oc-tl { grid-template-columns: 44px minmax(0, 1fr); }
      .oc-actions { flex-direction: column; align-items: stretch; }
      .oc-btn, .outcome--pause .u-ficha { width: 100%; }
    }
  `]
})
export class AttemptOutcomeComponent {
  private readonly avatarStore = inject(AvatarStore);
  private readonly kit = inject(KitService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  /** Retrato neutral del jugador (spec §8.2: ×3, 96 px). */
  readonly playerVisual = computed(() => {
    const bundle = this.kit.bundle();
    return bundle ? resolveCharacter(bundle, { kind: 'jugador', avatar: toAvatarV2(this.avatarStore.avatar()) }) : null;
  });

  /** Dónde estaba el foco antes de abrirse el resultado o la pausa: a ese sitio vuelve al cerrarse (H-05, 2.4.3). */
  private returnFocusTo: HTMLElement | null = null;
  private opened = false;

  constructor() {
    this.kit.load().catch(() => undefined);
    // El resultado es un diálogo modal (H-05). En pausa el foco va a «Reanudar este intento» (lo primero es poder
    // volver); en los demás cierres, al título. Al volver el intento a «en curso» el foco regresa a donde estaba, o a
    // un elemento visible del juego: nunca queda en <body>.
    effect(() => {
      const status = this.status();
      untracked(() => {
        if (status === 'IN_PROGRESS') {
          this.restoreFocus();
          return;
        }
        this.rememberFocus();
        afterNextRender(() => this.focusEntry(status), { injector: this.injector });
      });
    });
  }

  private rememberFocus(): void {
    if (this.opened) return; // un cambio de estado con el resultado ya abierto no cambia a dónde se vuelve
    this.opened = true;
    const active = document.activeElement;
    this.returnFocusTo = active instanceof HTMLElement && active !== document.body
      && !this.host.nativeElement.contains(active) ? active : null;
  }

  private focusEntry(status: SimulationAttemptState['status']): void {
    const root = this.host.nativeElement;
    const target = status === 'PAUSED'
      ? root.querySelector<HTMLElement>('[cdkFocusInitial]')
      : root.querySelector<HTMLElement>('#outcome-title');
    target?.focus({ preventScroll: true });
  }

  private restoreFocus(): void {
    if (!this.opened) return;
    this.opened = false;
    const back = this.returnFocusTo;
    this.returnFocusTo = null;
    afterNextRender(() => {
      // Si otra capa ya tomó el foco (p. ej. la introducción que reaparece tras reanudar, con su propia trampa), no se
      // le roba: solo se restaura cuando el foco se perdió con el resultado.
      const active = document.activeElement;
      if (active && active !== document.body && !this.host.nativeElement.contains(active)) return;
      const usable = back && back.isConnected && !back.closest('[aria-hidden="true"], [inert], [hidden]') ? back : null;
      // El mundo no es enfocable (es un contenedor): se prueba cada candidato hasta que uno recibe el foco de verdad
      // y se termina en el contenedor del juego (#main-content, tabindex -1), nunca en <body>.
      for (const candidate of [usable, document.getElementById('game-area'), document.getElementById('main-content')]) {
        if (!candidate) continue;
        candidate.focus({ preventScroll: true });
        if (document.activeElement === candidate) break;
      }
    }, { injector: this.injector });
  }

  readonly report = input<AttemptCompletionReport | null>(null);
  readonly status = input.required<SimulationAttemptState['status']>();
  readonly retry = output<void>();
  /** `rehearsal`: la docente ensaya su borrador; no hay informe del estudiante ni autoevaluación y las salidas llevan al editor. */
  readonly mode = input<'student' | 'rehearsal'>('student');
  /** El caso que se ensaya, para el enlace «Volver al editor». */
  readonly caseVersionId = input<number | null>(null);
  protected readonly editorLink = computed(() => {
    const id = this.caseVersionId();
    return id === null ? '/portal/casos' : `/portal/casos/${id}/editor`;
  });
  /** Pausa reanudable (ETH-02 A): reanuda el MISMO intento, no crea uno nuevo. */
  readonly resume = output<void>();
  /** Recursos de apoyo que se muestran en la pausa (opcional; los aporta quien conoce el caso). */
  readonly supportResources = input<string[]>([]);
  /** Pausa local aún sin registrar en el servidor (sin conexión): la línea discreta que lo dice; `null` cuando ya quedó registrada. */
  readonly pauseNote = input<string | null>(null);
  /**
   * Intento cuyo reporte del dueño trae «Tus decisiones» (C2). Lo pasa quien llama solo al completar: sin id no hay
   * petición. Con el id, `decisionReview` sale del reporte congelado, no de la respuesta de la última decisión.
   */
  readonly reviewAttemptId = input<string | null>(null);
  /** La página de cierre de este intento (solo al completar un caso del estudiante); nulo si falta alguno de los dos ids. */
  protected readonly cierreLink = computed<string[] | null>(() => {
    const intento = this.reviewAttemptId();
    const caso = this.caseVersionId();
    return intento && caso !== null ? ['/portal/simulador', String(caso), 'cierre', intento] : null;
  });
  /**
   * Autoevaluación breve (R-6): abierta hasta que la persona pulsa «Listo» u «Omitir»; después se recoge.
   * Solo vive en este componente: no se envía al servidor ni se guarda (se pierde al cerrar la pantalla).
   */
  protected readonly selfCheckOpen = signal(true);
  protected readonly selfGood = signal('');
  protected readonly selfChange = signal('');
  private readonly selfEdit = viewChild<ElementRef<HTMLButtonElement>>('selfEdit');
  private readonly selfFirst = viewChild<ElementRef<HTMLTextAreaElement>>('selfFirst');

  /** Recoge la autoevaluación y deja el foco en «Editar mis notas»: el botón pulsado desaparece y el foco no puede caer a <body> (2.4.3). */
  protected collapseSelfCheck(): void {
    this.selfCheckOpen.set(false);
    afterNextRender(() => this.selfEdit()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  /** Reabre la autoevaluación y lleva el foco a su primera caja de texto. */
  protected reopenSelfCheck(): void {
    this.selfCheckOpen.set(true);
    afterNextRender(() => this.selfFirst()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  protected readonly draft = DRAFT_COPY;
  protected readonly reconsideredLabel = RECONSIDERED_LABEL;
  private readonly simulation = inject(SimulationService);
  /**
   * Respaldo: solo se pide el reporte del dueño si la respuesta que cerró el intento no trajo sus decisiones. Con la
   * ruta normal `decisionReview` ya viaja en el reporte congelado de esa respuesta (una petición menos al cerrar).
   */
  private readonly decisionsResource = rxResource<AttemptCompletionReport, string | undefined>({
    params: () => (this.mode() !== 'rehearsal' && this.report()?.decisionReview === undefined ? this.reviewAttemptId() ?? undefined : undefined),
    stream: ({ params }) => (params === undefined ? EMPTY : this.simulation.studentReport(params)),
  });
  protected readonly decisions = computed<DecisionReviewItem[]>(() => {
    const own = this.report()?.decisionReview;
    if (own) return own;
    return this.decisionsResource.hasValue() ? (this.decisionsResource.value()?.decisionReview ?? []) : [];
  });
  /** Carga, error, vacío y listo de «Tus decisiones» con el contrato de estados de datos (§2.5). */
  protected readonly decisionsState = uiDataState({
    loading: computed(() => this.decisionsResource.isLoading()),
    error: computed(() => this.decisionsResource.error()),
    isEmpty: computed(() => this.decisions().length === 0),
  });
  protected readonly errorStatus = computed<number | null>(() =>
    (this.decisionsResource.error() as { status?: number } | undefined)?.status ?? null);
  protected readonly errorKind = computed(() => errorKindFromStatus(this.errorStatus()));

  reloadDecisions(): void {
    this.decisionsResource.reload();
  }

  /** La clase de una decisión al cierre, en palabras (RN-08): nunca una cifra. */
  protected readonly classWord = responseClassWord;
  /** «Te faltó: …» con lo que había que explorar, o el texto de respaldo si la opción dependía del rumbo del caso. */
  protected missedNeededText(option: MissedOption): string {
    return option.missing.length
      ? `${DRAFT_COPY.missedNeeded.text} ${missedFactsText(option.missing)}`
      : DRAFT_COPY.missedNoFacts.text;
  }
  protected readonly levelWord = levelWord;
  protected readonly markOf = milestoneMark;

  protected valueOf(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  /** Texto tranquilizador de la pausa: sin penalización y sin cifras en primer plano. */
  readonly pauseMessage = 'Tu avance quedó guardado exactamente donde estabas. No hay penalización: puedes retomarlo cuando quieras.';

  /** Título de la pantalla. La pausa siempre dice «pausa» (el e2e la localiza por su nombre accesible). */
  title(): string {
    if (this.status() === 'PAUSED') return 'Tu caso está en pausa';
    return this.report()?.summaryMessage ?? this.headline();
  }

  /** ¿Alguna razón del final ya dice la persona («La persona usuaria …»)? Entonces su línea aparte sobra. */
  personaInReasons(reasons: readonly string[] | null | undefined, label: string): boolean {
    const sentence = `${this.draft.endingPersonaPrefix.text} ${label}`.trim().replace(/\.$/, '');
    return (reasons ?? []).some(reason => reason.trim().replace(/\.$/, '') === sentence);
  }

  /** Encabezado corto por estado — lenguaje honesto, sin fingir pausa en cierres. */
  eyebrow(status: SimulationAttemptState['status'] = this.status()): string {
    switch (status) {
      case 'COMPLETED': return '¡Simulación completada!';
      case 'PAUSED': return 'Pausa segura activa';
      case 'REPLACED': return 'Intento reemplazado';
      default: return 'Salida segura registrada';
    }
  }

  /** Titular de respaldo cuando el backend no envía summaryMessage. */
  headline(status: SimulationAttemptState['status'] = this.status()): string {
    switch (status) {
      case 'COMPLETED': return 'El intento quedó cerrado para evaluación docente.';
      case 'PAUSED': return this.pauseMessage;
      case 'REPLACED': return 'Empezaste un intento nuevo; este quedó cerrado tal como estaba.';
      default: return 'El intento quedó cerrado sin penalización.';
    }
  }

  /** Chip «Reconsideradas: N» (solo con reintentos): lo único que el cierre no puede callar de ellos. */
  reconsidered(r: AttemptCompletionReport): string | null {
    return reconsideredChip(r.retries);
  }

  /** Tono visual de una entrada del timeline: prohibida pisa la clase. */
  timelineTone(t: AttemptTimelineEntry): string {
    return t.prohibited ? 'PROHIBITED' : (t.class ?? 'EVENT');
  }
}
