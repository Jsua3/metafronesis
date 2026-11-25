import { ChangeDetectionStrategy, Component, Injector, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { GrupoService } from '../../core/api/grupo.service';
import { AssignmentService } from '../../core/api/assignment.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { AssignmentDialogComponent, AssignmentDialogData, AssignmentDialogResult } from './assignment-dialog.component';

@Component({
  selector: 'app-asignar-desde-caso', imports: [UiButton], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button ui-button type="button" variant="secondary" [disabled]="busy() || !publicado()" (click)="asignar()">Asignar a un grupo</button>
    @if (!publicado()) { <p>Publica el caso para poder asignarlo</p> }
  `,
})
export class AsignarDesdeCasoComponent {
  readonly caseId = input.required<number>();
  readonly publicado = input.required<boolean>();
  protected readonly busy = signal(false);
  private readonly injector = inject(Injector);

  protected async asignar(): Promise<void> {
    if (this.busy() || !this.publicado()) return;
    this.busy.set(true);
    const notify = this.injector.get(NotificationService);
    try {
      const groups = await firstValueFrom(this.injector.get(GrupoService).listar());
      const ref = this.injector.get(UiDialog).open<AssignmentDialogResult | undefined, AssignmentDialogData>(AssignmentDialogComponent, {
        data: { mode: 'create', cases: [], fixedCaseId: this.caseId(), groups },
      });
      const result = await firstValueFrom(ref.closed, { defaultValue: undefined });
      if (!result?.groupId) return;
      const group = groups.find(g => g.id === result.groupId);
      if (!group) return;
      await firstValueFrom(this.injector.get(AssignmentService).create({ caseVersionId: this.caseId(), target: { type: 'GROUP', groupId: group.id }, opensAt: result.opensAt, closesAt: result.closesAt }));
      notify.success(`Caso asignado a ${group.nombre}. Lo verán ${group.totalEstudiantes} estudiantes dentro de las fechas elegidas.`);
    } catch (error: unknown) {
      const message = (error as { error?: { message?: string } })?.error?.message;
      notify.error(message || 'No fue posible asignar el caso. Inténtalo de nuevo.');
    } finally { this.busy.set(false); }
  }
}
