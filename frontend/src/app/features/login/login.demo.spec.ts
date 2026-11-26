import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';

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
  const result = new Subject<object>();
  const login = vi.fn(() => result);

  beforeEach(() => {
    login.mockClear();
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Screen }]),
        { provide: AuthService, useValue: { login, demoConfig: () => of({ enabled: true }), googleConfig: () => of({ enabled: false }) } },
        { provide: UiDialog, useValue: { sheet: vi.fn() } },
      ],
    });
  });

  afterEach(() => { window.matchMedia = originalMatchMedia; });

  it('ofrece solo el estudiante y entra sin sobrescribir los campos de la persona', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.demo()).not.toBeNull());
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.form.patchValue({ email: 'ana@cue.edu.co', password: 'personal' });
    const buttons = host.querySelectorAll<HTMLButtonElement>('.acceso__demo button');
    expect(buttons).toHaveLength(1);
    buttons[0].click();
    expect(login).toHaveBeenCalledExactlyOnceWith('estudiante@psychosim.edu.co', 'Estudiante123!');
    expect(fixture.componentInstance.form.getRawValue()).toMatchObject({ email: 'ana@cue.edu.co', password: 'personal' });
  });
});
