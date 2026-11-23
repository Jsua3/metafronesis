import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, signal } from '@angular/core';

import { CaseContentReview } from '../../core/models/simulation.model';
import { uniqueUiId } from '../../shared/ui/button/click-guard';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialogActions, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';

export type CaseReviewReason = 'FORMA' | 'CONTENIDO';

export interface CaseReviewDecisionData {
  mode: 'approve' | 'reject';
  /** El servidor ya dijo que exige la constancia de revisión de contenido (`CONTENT_REVIEW_REQUIRED`). */
  contentReviewRequired: boolean;
  /** Lo escrito en un intento que el servidor rechazó: se reabre con ello en vez de pedir que se vuelva a escribir. */
  draft?: CaseReviewDecision;
}

/** Lo que la persona decidió, sin claves vacías: el servidor solo recibe lo que se escribió. */
export interface CaseReviewDecision {
  note?: string;
  reason?: CaseReviewReason;
  contentReview?: CaseContentReview;
}

type DecisionField = 'reason' | 'note' | 'reviewer' | 'reviewedOn' | 'reference';

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * La decisión de una revisión (plan visual F10-6†; RF-13, CU-05; contrato C4). Aprobar lleva una nota opcional y, si el
 * servidor la exige, la constancia de revisión de contenido de Psicología (revisor, fecha y referencia: todo o nada);
 * devolver a borrador exige un motivo (forma o contenido) y una nota para quien autora el caso. Cerrar sin decidir
 * (Cancelar, Esc) no devuelve nada y no cambia el caso. Un campo incompleto dice qué falta en su sitio y recibe el foco.
 */
@Component({
  selector: 'app-case-review-decision-dialog',
  imports: [UiButton, UiControl, UiDialogActions, UiDialogFrame, UiField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame [title]="title" [description]="description">
      <form class="rd-form" novalidate [id]="formId" (submit)="submit($event)">
        @if (data.mode === 'reject') {
          <ui-field label="Motivo" required hint="Forma: redacción, ortografía o formato. Contenido: lo clínico o lo pedagógico."
            [error]="errors().reason">
            <select uiControl [value]="reason()" (change)="reason.set(read($event))">
              <option value="">Elige un motivo</option>
              <option value="FORMA">Forma</option>
              <option value="CONTENIDO">Contenido</option>
            </select>
          </ui-field>
        }
        <ui-field [label]="data.mode === 'reject' ? 'Nota para quien autora el caso' : 'Nota (opcional)'"
          [required]="data.mode === 'reject'" [error]="errors().note">
          <textarea uiControl rows="4" maxlength="4000" [value]="note()" (input)="note.set(read($event))"></textarea>
        </ui-field>
        @if (data.mode === 'approve') {
          <fieldset class="rd-proof">
            <legend class="rd-proof__title">Constancia de revisión de contenido</legend>
            <p class="rd-proof__help">
              {{ data.contentReviewRequired
                ? 'Es obligatoria para publicar este caso: escribe quién revisó, cuándo y en qué documento quedó.'
                : 'Si Psicología ya revisó el contenido, déjalo anotado: revisor, fecha y referencia o acta.' }}
            </p>
            <ui-field label="Quién revisó" [required]="data.contentReviewRequired" [error]="errors().reviewer">
              <input uiControl type="text" autocomplete="off" maxlength="255" [value]="reviewer()" (input)="reviewer.set(read($event))" />
            </ui-field>
            <ui-field label="Fecha de la revisión" [required]="data.contentReviewRequired" [error]="errors().reviewedOn">
              <input uiControl type="date" [max]="maxDate" [value]="reviewedOn()" (input)="reviewedOn.set(read($event))" />
            </ui-field>
            <ui-field label="Referencia o acta" [required]="data.contentReviewRequired" [error]="errors().reference">
              <input uiControl type="text" autocomplete="off" maxlength="255" [value]="reference()" (input)="reference.set(read($event))" />
            </ui-field>
          </fieldset>
        }
      </form>
      <button ui-button uiDialogActions type="button" variant="secondary" (click)="ref.close()">Cancelar</button>
      <button ui-button uiDialogActions type="submit" [attr.form]="formId">{{ confirmLabel }}</button>
    </ui-dialog-frame>
  `,
  styles: [`
    :host { display: block; }
    .rd-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ds-space-4); }
    .rd-proof {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ds-space-3);
      min-width: 0;
      margin: 0;
      padding: var(--ds-space-4);
      border: 1px solid var(--ds-border);
      border-radius: var(--ds-radius-md);
    }
    .rd-proof__title { padding-inline: var(--ds-space-2); font-weight: var(--ds-type-h3-weight); color: var(--ds-text-1); }
    .rd-proof__help { margin: 0; color: var(--ds-text-2); font-size: var(--ds-type-body-s-size); line-height: var(--ds-type-body-s-line); }
  `],
})
export class CaseReviewDecisionDialogComponent {
  protected readonly ref = inject<DialogRef<CaseReviewDecision | undefined>>(DialogRef);
  protected readonly data = inject<CaseReviewDecisionData>(DIALOG_DATA);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly formId = uniqueUiId('rd-form');
  protected readonly maxDate = today();
  protected readonly title = this.data.mode === 'reject' ? 'Devolver el caso a borrador' : 'Aprobar y publicar';
  protected readonly description = this.data.mode === 'reject'
    ? 'Quien autora el caso verá el motivo y tu nota, y podrá corregirlo y volver a enviarlo.'
    : 'Los estudiantes asignados verán esta versión en su catálogo.';
  protected readonly confirmLabel = this.data.mode === 'reject' ? 'Devolver a borrador' : 'Aprobar y publicar';

  protected readonly reason = signal<string>(this.data.draft?.reason ?? '');
  protected readonly note = signal(this.data.draft?.note ?? '');
  protected readonly reviewer = signal(this.data.draft?.contentReview?.reviewer ?? '');
  protected readonly reviewedOn = signal(this.data.draft?.contentReview?.reviewedOn ?? '');
  protected readonly reference = signal(this.data.draft?.contentReview?.reference ?? '');
  protected readonly errors = signal<Partial<Record<DecisionField, string>>>({});

  protected read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.validate();
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) {
      // Tras pintar los errores, el foco va al primer campo inválido (teclado y lector llegan al problema).
      afterNextRender(() => this.host.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), { injector: this.injector });
      return;
    }
    this.ref.close(this.decision());
  }

  private validate(): Partial<Record<DecisionField, string>> {
    const errors: Partial<Record<DecisionField, string>> = {};
    if (this.data.mode === 'reject') {
      if (!this.reason()) errors.reason = 'Elige un motivo.';
      if (!this.note().trim()) errors.note = 'Escribe una nota para quien autora el caso.';
      return errors;
    }
    const reviewer = this.reviewer().trim();
    const reviewedOn = this.reviewedOn();
    const reference = this.reference().trim();
    // La constancia es todo o nada: un dato suelto no dice nada. Si el servidor la exige, los tres.
    if (this.data.contentReviewRequired || reviewer || reviewedOn || reference) {
      if (!reviewer) errors.reviewer = 'Escribe quién hizo la revisión.';
      if (!reviewedOn) errors.reviewedOn = 'Elige la fecha de la revisión.';
      else if (reviewedOn > this.maxDate) errors.reviewedOn = 'La fecha no puede ser posterior a hoy.';
      if (!reference) errors.reference = 'Escribe la referencia o el acta.';
    }
    return errors;
  }

  private decision(): CaseReviewDecision {
    const decision: CaseReviewDecision = {};
    const note = this.note().trim();
    if (note) decision.note = note;
    if (this.data.mode === 'reject') {
      decision.reason = this.reason() as CaseReviewReason;
    } else if (this.reviewer().trim()) {
      decision.contentReview = {
        reviewer: this.reviewer().trim(),
        reviewedOn: this.reviewedOn(),
        reference: this.reference().trim(),
      };
    }
    return decision;
  }
}
