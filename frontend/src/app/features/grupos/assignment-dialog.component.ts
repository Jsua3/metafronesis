import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, signal } from '@angular/core';

import { RouterLink } from '@angular/router';
import { Grupo } from '../../core/api/grupo.service';
import { Assignment } from '../../core/models/assignment.model';
import { SimulationCaseSummary } from '../../core/models/revision.model';
import { uniqueUiId } from '../../shared/ui/button/click-guard';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialogActions, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { fromWindowIso, toWindowIso, windowError } from './assignment-window.util';

export interface AssignmentDialogData {
  mode: 'create' | 'edit';
  /** Casos publicados que todavía no están asignados al grupo (solo al asignar). */
  cases: SimulationCaseSummary[];
  fixedCaseId?: number;
  groups?: Grupo[];
  /** Al cambiar las fechas: la asignación y el título de su caso. */
  assignment?: Assignment;
  title?: string;
}

/** Lo que la docente decidió: el caso (solo al asignar) y las dos fechas como instantes ISO; `null` = sin fecha. */
export interface AssignmentDialogResult {
  caseVersionId?: number;
  groupId?: number;
  opensAt: string | null;
  closesAt: string | null;
}

type DialogField = 'groupId' | 'caseVersionId' | 'opensAt' | 'closesAt';

/** Un control de fecha a medio escribir entrega valor vacío: sin este aviso se guardaría como «sin fecha». */
const INCOMPLETE_DATE = 'Escribe la fecha y la hora completas, o borra lo escrito para dejarla vacía.';

/**
 * Asignar un caso a un grupo o cambiar su ventana (plan visual F10-5†; C7, RF-14, RF-15, CU-06): el caso, desde cuándo y
 * hasta cuándo. Las fechas son opcionales (sin ellas, abierto desde ya y sin cierre) y su ayuda dice qué pasa en cada
 * borde: tras el cierre nadie empieza el caso, pero quien ya lo empezó lo puede terminar (decisión 12). Cada error sale en
 * su campo y recibe el foco; cerrar sin guardar (Cancelar, Esc) no cambia nada.
 */
@Component({
  selector: 'app-assignment-dialog',
  imports: [RouterLink, UiButton, UiControl, UiDialogActions, UiDialogFrame, UiField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame [title]="title" [description]="description">
      <form class="ad-form" novalidate [id]="formId" (submit)="submit($event)">
        @if (data.mode === 'create' && data.fixedCaseId == null) {
          <ui-field label="Caso" required [error]="errors().caseVersionId">
            <select uiControl [value]="caseVersionId()" (change)="caseVersionId.set(read($event))">
              <option value="">Elige un caso</option>
              @for (item of data.cases; track item.caseVersionId) {
                <option [value]="item.caseVersionId">{{ item.title }} · v{{ item.semanticVersion }}</option>
              }
            </select>
          </ui-field>
        }
        @if (data.fixedCaseId != null) {
          @if (data.groups?.length) {
            <ui-field label="Grupo" required [error]="errors().groupId">
              <select uiControl [value]="groupId()" (change)="groupId.set(read($event))">
                <option value="">Elige un grupo</option>
                @for (group of data.groups; track group.id) { <option [value]="group.id">{{ group.nombre }} - {{ group.totalEstudiantes }} estudiantes</option> }
              </select>
            </ui-field>
          } @else {
            <p>No tienes grupos todavía. Crea uno para asignar este caso.</p>
            <a ui-button routerLink="/portal/grupos" (click)="ref.close()">Crear un grupo</a>
          }
        }
        <ui-field label="Abre" hint="Déjalo vacío para que se abra desde ya." [error]="errors().opensAt">
          <input uiControl type="datetime-local" [value]="opensAt()" (input)="onDate('opensAt', $event)" />
        </ui-field>
        <ui-field label="Cierra" hint="Déjalo vacío para que no cierre. Después del cierre nadie puede empezar el caso; quien ya lo empezó puede terminarlo."
          [error]="errors().closesAt">
          <input uiControl type="datetime-local" [value]="closesAt()" (input)="onDate('closesAt', $event)" />
        </ui-field>
        <p class="ad-zone">La hora es la de tu navegador.</p>
      </form>
      <button ui-button uiDialogActions type="button" variant="secondary" (click)="ref.close()">Cancelar</button>
      <button ui-button uiDialogActions type="submit" [disabledReason]="sinGrupos ? 'Crea un grupo primero: sin grupos no hay a quién asignar el caso.' : null" [attr.form]="formId">{{ confirmLabel }}</button>
    </ui-dialog-frame>
  `,
  styles: [`
    :host { display: block; }
    .ad-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ds-space-4); }
    .ad-zone { margin: 0; color: var(--ds-text-2); font-size: var(--ds-type-body-s-size); line-height: var(--ds-type-body-s-line); }
  `],
})
export class AssignmentDialogComponent {
  protected readonly ref = inject<DialogRef<AssignmentDialogResult | undefined>>(DialogRef);
  protected readonly data = inject<AssignmentDialogData>(DIALOG_DATA);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly formId = uniqueUiId('ad-form');
  /** Se asigna desde el propio caso y la docente aún no tiene grupos: el botón dice por qué está apagado. */
  protected readonly sinGrupos = this.data.fixedCaseId != null && !this.data.groups?.length;
  protected readonly title = this.data.mode === 'create'
    ? (this.data.fixedCaseId != null && this.data.title ? `Asignar «${this.data.title}» a un grupo` : 'Asignar un caso al grupo') : `Fechas de «${this.data.title ?? 'el caso'}»`;
  protected readonly description = this.data.mode === 'create'
    ? 'Los estudiantes del grupo verán el caso en su catálogo dentro de las fechas que elijas.'
    : 'El cambio vale desde ya para todo el grupo.';
  protected readonly confirmLabel = this.data.mode === 'create' ? 'Asignar' : 'Guardar fechas';

  protected readonly caseVersionId = signal('');
  protected readonly groupId = signal('');
  protected readonly opensAt = signal(fromWindowIso(this.data.assignment?.opensAt));
  protected readonly closesAt = signal(fromWindowIso(this.data.assignment?.closesAt));
  protected readonly errors = signal<Partial<Record<DialogField, string>>>({});
  /** El control de fecha tiene algo escrito que todavía no es una fecha (a medias): no es lo mismo que vacío. */
  private readonly incomplete = { opensAt: false, closesAt: false };

  protected read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  /** Cambiar cualquiera de las dos fechas retira los errores de fecha: se vuelven a calcular al enviar. */
  protected onDate(field: 'opensAt' | 'closesAt', event: Event): void {
    const input = event.target as HTMLInputElement;
    (field === 'opensAt' ? this.opensAt : this.closesAt).set(input.value);
    this.incomplete[field] = input.validity?.badInput === true;
    this.errors.update(current => (current.caseVersionId ? { caseVersionId: current.caseVersionId } : {}));
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors: Partial<Record<DialogField, string>> = {};
    if (this.data.fixedCaseId != null && !this.groupId()) errors.groupId = 'Elige un grupo.';
    if (this.data.mode === 'create' && this.data.fixedCaseId == null && !this.caseVersionId()) errors.caseVersionId = 'Elige un caso.';
    if (this.incomplete.opensAt) errors.opensAt = INCOMPLETE_DATE;
    if (this.incomplete.closesAt) errors.closesAt = INCOMPLETE_DATE;
    const window = errors.opensAt || errors.closesAt ? null : windowError(this.opensAt(), this.closesAt());
    if (window) errors.closesAt = window;
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) {
      // Tras pintar los errores, el foco va al primer campo inválido (teclado y lector llegan al problema).
      afterNextRender(() => this.host.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), { injector: this.injector });
      return;
    }
    const result: AssignmentDialogResult = { opensAt: this.windowValue('opensAt'), closesAt: this.windowValue('closesAt') };
    if (this.data.mode === 'create') result.caseVersionId = this.data.fixedCaseId ?? Number(this.caseVersionId());
    if (this.data.fixedCaseId != null) result.groupId = Number(this.groupId());
    this.ref.close(result);
  }

  /** La fecha como instante ISO; una que no se tocó vuelve tal cual llegó (el control solo muestra minutos, no segundos). */
  private windowValue(field: 'opensAt' | 'closesAt'): string | null {
    const original = this.data.assignment?.[field] ?? null;
    const typed = field === 'opensAt' ? this.opensAt() : this.closesAt();
    return typed === fromWindowIso(original) ? original : toWindowIso(typed);
  }
}
