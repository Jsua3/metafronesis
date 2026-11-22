import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { LoginComponent } from './login.component';

@Component({ template: '' })
class Screen {}

/**
 * El acceso tras una sesión vencida (plan visual F3-6, H-34): dice en la pantalla por qué volvió la persona y, al
 * entrar, la devuelve a la ruta que pidió; un returnUrl que saldría del sitio se ignora y va al panel.
 */
// req: BLOQUE-H (H-34), RNF-004
describe('login: sesión expirada y regreso', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let router: Router;
  const login = vi.fn(() => of({}));

  async function open(url: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Screen }]),
        { provide: AuthService, useValue: { login, googleConfig: () => of({ enabled: false }) } },
        { provide: UiDialog, useValue: { sheet: vi.fn() } },
      ],
    });
    router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  async function submit(host: HTMLElement): Promise<void> {
    fixture.componentInstance.form.setValue({ email: 'ana@cue.edu.co', password: 'secreta', remember: false });
    await fixture.whenStable();
    host.querySelector<HTMLButtonElement>('form button[type="submit"]')!.click();
    await fixture.whenStable();
  }

  // jsdom no trae matchMedia (lo usan la capa de partículas y la barra): escritorio sin preferencias.
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => {
    login.mockClear();
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => { window.matchMedia = originalMatchMedia; });

  it('con motivo=sesion-expirada, el formulario de entrada lo dice en la pantalla (no en un aviso que se va)', async () => {
    const host = await open('/login?returnUrl=%2Fportal%2Fgrupos&motivo=sesion-expirada');
    const notice = host.querySelector('form .acceso__notice[role="status"]')!;
    expect(notice.querySelector('mat-icon')!.getAttribute('aria-hidden')).toBe('true');
    // Rediseño 2026-11-20: dice qué pasó y qué sigue (al entrar se vuelve a la ruta pedida, como prueba el caso de abajo).
    expect(notice.querySelector('span')!.textContent!.trim()).toBe('Tu sesión terminó. Entra de nuevo y volverás a donde estabas.');
  });

  it('sin motivo no hay aviso', async () => {
    const host = await open('/login');
    expect(host.querySelector('form .acceso__notice')).toBeNull();
  });

  it('al entrar vuelve a la ruta pedida', async () => {
    const host = await open('/login?returnUrl=%2Fportal%2Fgrupos%3Fpagina%3D2&motivo=sesion-expirada');
    const navigate = vi.spyOn(router, 'navigateByUrl');
    await submit(host);
    expect(login).toHaveBeenCalledWith('ana@cue.edu.co', 'secreta');
    expect(navigate).toHaveBeenCalledWith('/portal/grupos?pagina=2');
  });

  it('un returnUrl que saldría del sitio se ignora: va al panel', async () => {
    const host = await open('/login?returnUrl=%2F%2Fevil.example');
    const navigate = vi.spyOn(router, 'navigateByUrl');
    await submit(host);
    expect(navigate).toHaveBeenCalledWith('/portal/dashboard');
  });
});
