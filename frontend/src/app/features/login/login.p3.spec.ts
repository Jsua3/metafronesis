import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { AppComponent } from '../../app.component';
import { AuthService } from '../../core/auth/auth.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { LOGIN_REMEMBER_EMAIL_KEY } from './login-assets.config';
import { LoginComponent } from './login.component';

@Component({ template: '' })
class Destination {}

describe('P3: acceso directo y comprensible', () => {
  const login = vi.fn();
  const demoConfig = vi.fn();
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    login.mockReset().mockReturnValue(new Subject());
    demoConfig.mockReset().mockReturnValue(of({ enabled: false }));
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width'), media: query,
      addEventListener() {}, removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'login', component: LoginComponent }, { path: '**', component: Destination }]),
      { provide: AuthService, useValue: { login, demoConfig, googleConfig: () => of({ enabled: false }) } },
      { provide: UiDialog, useValue: { sheet: vi.fn() } },
    ] });
  });
  afterEach(() => { window.matchMedia = originalMatchMedia; localStorage.clear(); });

  async function render() {
    const fixture = TestBed.createComponent(AppComponent);
    await TestBed.inject(Router).navigateByUrl('/login');
    await fixture.whenStable();
    return fixture;
  }

  // jsdom no ejecuta la acción nativa de Tab: contamos los destinos nativos en orden DOM y comprobamos su foco.
  function stops(host: HTMLElement): HTMLElement[] {
    return [...host.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')]
      .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[hidden], [inert], [aria-hidden="true"]'));
  }

  it('el correo empieza vacío, incluso si había uno recordado; el ejemplo es una descripción', async () => {
    localStorage.setItem(LOGIN_REMEMBER_EMAIL_KEY, 'ana@cue.edu.co');
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    const email = host.querySelector<HTMLInputElement>('#login-email')!;
    expect(email.value).toBe('');
    expect(email.hasAttribute('placeholder')).toBe(false);
    const description = document.getElementById(email.getAttribute('aria-describedby')!);
    expect(description?.textContent).toBe('Por ejemplo: nombre@institucion.edu.co');
  });

  it('la contraseña se puede ver (botón con nombre que dice la acción) y pegar en los formularios del acceso (SIEP-263)', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    const password = host.querySelector<HTMLInputElement>('#login-password')!;
    const reveal = host.querySelector<HTMLButtonElement>('.ui-field__reveal')!;
    expect(reveal.getAttribute('aria-label')).toBe('Mostrar contraseña');
    reveal.click();
    await fixture.whenStable();
    expect(password.type).toBe('text');
    expect(reveal.getAttribute('aria-label')).toBe('Ocultar contraseña');
    // Pegar: ningún manejador cancela el evento y el valor entra por `input`, como lo hace el navegador al pegar.
    for (const input of host.querySelectorAll<HTMLInputElement>('input:not([type=checkbox]):not([tabindex="-1"])')) {
      const paste = new Event('paste', { bubbles: true, cancelable: true });
      input.dispatchEvent(paste);
      expect(paste.defaultPrevented, input.id).toBe(false);
      input.value = 'texto.pegado@example.test';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(input.value, input.id).toBe('texto.pegado@example.test');
    }
  });

  it('cuenta seis paradas hasta Ingresar usando el salto y deja todo lo secundario después', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    const all = stops(host);
    const skip = all[0] as HTMLAnchorElement;
    expect(skip.textContent?.trim()).toBe('Saltar al formulario');
    skip.focus();
    skip.click();
    expect(document.activeElement).toBe(host.querySelector('#acceso-titulo'));
    const form = host.querySelector('form')!;
    const essential = stops(form).slice(0, 5);
    expect(essential.map(el => el.id || el.getAttribute('aria-label') || el.getAttribute('type')))
      .toEqual(['login-email', 'login-password', 'Mostrar contraseña', 'checkbox', 'submit']);
    for (const el of essential) { el.focus(); expect(document.activeElement).toBe(el); }
    expect([skip, ...essential]).toHaveLength(6);
    const submitIndex = all.indexOf(essential[4]);
    expect(submitIndex + 1).toBe(9); // Sin activar el salto: también se recorren los tres controles de la barra.
    const secondary = stops(form).slice(5).map(el => el.textContent?.trim());
    expect(secondary.slice(0, 2)).toEqual(['¿Olvidaste tu contraseña?', 'Solicitar acceso']);
    expect(host.querySelectorAll('.acceso__paso')).toHaveLength(4);
    for (const el of host.querySelectorAll<HTMLElement>('.acceso__paso, .acceso__pausa')) {
      expect(all.indexOf(el)).toBeGreaterThan(submitIndex);
    }
    expect(all.some(el => el.tabIndex > 0)).toBe(false);
  });

  for (const selector of ['#login-email', '#login-password', 'input[type="checkbox"]']) {
    it(`Enter en ${selector} envía una sola vez`, async () => {
      const fixture = await render();
      const host = fixture.nativeElement as HTMLElement;
      for (const [id, value] of [['login-email', 'ana@cue.edu.co'], ['login-password', 'secreta']]) {
        const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      host.querySelector(selector)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(login).toHaveBeenCalledExactlyOnceWith('ana@cue.edu.co', 'secreta');
    });
  }

  it('la demo no aparece si el servidor no confirma disponibilidad o falla', async () => {
    demoConfig.mockReturnValue(throwError(() => new Error('sin conexión')));
    const fixture = await render();
    expect(fixture.nativeElement.querySelector('.acceso__demo')).toBeNull();
  });

  it('espera la confirmación del servidor y mantiene oculta una demo deshabilitada', async () => {
    const config = new Subject<{ enabled: boolean }>();
    demoConfig.mockReturnValue(config);
    const fixture = await render();
    expect(fixture.nativeElement.querySelector('.acceso__demo')).toBeNull();
    config.next({ enabled: false });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.acceso__demo')).toBeNull();
  });

  it('Enter con campos vacíos valida y enfoca el correo, sin autenticar', async () => {
    const fixture = await render();
    fixture.nativeElement.querySelector('#login-password').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(login).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('login-email');
    expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true');
  });

  it('la recuperación y la solicitud también presentan el ejemplo como ayuda', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    const click = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === label)!.click();
    for (const [label, id] of [['¿Olvidaste tu contraseña?', 'olvido-email'], ['Solicitar acceso', 'registro-email']]) {
      click(label);
      await fixture.whenStable();
      const email = host.querySelector<HTMLInputElement>(`#${id}`)!;
      expect(email.value).toBe('');
      expect(email.getAttribute('placeholder')).toBeNull();
      expect(document.getElementById(email.getAttribute('aria-describedby')!)?.textContent)
        .toBe('Por ejemplo: nombre@institucion.edu.co');
      if (id === 'olvido-email') {
        click('Volver a iniciar sesión');
        await fixture.whenStable();
      }
    }
  });

  it('un clic en demo anuncia el ingreso, autentica y navega al recibir la sesión', async () => {
    demoConfig.mockReturnValue(of({ enabled: true }));
    const result = new Subject<object>();
    login.mockReturnValue(result);
    const fixture = await render();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.acceso__demo button')).not.toBeNull();
    });
    const button = fixture.nativeElement.querySelector('.acceso__demo button') as HTMLButtonElement;
    button.focus();
    button.click();
    button.click();
    await fixture.whenStable();
    expect(login).toHaveBeenCalledExactlyOnceWith('estudiante@psychosim.edu.co', 'Estudiante123!');
    expect(fixture.nativeElement.querySelector('.acceso__estado[aria-live="polite"]').textContent)
      .toBe('Entrando como estudiante de demostración…');
    expect(localStorage.getItem(LOGIN_REMEMBER_EMAIL_KEY)).toBeNull();
    expect(document.activeElement).toBe(button);
    result.next({});
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/portal/dashboard');
  });

  it('si la demo falla, la retira, anuncia el error y devuelve el foco al formulario', async () => {
    demoConfig.mockReturnValue(of({ enabled: true }));
    login.mockReturnValue(throwError(() => new Error('sin conexión')));
    const fixture = await render();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.acceso__demo button')).not.toBeNull();
    });
    fixture.nativeElement.querySelector('.acceso__demo button').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.acceso__demo')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Revisa tu conexión');
    expect(document.activeElement?.id).toBe('acceso-titulo');
  });
});

