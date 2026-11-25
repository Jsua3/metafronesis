import { ChangeDetectionStrategy, Component, Injector, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { GrupoService } from '../../core/api/grupo.service';
import { AssignmentService } from '../../core/api/assignment.service';
import { mensajeDeError } from '../../core/api/mensaje-de-error.util';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { AssignmentDialogComponent, AssignmentDialogData, AssignmentDialogResult } from './assignment-dialog.component';

/**
 * «Asignar a un grupo» desde el propio caso (SIEP-259): en la prueba de uso ningún docente encontró la asignación, que solo
 * vivía en la ficha del grupo. En la barra del editor va `compacto` (una palabra, nunca partida en renglones); el nombre
 * completo de la acción y del caso queda en `aria-label`. Sin publicar, el botón se desactiva y el motivo se lee al lado.
 */
@Component({
  selector: 'app-asignar-desde-caso', imports: [UiButton], changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'asignar-desde-caso', '[class.asignar-desde-caso--compacto]': 'compacto()' },
  styles: `
    :host { display: inline-flex; flex-direction: column; align-items: flex-start; gap: var(--space-1, 4px); }
    :host(.asignar-desde-caso--compacto) { flex-direction: row; align-items: center; }
    :host button { white-space: nowrap; }
    .asignar-desde-caso__motivo { margin: 0; font-size: var(--text-sm, 0.875rem); color: var(--text-muted, currentColor); }
  `,
  template: `
    <button ui-button type="button" variant="secondary" [size]="compacto() ? 'sm' : 'md'" [loading]="busy()"
      [disabled]="!publicado()" [attr.aria-label]="etiqueta()" [attr.aria-describedby]="publicado() ? null : motivoId"
      (click)="asignar()">{{ compacto() ? 'Asignar' : 'Asignar a un grupo' }}</button>
    @if (!publicado()) { <p class="asignar-desde-caso__motivo" [id]="motivoId">Publica el caso para poder asignarlo.</p> }
  `,
})
export class AsignarDesdeCasoComponent {
  private static siguiente = 0;
  readonly caseId = input.required<number>();
  readonly publicado = input.required<boolean>();
  /** Nombre del caso: el diálogo y el lector de pantalla dicen qué se asigna. */
  readonly titulo = input<string | null>(null);
  readonly compacto = input(false);
  /** El caso quedó asignado a un grupo: quien lo contiene puede refrescar lo que dependa de eso. */
  readonly asignado = output<void>();
  protected readonly motivoId = `asignar-motivo-${AsignarDesdeCasoComponent.siguiente++}`;
  protected readonly etiqueta = () => (this.titulo() ? `Asignar «${this.titulo()}» a un grupo` : 'Asignar el caso a un grupo');
  protected readonly busy = signal(false);
  private readonly injector = inject(Injector);

  protected async asignar(): Promise<void> {
    if (this.busy() || !this.publicado()) return;
    this.busy.set(true);
    const notify = this.injector.get(NotificationService);
    try {
      const groups = await firstValueFrom(this.injector.get(GrupoService).listar());
      const ref = this.injector.get(UiDialog).open<AssignmentDialogResult | undefined, AssignmentDialogData>(AssignmentDialogComponent, {
        data: { mode: 'create', cases: [], fixedCaseId: this.caseId(), groups, title: this.titulo() ?? undefined },
      });
      const result = await firstValueFrom(ref.closed, { defaultValue: undefined });
      if (!result?.groupId) return;
      const group = groups.find(g => g.id === result.groupId);
      if (!group) return;
      await firstValueFrom(this.injector.get(AssignmentService).create({ caseVersionId: this.caseId(), target: { type: 'GROUP', groupId: group.id }, opensAt: result.opensAt, closesAt: result.closesAt }));
      notify.success(`Caso asignado a ${group.nombre}. Lo verán ${group.totalEstudiantes} estudiantes dentro de las fechas elegidas.`);
      this.asignado.emit();
    } catch (error: unknown) {
      // Un error del servidor en español claro se dice tal cual; uno técnico se cambia por qué pasó y qué hacer.
      const message = mensajeDeError(error, 'No fue posible asignar el caso.');
      if (message) notify.error(message);
    } finally { this.busy.set(false); }
  }
}
