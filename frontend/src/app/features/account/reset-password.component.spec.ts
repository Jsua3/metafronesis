import { HttpErrorResponse } from '@angular/common/http';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { ResetPasswordComponent } from './reset-password.component';

@Component({ template: '' })
class Screen {}

describe('ResetPasswordComponent (enlace del correo de «¿Olvidaste tu contraseña?»)', () => {
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let auth: { checkPasswordReset: ReturnType<typeof vi.fn>; confirmPasswordReset: ReturnType<typeof vi.fn> };
  const host = () => fixture.nativeElement as HTMLElement;
  const text = () => (host().textContent ?? '').replace(/\s+/g, ' ');

  async function render(query: Record<string, string> = { uid: 'MQ', token: 'abc-123' }) {
    TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Screen }]),
        { provide: AuthService, useValue: auth },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    fixture = TestBed.createComponent(ResetPasswordComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function llenar(password: string, confirmPassword = password) {
    fixture.componentInstance.form.setValue({ password, confirmPassword });
    host().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();
  }

  beforeEach(() => {
    auth = { checkPasswordReset: vi.fn(() => of(true)), confirmPasswordReset: vi.fn(() => of({})) };
  });
  afterEach(() => TestBed.resetTestingModule());

  it('sin uid o token dice que el enlace no sirve y ofrece pedir otro', async () => {
    await render({});
    expect(auth.checkPasswordReset).not.toHaveBeenCalled();
    expect(text()).toContain('Este enlace ya no sirve.');
    expect(host().querySelector('a[href^="/login"]')!.getAttribute('href')).toBe('/login?olvido=1');
  });

  it('un enlace vencido o usado dice que no sirve', async () => {
    auth.checkPasswordReset.mockReturnValue(of(false));
    await render();
    expect(auth.checkPasswordReset).toHaveBeenCalledWith('MQ', 'abc-123');
    expect(text()).toContain('Este enlace ya no sirve.');
  });

  it('con un enlace válido guarda la contraseña nueva y ofrece iniciar sesión', async () => {
    await render();
    expect(host().querySelector('#restablecer-nueva')).not.toBeNull();
    llenar('Nueva-Clave-Segura-77');
    expect(auth.confirmPasswordReset).toHaveBeenCalledWith('MQ', 'abc-123', 'Nueva-Clave-Segura-77');
    expect(text()).toContain('Contraseña actualizada.');
    expect(host().querySelector('a[href^="/login"]')!.getAttribute('href')).toBe('/login');
  });

  it('no envía si las contraseñas no coinciden o son cortas', async () => {
    await render();
    llenar('Nueva-Clave-Segura-77', 'Otra-Distinta-88');
    llenar('corta');
    expect(auth.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('si el servidor dice que el enlace venció al guardar, lo muestra', async () => {
    auth.confirmPasswordReset.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 400, error: { success: false, code: 'RESET_LINK_INVALID', message: 'El enlace no es válido o ya venció.' },
    })));
    await render();
    llenar('Nueva-Clave-Segura-77');
    expect(text()).toContain('Este enlace ya no sirve.');
  });

  it('una contraseña que el servidor rechaza se explica en su campo', async () => {
    auth.confirmPasswordReset.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 400, error: { success: false, code: 'VALIDATION_ERROR', field: 'password', message: 'Esta contraseña es demasiado común.' },
    })));
    await render();
    llenar('Contrasena1234');
    expect(text()).toContain('Esta contraseña es demasiado común.');
    expect(host().querySelector('#restablecer-nueva')).not.toBeNull();
  });
});
