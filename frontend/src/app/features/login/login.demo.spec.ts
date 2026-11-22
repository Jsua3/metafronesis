import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { LoginComponent } from './login.component';

@Component({ template: '' })
class Screen {}

/**
 * «Usar demo» en desarrollo (RNF-01, VD-22; plan visual F4-2): las credenciales vienen de un módulo que solo se carga
 * bajo ngDevMode (en producción no existe: lo prueba check-dist-dev-only sobre el dist). Aquí, en desarrollo, sigue
 * rellenando el perfil elegido.
 */
// req: RNF-01 (parte de interfaz)
describe('login: «Usar demo» solo en desarrollo', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Screen }]),
        { provide: AuthService, useValue: { login: () => of({}), googleConfig: () => of({ enabled: false }) } },
        { provide: UiDialog, useValue: { sheet: vi.fn() } },
      ],
    });
  });

  afterEach(() => { window.matchMedia = originalMatchMedia; });

  it('rellena correo y contraseña del perfil elegido y cambia el correo al cambiar de perfil', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.demo()).not.toBeNull());
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    [...host.querySelectorAll<HTMLButtonElement>('form button')].find(button => button.textContent!.trim() === 'Usar demo')!.click();
    expect(fixture.componentInstance.form.getRawValue()).toMatchObject({ email: 'estudiante@psychosim.edu.co', password: 'Estudiante123!' });
    fixture.componentInstance.selectRole('PROFESOR');
    expect(fixture.componentInstance.form.controls.email.value).toBe('profesora@psychosim.edu.co');
  });
});
