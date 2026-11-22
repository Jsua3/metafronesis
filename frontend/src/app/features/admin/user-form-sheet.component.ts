import { DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Signal, inject } from '@angular/core';
import { AbstractControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AdminUser, UserRole } from '../../core/api/user-admin.service';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialogActions, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';

/**
 * Lo que la hoja necesita de la pantalla que la abre: el formulario y sus acciones. La pantalla (UsersComponent) es
 * dueña del formulario, de su validación y de guardar; la hoja solo lo presenta.
 */
export interface UserFormHost {
  readonly form: FormGroup;
  readonly roles: readonly UserRole[];
  readonly selectedUser: Signal<AdminUser | null>;
  readonly saving: Signal<boolean>;
  readonly message: Signal<string>;
  roleLabel(role: string): string;
  fieldError(control: AbstractControl, message: string): string | null;
  save(): void;
  closeForm(): void;
}

export interface UserFormSheetData {
  host: UserFormHost;
}

/**
 * Formulario de usuario en una hoja lateral (plan visual F7-6): antes quedaba bajo la tabla y, en un teléfono, lejos
 * de la fila que se editaba. Es un diálogo de la biblioteca: trampa de foco, foco inicial en el primer campo, Esc, y
 * el foco vuelve al botón que lo abrió. Los campos son `ui-field`; el error de cada uno sale al enviar.
 */
@Component({
  selector: 'app-user-form-sheet',
  imports: [ReactiveFormsModule, UiButton, UiControl, UiDialogActions, UiDialogFrame, UiField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="host.form" novalidate (ngSubmit)="host.save()">
      <ui-dialog-frame [title]="host.selectedUser() ? 'Editar usuario' : 'Crear usuario'"
        [description]="host.message() || null">
        <div class="uf-fields">
          <ui-field label="Nombre" required [error]="host.fieldError(control('nombre'), 'Escribe el nombre.')">
            <input uiControl type="text" formControlName="nombre" autocomplete="given-name">
          </ui-field>
          <ui-field label="Apellido" required [error]="host.fieldError(control('apellido'), 'Escribe el apellido.')">
            <input uiControl type="text" formControlName="apellido" autocomplete="family-name">
          </ui-field>
          <ui-field label="Email" required [error]="emailError()">
            <input uiControl type="email" formControlName="email" autocomplete="email">
          </ui-field>
          <ui-field label="Rol" required [error]="host.fieldError(control('role'), 'Elige un rol.')">
            <select uiControl formControlName="role">
              @for (role of host.roles; track role) {
                <option [value]="role">{{ host.roleLabel(role) }}</option>
              }
            </select>
          </ui-field>
          <ui-field [label]="host.selectedUser() ? 'Nueva contraseña (opcional)' : 'Contraseña'" [required]="!host.selectedUser()"
            hint="Mínimo 10 caracteres." [error]="passwordError()" revealable>
            <input uiControl type="password" formControlName="password" autocomplete="new-password">
          </ui-field>
        </div>
        <button ui-button uiDialogActions type="button" variant="secondary" (click)="host.closeForm()">Cancelar</button>
        <button ui-button uiDialogActions type="submit" icon="save" [loading]="host.saving()">
          {{ host.saving() ? 'Guardando…' : 'Guardar' }}
        </button>
      </ui-dialog-frame>
    </form>
  `,
  styles: [`
    .uf-fields {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ds-space-4);
    }
  `],
})
export class UserFormSheetComponent {
  protected readonly host = inject<UserFormSheetData>(DIALOG_DATA).host;
  private readonly cambios = inject(ChangeDetectorRef);

  constructor() {
    // Los eventos de touched y validación no son señales; actualizan la hoja OnPush al cambiar el formulario.
    this.host.form.events.pipe(takeUntilDestroyed()).subscribe(() => this.cambios.markForCheck());
  }

  protected control(name: string): AbstractControl {
    return this.host.form.get(name)!;
  }

  protected emailError(): string | null {
    const control = this.control('email');
    if (!control.touched || control.valid) return null;
    return control.hasError('required') ? 'Escribe el correo.' : 'Escribe un correo válido.';
  }

  protected passwordError(): string | null {
    const control = this.control('password');
    if (!control.touched || control.valid) return null;
    return control.hasError('required') ? 'La contraseña es obligatoria al crear un usuario.' : 'Usa al menos 10 caracteres.';
  }
}
