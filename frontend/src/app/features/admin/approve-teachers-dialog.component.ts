import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialogActions, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';

@Component({ selector: 'app-approve-teachers-dialog', imports: [UiButton, UiDialogActions, UiDialogFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ui-dialog-frame title="Aprobar cuentas" [description]="message">
    <label><input type="checkbox" [checked]="grant()" (change)="grant.set($any($event.target).checked)"> Dar también permiso de autoría a los profesores</label>
    <button ui-button uiDialogActions type="button" variant="secondary" (click)="ref.close()">Cancelar</button>
    <button ui-button uiDialogActions type="button" (click)="ref.close(grant())">Aprobar</button>
  </ui-dialog-frame>` })
export class ApproveTeachersDialogComponent {
  protected readonly ref = inject<DialogRef<boolean | undefined>>(DialogRef);
  protected readonly message = inject<string>(DIALOG_DATA);
  protected readonly grant = signal(false);
}
