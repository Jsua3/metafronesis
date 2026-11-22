import { HttpErrorResponse } from '@angular/common/http';
import { CSP_NONCE, Component, Provider, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { Observable, Subject, of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { TemaService } from '../../core/tema/tema.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { LoginComponent } from './login.component';

@Component({ template: '' })
class Screen {}

/**
 * Acceso (plan visual F4-2; rediseño Metafrónesis 2026-11-20), en DOM: etiqueta visible en cada campo (H-29), un
 * campo dice su error al salir de él solo si ya se escribió algo y al enviar se ven todos y el foco va al primero,
 * botón que dice que trabaja y no envía dos veces, foco al encabezado al alternar formularios (nunca a body), fallo
 * de Google visible, aviso de alcance (RN-01), una sola imagen fija de la escena, nada que se mueva solo y la piel
 * del tema en el contenedor de la página.
 */
// req: BLOQUE-H (H-21, H-28, H-29), RNF-04, RN-01
describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let login: ReturnType<typeof vi.fn>;
  let googleConfig: () => Observable<{ enabled: boolean; clientId?: string }>;
  let requestAccess: (payload?: unknown) => Observable<unknown>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** Texto que se lee de una etiqueta (sin el «*» decorativo de obligatorio, que es aria-hidden). */
  const spoken = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
    return text(copy);
  };
  const originalMatchMedia = window.matchMedia;

  async function render(extraProviders: Provider[] = []): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        ...extraProviders,
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Screen }]),
        { provide: AuthService, useValue: { login, googleConfig: () => googleConfig(), requestAccess: (payload: unknown) => requestAccess(payload) } },
        { provide: UiDialog, useValue: { sheet: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
  }

  const form = () => host().querySelector('form')!;
  const submit = () => form().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const button = (label: string) => [...host().querySelectorAll<HTMLButtonElement>('button')].find(b => text(b) === label)!;

  beforeEach(() => {
    login = vi.fn(() => of({}));
    requestAccess = () => of({});
    googleConfig = () => of({ enabled: false });
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    try { localStorage.removeItem('metafronesis.tema'); } catch { /* sin almacenamiento */ }
  });

  it('cada campo del formulario de entrada tiene etiqueta visible asociada (no solo placeholder)', async () => {
    await render();
    const labels = [...form().querySelectorAll('ui-field')].map(field => {
      const label = field.querySelector('label')!;
      return { label: spoken(label), control: !!form().querySelector(`#${label.getAttribute('for')}`) };
    });
    expect(labels).toEqual([{ label: 'Correo institucional', control: true }, { label: 'Contraseña', control: true }]);
  });

  it('al enviar vacío muestra todos los errores, lleva el foco al primero y no llama al servidor; el botón nunca se deshabilita por eso', async () => {
    await render();
    expect(submit().disabled).toBe(false);
    submit().click();
    await fixture.whenStable();
    expect(form().querySelectorAll('ui-field.ui-field--invalid')).toHaveLength(2);
    expect(document.activeElement).toBe(form().querySelector('input[type="email"]'));
    expect(login).not.toHaveBeenCalled();
  });

  it('mientras entra, el botón dice que trabaja (aria-busy) y un segundo clic no envía otra vez', async () => {
    const pending = new Subject<unknown>();
    login = vi.fn(() => pending);
    await render();
    fixture.componentInstance.form.setValue({ email: 'ana@cue.edu.co', password: 'secreta', remember: false });
    submit().click();
    await fixture.whenStable();
    expect(submit().getAttribute('aria-busy')).toBe('true');
    submit().click();
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('alternar a «Solicitar acceso» deja UN formulario, con etiquetas, y lleva el foco a su encabezado; volver, igual', async () => {
    await render();
    button('Solicitar acceso').click();
    await fixture.whenStable();
    expect(host().querySelectorAll('form')).toHaveLength(1);
    expect(document.activeElement).toBe(host().querySelector('h1'));
    expect(text(host().querySelector('h1'))).toBe('Solicitar acceso');
    expect([...form().querySelectorAll('ui-field label')].map(spoken)).toEqual(['Nombre', 'Apellido', 'Correo institucional']);
    button('Ya tengo cuenta').click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(host().querySelector('h1'));
    expect(text(host().querySelector('h1'))).toBe('Iniciar sesión');
  });

  // Rediseño 2026-11-20: la casilla guarda el CORREO en este navegador (no la sesión): su texto lo dice.
  it('«Recordar mi correo» es una fila entera pulsable (ui-check) y el aviso de alcance (RN-01) está en el acceso', async () => {
    await render();
    const remember = form().querySelector('label.ui-check')!;
    expect(text(remember)).toBe('Recordar mi correo');
    expect(remember.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(host().querySelector('ui-scope-notice')).not.toBeNull();
  });

  it('al recibir el foco tras enviar vacío, el campo ya dice que es inválido y por qué (revisión de F4, I-3)', async () => {
    await render();
    const email = form().querySelector<HTMLInputElement>('input[type="email"]')!;
    email.value = '';
    email.dispatchEvent(new Event('input'));
    let atFocus: { invalid: string | null; message: string } | null = null;
    email.addEventListener('focus', () => {
      const describedBy = email.getAttribute('aria-describedby') ?? '';
      atFocus = { invalid: email.getAttribute('aria-invalid'), message: describedBy.split(' ').map(id => text(host().querySelector(`#${id}`))).join(' ') };
    });
    submit().click();
    await fixture.whenStable();
    expect(atFocus).toEqual({ invalid: 'true', message: 'Escribe tu correo institucional.' });
  });

  // Guía de psicología de interfaces §5 (rediseño 2026-11-20): no validar antes de que la persona escriba; validar al
  // salir del campo; el mensaje se va en cuanto el campo queda bien y lo escrito se conserva.
  it('un campo vacío que solo se recorre no grita; con algo escrito, dice qué revisar al salir y se calla al corregirlo', async () => {
    await render();
    const email = form().querySelector<HTMLInputElement>('#login-email')!;
    const password = form().querySelector<HTMLInputElement>('#login-password')!;
    const errors = () => [...form().querySelectorAll('ui-field.ui-field--invalid .ui-field__message')].map(text);

    password.dispatchEvent(new Event('focus'));
    password.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(errors()).toEqual([]);

    email.value = 'ana@';
    email.dispatchEvent(new Event('input'));
    email.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(errors()).toEqual(['Revisa el correo: debe verse como nombre@institucion.edu.co.']);
    expect(errors().join(' ')).not.toMatch(/inv[aá]lid|incorrect/i);

    email.value = 'ana@cue.edu.co';
    email.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(errors()).toEqual([]);
    expect(email.value).toBe('ana@cue.edu.co');
  });

  it('una clave que no coincide da el mismo mensaje que un correo que no existe: sin culpa y con salida', async () => {
    login = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })));
    await render();
    fixture.componentInstance.form.setValue({ email: 'ana@cue.edu.co', password: 'otra', remember: false });
    submit().click();
    await fixture.whenStable();
    const message = text(host().querySelector('.acceso__error[role="alert"]'));
    expect(message).toBe('No encontramos esa combinación de correo y contraseña. Revísala o usa «¿Olvidaste tu contraseña?».');
    expect(message).not.toMatch(/inv[aá]lid|incorrect/i);
    expect(fixture.componentInstance.form.controls.email.value).toBe('ana@cue.edu.co');
  });

  it('la piel la pone el tema en el contenedor de la página (claro = portal, oscuro = juego), nunca fija', async () => {
    await render();
    const page = () => host().querySelector('.acceso.publico')!;
    expect(page().getAttribute('data-skin')).toBe('portal');
    expect(host().querySelector('.acceso__panel')!.hasAttribute('data-skin')).toBe(false);
    TestBed.inject(TemaService).fijar('oscuro');
    await fixture.whenStable();
    expect(page().getAttribute('data-skin')).toBe('game');
    TestBed.inject(TemaService).fijar('sistema');
  });

  it('una región de estado SIEMPRE presente anuncia «Ingresando…», «Enviando solicitud…» y el resultado (I-4, M-5)', async () => {
    const pending = new Subject<unknown>();
    login = vi.fn(() => pending);
    await render();
    const status = () => host().querySelector('.acceso__estado[role="status"]');
    expect(status()).not.toBeNull();
    expect(text(status())).toBe('');
    fixture.componentInstance.form.setValue({ email: 'ana@cue.edu.co', password: 'secreta', remember: false });
    submit().click();
    await fixture.whenStable();
    expect(text(status())).toBe('Ingresando…');

    button('Solicitar acceso').click();
    await fixture.whenStable();
    fixture.componentInstance.registerForm.setValue({ nombre: 'Ana', apellido: 'Ruiz', email: 'ana@cue.edu.co', website: '' });
    submit().click();
    await fixture.whenStable();
    expect(text(status())).toBe('Solicitud enviada. El equipo académico revisará tu acceso y te contactará por correo.');
  });

  it('el botón de Google se vuelve a pintar al volver al formulario de entrada (revisión de F4, I-2)', async () => {
    const renderButton = vi.fn();
    (globalThis as { google?: unknown }).google = { accounts: { id: { initialize: vi.fn(), renderButton } } };
    googleConfig = () => of({ enabled: true, clientId: 'cliente-demo' });
    try {
      await render();
      await vi.waitFor(() => expect(renderButton).toHaveBeenCalledTimes(1));
      button('Solicitar acceso').click();
      await fixture.whenStable();
      button('Ya tengo cuenta').click();
      await fixture.whenStable();
      await vi.waitFor(() => expect(renderButton).toHaveBeenCalledTimes(2));
      expect(renderButton.mock.calls[1][0]).toBe(host().querySelector('.acceso__google-btn'));
    } finally {
      delete (globalThis as { google?: unknown }).google;
    }
  });

  it('si el acceso con Google no carga, lo dice en vez de desaparecer en silencio', async () => {
    googleConfig = () => of({ enabled: true, clientId: 'cliente-demo' });
    vi.spyOn(LoginComponent.prototype as unknown as { loadGoogleScript(): Promise<void> }, 'loadGoogleScript')
      .mockRejectedValue(new Error('sin red'));
    await render();
    await vi.waitFor(() => expect(text(host())).toContain('El acceso con Google no está disponible ahora.'));
  });

  // req: RNF-002 (S2-4: con la CSP en vigor, Google Identity Services copia el nonce de SU script a la hoja que inyecta)
  describe('script de Google bajo la política de contenido', () => {
    const gsiScript = () => document.getElementById('google-gsi-script') as HTMLScriptElement | null;
    // La prueba anterior de Google espía loadGoogleScript sin restaurarlo: aquí se necesita el método de verdad.
    beforeEach(() => vi.restoreAllMocks());
    afterEach(() => gsiScript()?.remove());

    it('lleva el nonce de la página (CSP_NONCE): sin él Google inyecta una hoja que la política bloquea', async () => {
      googleConfig = () => of({ enabled: true, clientId: 'cliente-demo' });
      await render([{ provide: CSP_NONCE, useValue: 'nonce-de-la-pagina' }]);
      await vi.waitFor(() => expect(gsiScript()).not.toBeNull());
      expect(gsiScript()!.nonce || gsiScript()!.getAttribute('nonce')).toBe('nonce-de-la-pagina');
      expect(gsiScript()!.src).toBe('https://accounts.google.com/gsi/client');
    });

    it('control negativo: sin política (sin nonce) el script se pide igual y no lleva ninguno', async () => {
      googleConfig = () => of({ enabled: true, clientId: 'cliente-demo' });
      await render([{ provide: CSP_NONCE, useValue: null }]);
      await vi.waitFor(() => expect(gsiScript()).not.toBeNull());
      expect(gsiScript()!.nonce || gsiScript()!.getAttribute('nonce') || '').toBe('');
    });
  });

  // req: LW-17 (S1-3: campo trampa contra el envío automático de solicitudes de acceso)
  describe('campo trampa de la solicitud de acceso', () => {
    it('existe fuera de la tabulación y oculto a lectores de pantalla, y viaja vacío con la solicitud', async () => {
      const requestAccessSpy = vi.fn(() => of({}));
      requestAccess = requestAccessSpy;
      await render();
      button('Solicitar acceso').click();
      await fixture.whenStable();
      const trap = host().querySelector<HTMLInputElement>('#registro-sitio')!;
      expect(trap).not.toBeNull();
      expect(trap.tabIndex).toBe(-1);
      expect(trap.getAttribute('autocomplete')).toBe('off');
      expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(trap.value).toBe('');

      fixture.componentInstance.registerForm.setValue({ nombre: 'Ana', apellido: 'Ruiz', email: 'ana@cue.edu.co', website: '' });
      submit().click();
      await fixture.whenStable();
      expect(requestAccessSpy).toHaveBeenCalledWith({ nombre: 'Ana', apellido: 'Ruiz', email: 'ana@cue.edu.co', website: '' });
    });
  });

  // req: DJA-2 (S1-2: el limitador responde 429 con el texto y los segundos de espera)
  describe('429 del limitador', () => {
    const throttled = () => new HttpErrorResponse({
      status: 429, statusText: 'Too Many Requests',
      error: { success: false, code: 'THROTTLED', message: 'Demasiados intentos. Espera 40 s e inténtalo de nuevo.', retryAfter: 40 },
    });

    it('al entrar muestra el texto del servidor con la espera y deja volver a intentar', async () => {
      login = vi.fn(() => throwError(() => throttled()));
      await render();
      fixture.componentInstance.form.setValue({ email: 'ana@cue.edu.co', password: 'secreta', remember: false });
      submit().click();
      await fixture.whenStable();
      expect(text(host().querySelector('.acceso__error'))).toBe('Demasiados intentos. Espera 40 s e inténtalo de nuevo.');
      expect(submit().getAttribute('aria-busy')).not.toBe('true');
    });

    it('al solicitar acceso muestra el mismo texto en su propia región de error', async () => {
      requestAccess = () => throwError(() => throttled());
      await render();
      button('Solicitar acceso').click();
      await fixture.whenStable();
      fixture.componentInstance.registerForm.setValue({ nombre: 'Ana', apellido: 'Ruiz', email: 'ana@cue.edu.co', website: '' });
      submit().click();
      await fixture.whenStable();
      expect(text(host().querySelector('.acceso__error'))).toBe('Demasiados intentos. Espera 40 s e inténtalo de nuevo.');
    });
  });

  // H-22 / WCAG 2.2.2 (rediseño 2026-11-20): antes, partículas con botón de pausa; ahora nada se mueve solo en el
  // acceso, así que no hay nada que pausar (y la guía §2 pide calma antes de entrar a un caso sensible).
  it('nada se mueve solo en el acceso: sin capa de partículas, sin video y sin reproducción automática', async () => {
    await render();
    expect(host().querySelector('app-siep-particle-layer')).toBeNull();
    expect(host().querySelector('video, [autoplay], canvas')).toBeNull();
  });

  it('la escena real del simulador se pinta una sola vez, en WebP liviano, con su tamaño y texto alternativo', async () => {
    // Rediseño 2026-11-20: la escena de la portada (581 × 415). Sigue el presupuesto de F4-4 (antes 18 KB + 43 KB).
    await render();
    const scenes = host().querySelectorAll<HTMLImageElement>('.acceso__panel img');
    expect(scenes).toHaveLength(1);
    expect(scenes[0].getAttribute('src')).toBe('assets/images/institution/escena-portada.webp');
    expect([scenes[0].getAttribute('width'), scenes[0].getAttribute('height')]).toEqual(['581', '415']);
    // En escritorio es el elemento de mayor pintura (LCP): no se difiere (Angular lo advierte, NG0913); pesa < 40 KB.
    expect(scenes[0].getAttribute('loading')).not.toBe('lazy');
    expect(scenes[0].getAttribute('alt')!.length).toBeGreaterThan(20);
    const file = join(__dirname, '..', '..', '..', 'assets/images/institution/escena-portada.webp');
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThan(40 * 1024);
  });
});
