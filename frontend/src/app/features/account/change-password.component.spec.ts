import { HttpErrorResponse } from '@angular/common/http';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { ChangePasswordComponent } from './change-password.component';

@Component({ template: '' })
class Screen {}

/**
 * «Cambia tu contraseña» (plan visual F7b-2; E2-9, RN-10): una cuenta aprobada por el administrador entra con una
 * contraseña temporal y el servidor le niega TODO (403 `PASSWORD_CHANGE_REQUIRED`) hasta que fije la suya. Sin esta
 * pantalla, la persona quedaba en un portal donde cada carga decía «No tienes permisos».
 */
// req: RN-10, RNF-01
describe('ChangePasswordComponent', () => {
  let fixture: ComponentFixture<ChangePasswordComponent>;
  let router: Router;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function open(url: string, auth: Partial<Record<string, unknown>> = {}) {
    const service = {
      changePassword: vi.fn((): Observable<unknown> => of(null)),
      markPasswordChanged: vi.fn(),
      mustChangePassword: () => true,
      logout: vi.fn(),
      ...auth,
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Screen }]),
        { provide: AuthService, useValue: service },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
      ],
    });
    router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    fixture = TestBed.createComponent(ChangePasswordComponent);
    await fixture.whenStable();
    return service;
  }

  function fill(current: string, next: string, confirm = next) {
    fixture.componentInstance.form.setValue({ currentPassword: current, newPassword: next, confirmPassword: confirm });
  }

  async function submit() {
    host().querySelector<HTMLButtonElement>('form button[type="submit"]')!.click();
    await fixture.whenStable();
  }

  it('un solo h1, su propio <main> y dice por qué está aquí (la contraseña es temporal)', async () => {
    await open('/cambiar-contrasena');
    expect(host().querySelectorAll('h1')).toHaveLength(1);
    expect(host().querySelector('main#main-content')).not.toBeNull();
    expect(text(host())).toMatch(/contraseña temporal/i);
  });

  it('exige 10 caracteres como el servidor (antes la interfaz decía 8)', async () => {
    const auth = await open('/cambiar-contrasena');
    fill('Temporal-123', 'corta9999');
    await submit();
    expect(auth['changePassword']).not.toHaveBeenCalled();
    expect(text(host())).toContain('al menos 10 caracteres');
  });

  it('la confirmación debe coincidir', async () => {
    const auth = await open('/cambiar-contrasena');
    fill('Temporal-123', 'Nueva-clave-2026', 'Otra-clave-2026');
    await submit();
    expect(auth['changePassword']).not.toHaveBeenCalled();
    expect(text(host())).toContain('no coinciden');
  });

  it('al cambiarla, la sesión deja de exigirlo y vuelve a la ruta pedida', async () => {
    const auth = await open('/cambiar-contrasena?returnUrl=%2Fportal%2Fgrupos');
    const navigate = vi.spyOn(router, 'navigateByUrl');
    fill('Temporal-123', 'Nueva-clave-2026');
    await submit();
    expect(auth['changePassword']).toHaveBeenCalledWith('Temporal-123', 'Nueva-clave-2026');
    expect(auth['markPasswordChanged']).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/portal/grupos');
  });

  it('un returnUrl que saldría del sitio se ignora: va al panel', async () => {
    await open('/cambiar-contrasena?returnUrl=%2F%2Fevil.example');
    const navigate = vi.spyOn(router, 'navigateByUrl');
    fill('Temporal-123', 'Nueva-clave-2026');
    await submit();
    expect(navigate).toHaveBeenCalledWith('/portal/dashboard');
  });

  it('el error del servidor se muestra en SU campo (`field`), no en un aviso suelto', async () => {
    const wrong = new HttpErrorResponse({
      status: 400,
      error: { success: false, code: 'VALIDATION_ERROR', field: 'currentPassword', message: 'La contraseña actual no es correcta.' },
    });
    await open('/cambiar-contrasena', { changePassword: vi.fn(() => throwError(() => wrong)) });
    fill('mala-1234567', 'Nueva-clave-2026');
    await submit();
    const field = host().querySelector('#cambio-actual')!.closest('ui-field')!;
    expect(text(field)).toContain('La contraseña actual no es correcta.');
    expect(host().querySelector('#cambio-actual')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('«Cerrar sesión» está a mano (quien no recuerda la temporal no queda atrapado)', async () => {
    const auth = await open('/cambiar-contrasena');
    const logout = [...host().querySelectorAll('button')].find(el => text(el) === 'Cerrar sesión')!;
    logout.click();
    expect(auth['logout']).toHaveBeenCalled();
  });
  it('en modo voluntario conserva la contraseña actual y confirma en línea', async () => {
    const auth = await open('/portal/cuenta/contrasena');
    fixture.componentRef.setInput('modo', 'voluntario');
    await fixture.whenStable();
    expect(host().querySelector('main')).toBeNull();
    expect(host().querySelectorAll('h1')).toHaveLength(1);
    fill('Actual-123', 'Nueva-clave-2026');
    await submit();
    expect(auth['changePassword']).toHaveBeenCalledWith('Actual-123', 'Nueva-clave-2026');
    expect(text(host())).toContain('Contraseña actualizada');
    expect(text(host())).not.toContain('Cerrar sesión');
    // El botón con el foco desapareció: el foco pasa a la confirmación y la región viva (siempre montada) la anuncia.
    expect(document.activeElement?.id).toBe('cambio-confirmacion');
    expect(text(host().querySelector('[role="status"]'))).toBe('Contraseña actualizada.');
  });

  it('el campo de la nueva contraseña apunta a la lista de requisitos con aria-describedby', async () => {
    await open('/cambiar-contrasena');
    const input = host().querySelector('#cambio-nueva') as HTMLInputElement;
    expect(input.getAttribute('aria-describedby')).toContain('cambio-requisitos');
    expect(host().querySelector('#cambio-requisitos')).not.toBeNull();
  });

  it('sin dato de ruta mantiene el modo forzado', async () => {
    await open('/cambiar-contrasena');
    fixture.componentRef.setInput('modo', undefined);
    await fixture.whenStable();
    expect(host().querySelector('main#main-content')).not.toBeNull();
    expect(text(host().querySelector('h1'))).toBe('Elige tu contraseña');
    expect(text(host())).toContain('Contraseña temporal');
  });

});
