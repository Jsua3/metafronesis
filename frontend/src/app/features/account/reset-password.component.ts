import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api/api-error.util';
import { AuthService } from '../../core/auth/auth.service';
import { PASSWORD_MIN_LENGTH } from '../../core/auth/password-change';
import { TemaService } from '../../core/tema/tema.service';
import { focusFirstInvalid } from '../../shared/forms/focus-first-invalid.util';
import { PublicBarComponent } from '../../shared/layout/public-bar.component';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';

/** Lo que muestra la pantalla: comprobando el enlace, el formulario, el enlace que ya no sirve o la confirmación. */
type Estado = 'comprobando' | 'listo' | 'invalido' | 'hecho';

function mismaContrasena(group: AbstractControl): ValidationErrors | null {
  const nueva = group.get('password')?.value;
  const repetida = group.get('confirmPassword')?.value;
  return repetida && nueva !== repetida ? { mismatch: true } : null;
}

/**
 * «Restablece tu contraseña»: la página a la que lleva el enlace del correo de «¿Olvidaste tu contraseña?»
 * (`/restablecer-contrasena?uid=…&token=…`). Pública, fuera del portal, con el mismo vidrio que «Cambia tu contraseña».
 * Al abrirse pregunta al servidor si el enlace sigue sirviendo (vence a los 30 minutos y vale una sola vez); si no, lo
 * dice y ofrece pedir otro. Mínimo de 10 caracteres como el servidor; lo que el servidor rechace sale en su campo.
 */
@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, PublicBarComponent, UiButton, UiControl, UiField, UiPageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="publico restablecer-publico" [attr.data-skin]="tema.piel()">
      <app-public-bar mode="acceso" />
      <main id="main-content" tabindex="-1" class="restablecer">
        <div class="restablecer__tarjeta pub-vidrio">
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <ui-page-header eyebrow="Tu cuenta" title="Restablece tu contraseña" [description]="descripcion()" />
          <p class="ds-sr-only" role="status">{{ statusText() }}</p>

          @switch (estado()) {
            @case ('comprobando') {
              <p class="restablecer__nota">Comprobando el enlace…</p>
            }
            @case ('invalido') {
              <div class="restablecer__aviso">
                <p id="restablecer-invalido" class="restablecer__titulo" tabindex="-1">Este enlace ya no sirve.</p>
                <p class="restablecer__nota">Puede que haya vencido (dura 30 minutos), que ya lo hayas usado o que esté incompleto. Pide uno nuevo y usa el más reciente.</p>
                <a ui-button routerLink="/login" [queryParams]="{ olvido: 1 }">Pedir un enlace nuevo</a>
              </div>
            }
            @case ('hecho') {
              <div class="restablecer__aviso">
                <p id="restablecer-hecho" class="restablecer__titulo" tabindex="-1">Contraseña actualizada.</p>
                <p class="restablecer__nota">Ya puedes iniciar sesión con tu nueva contraseña. Cerramos las demás sesiones abiertas de tu cuenta.</p>
                <a ui-button routerLink="/login">Iniciar sesión</a>
              </div>
            }
            @default {
              <form class="restablecer__form" [formGroup]="form" novalidate (ngSubmit)="submit()">
                <div class="restablecer__nueva">
                  <ui-field label="Nueva contraseña" required revealable [error]="errorDeNueva()">
                    <input uiControl id="restablecer-nueva" type="password" formControlName="password" autocomplete="new-password" aria-describedby="restablecer-requisitos" />
                  </ui-field>
                  <ul id="restablecer-requisitos" class="restablecer__requisitos" aria-label="Requisitos de la nueva contraseña">
                    <li [class.cumplido]="tieneLongitud()">Al menos {{ minimo }} caracteres<span class="ds-sr-only">{{ tieneLongitud() ? ': cumplido' : ': pendiente' }}</span></li>
                    <li [class.cumplido]="noSoloNumeros()">No solo números<span class="ds-sr-only">{{ noSoloNumeros() ? ': cumplido' : ': pendiente' }}</span></li>
                    <li>Que no sea una contraseña común (se comprueba al guardar)</li>
                  </ul>
                </div>
                <ui-field label="Repite la nueva contraseña" required revealable [error]="errorDeConfirmacion()">
                  <input uiControl id="restablecer-confirmar" type="password" formControlName="confirmPassword" autocomplete="new-password" />
                </ui-field>
                @if (formError()) {
                  <p class="restablecer__error" role="alert">{{ formError() }}</p>
                }
                <button ui-button type="submit" icon="lock" [loading]="saving()">{{ saving() ? 'Guardando…' : 'Guardar contraseña' }}</button>
              </form>
            }
          }
        </div>
      </main>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .restablecer-publico { min-height: 100vh; }
    .restablecer {
      display: grid; grid-template-columns: minmax(0, 1fr); max-width: 32rem; margin-inline: auto;
      padding: calc(var(--asb-alto-modulo-superior) + var(--ds-space-8)) var(--ds-space-4) var(--ds-space-8);
    }
    .restablecer__tarjeta { display: grid; gap: var(--ds-space-5); padding: var(--ds-space-6); min-width: 0; }
    .restablecer__form { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ds-space-4); }
    .restablecer__nueva { display: grid; gap: var(--ds-space-2); min-width: 0; }
    .restablecer__requisitos {
      margin: 0; padding-inline-start: var(--ds-space-5); display: grid; gap: var(--ds-space-1);
      color: var(--ds-text-2); font-size: var(--ds-type-body-s-size); line-height: var(--ds-type-body-s-line);
    }
    .restablecer__requisitos .cumplido { color: var(--ds-success); }
    .restablecer__aviso { display: grid; justify-items: start; gap: var(--ds-space-3); }
    .restablecer__titulo { margin: 0; color: var(--ds-text-1); font-weight: var(--ds-type-h3-weight); }
    .restablecer__titulo:focus-visible { outline: 2px solid var(--ds-focus, var(--ds-primary)); outline-offset: 2px; }
    .restablecer__nota { margin: 0; color: var(--ds-text-2); }
    .restablecer__error { margin: 0; color: var(--ds-danger); font-weight: var(--ds-type-h3-weight); font-size: var(--ds-type-body-s-size); }
    @media (forced-colors: active) { .restablecer__tarjeta { border: 1px solid CanvasText; } }
  `],
})
export class ResetPasswordComponent implements OnInit {
  protected readonly tema = inject(TemaService);
  protected readonly minimo = PASSWORD_MIN_LENGTH;
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly uid = this.query.get('uid') ?? '';
  private readonly token = this.query.get('token') ?? '';

  readonly estado = signal<Estado>('comprobando');
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  private readonly serverError = signal('');

  readonly form = inject(FormBuilder).nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
    confirmPassword: ['', Validators.required],
  }, { validators: mismaContrasena });

  // BORRADOR: textos nuevos, pendientes de la aprobación de Psicología
  protected readonly descripcion = computed(() =>
    this.estado() === 'listo' ? 'Elige una contraseña nueva para tu cuenta.' : 'Recupera el acceso a tu cuenta de SIEP.');
  protected readonly statusText = computed(() => {
    if (this.saving()) return 'Guardando tu nueva contraseña…';
    if (this.estado() === 'hecho') return 'Contraseña actualizada.';
    if (this.estado() === 'invalido') return 'Este enlace ya no sirve.';
    return this.formError();
  });

  constructor() { this.form.events.pipe(takeUntilDestroyed()).subscribe(() => this.cdr.markForCheck()); }

  ngOnInit(): void {
    if (!this.uid || !this.token) {
      this.mostrar('invalido');
      return;
    }
    this.auth.checkPasswordReset(this.uid, this.token).subscribe({
      next: valido => this.mostrar(valido ? 'listo' : 'invalido'),
      error: () => this.mostrar('invalido'),
    });
  }

  protected tieneLongitud(): boolean { return this.form.controls.password.value.length >= PASSWORD_MIN_LENGTH; }
  protected noSoloNumeros(): boolean { const value = this.form.controls.password.value; return !!value && !/^\d+$/.test(value); }

  protected errorDeNueva(): string | null {
    const control = this.form.controls.password;
    if (control.touched && control.hasError('required')) return 'Escribe la nueva contraseña.';
    if (control.touched && control.hasError('minlength')) return `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
    return this.serverError() || null;
  }

  protected errorDeConfirmacion(): string | null {
    const control = this.form.controls.confirmPassword;
    if (!control.touched) return null;
    if (control.hasError('required')) return 'Repite la nueva contraseña.';
    return this.form.hasError('mismatch') ? 'Las contraseñas no coinciden.' : null;
  }

  submit(): void {
    if (this.saving()) return;
    this.serverError.set('');
    this.formError.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const repetir = this.form.hasError('mismatch') && this.form.controls.confirmPassword.valid
        ? this.host.nativeElement.querySelector<HTMLElement>('#restablecer-confirmar') : null;
      if (repetir) repetir.focus();
      else focusFirstInvalid(this.host.nativeElement);
      return;
    }
    this.saving.set(true);
    this.auth.confirmPasswordReset(this.uid, this.token, this.form.controls.password.value).subscribe({
      next: () => {
        this.saving.set(false);
        this.mostrar('hecho');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const cuerpo = err instanceof HttpErrorResponse ? (err.error as { code?: string; field?: string } | null) : null;
        if (cuerpo?.code === 'RESET_LINK_INVALID') {
          this.mostrar('invalido');
          return;
        }
        const message = apiErrorMessage(err, 'No fue posible guardar la contraseña. Inténtalo de nuevo.');
        if (cuerpo?.field === 'password' && message) {
          this.serverError.set(message);
          this.host.nativeElement.querySelector<HTMLElement>('#restablecer-nueva')?.focus();
        } else if (message) {
          this.formError.set(message);
        }
      },
    });
  }

  /** Cambia de estado y lleva el foco al mensaje nuevo (el formulario con el foco desaparece). */
  private mostrar(estado: Estado): void {
    this.estado.set(estado);
    this.cdr.detectChanges();
    const id = estado === 'hecho' ? '#restablecer-hecho' : estado === 'invalido' ? '#restablecer-invalido' : null;
    if (id) this.host.nativeElement.querySelector<HTMLElement>(id)?.focus();
  }
}
