import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';

import {
  CONNECTION_MESSAGE,
  HttpErrorContext,
  HttpErrorHandler,
  PERMISSION_MESSAGE,
  SESSION_MESSAGE,
  buildHttpErrorChain,
  defaultHttpErrorHandlers,
} from './http-error-chain';
import { THROTTLED_FALLBACK_MESSAGE } from './throttled';

/** Pruebas de la cadena de eslabones de errores HTTP (P-08b). Sin TestBed ni HttpClient. */
describe('cadena de errores HTTP', () => {
  let ctxBase: Omit<HttpErrorContext, 'error' | 'url'>;
  let auth: { clearSession: ReturnType<typeof vi.fn>; requirePasswordChange: ReturnType<typeof vi.fn> };
  let router: { url: string; navigate: ReturnType<typeof vi.fn> };
  let notifications: { error: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auth = { clearSession: vi.fn(), requirePasswordChange: vi.fn() };
    router = { url: '/dashboard', navigate: vi.fn() };
    notifications = { error: vi.fn(), warning: vi.fn() };
    ctxBase = { auth: auth as never, router: router as never, notifications: notifications as never };
  });

  const http = (status: number) => new HttpErrorResponse({ status, statusText: 'err' });
  const run = (error: unknown, url = '/api/cosa') => buildHttpErrorChain().handle({ ...ctxBase, error, url });
  const effects = () => ({
    clear: auth.clearSession.mock.calls.length,
    nav: router.navigate.mock.calls.length,
    err: notifications.error.mock.calls.length,
    warn: notifications.warning.mock.calls.length,
  });

  it('el orden contractual de los eslabones', () => {
    expect(defaultHttpErrorHandlers().map(h => h.constructor.name)).toEqual([
      'NonHttpErrorHandler',
      'LoginErrorHandler',
      'ThrottledHandler',
      'UnauthorizedHandler',
      'InactiveUserHandler',
      'PasswordChangeRequiredHandler',
      'ConsentRequiredHandler',
      'ForbiddenHandler',
      'NoConnectionHandler',
    ]);
  });

  // req: ETH-01, SIEP-RF-05 (S3-2b: el 403 CONSENT_REQUIRED no es falta de permisos; lo explica el aviso del juego)
  describe('consentimiento exigido por el servidor', () => {
    const consentRequired = (status = 403) => new HttpErrorResponse({
      status, statusText: 'Forbidden',
      error: { success: false, code: 'CONSENT_REQUIRED', message: 'Para continuar necesitas leer y aceptar el aviso.', noticeVersion: 'v-vigente' },
    });

    it('no avisa de «No tienes permisos» ni toca la sesión ni navega: la pantalla de juego vuelve al aviso', () => {
      run(consentRequired(), '/api/simulation/attempts/a1/world');
      expect(notifications.warning).not.toHaveBeenCalledWith(PERMISSION_MESSAGE);
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 });
    });

    it('lo atiende el eslabón del consentimiento, no el de permisos', () => {
      const handlers = defaultHttpErrorHandlers();
      const consent = handlers.find(handler => handler.constructor.name === 'ConsentRequiredHandler')!;
      const forbidden = handlers.find(handler => handler.constructor.name === 'ForbiddenHandler')!;
      const ctx: HttpErrorContext = { ...ctxBase, error: consentRequired(), url: '/api/simulation/attempts/a1/decisions' };
      expect((consent as unknown as { canHandle(c: HttpErrorContext): boolean }).canHandle(ctx)).toBe(true);
      expect(handlers.indexOf(consent)).toBeLessThan(handlers.indexOf(forbidden));
    });

    it('cualquier otro 403 sigue siendo falta de permisos', () => {
      run(new HttpErrorResponse({ status: 403, error: { success: false, code: 'DATA_TREATMENT_CONSENT_REQUIRED', message: 'x' } }));
      expect(notifications.warning).toHaveBeenCalledWith(PERMISSION_MESSAGE);
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 1 });
    });

    it('el mismo código con otro estado no lo atiende este eslabón', () => {
      run(consentRequired(409), '/api/simulation/attempts/a1/world');
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 }); // 409: no lo atiende nadie
      run(consentRequired(401), '/api/simulation/attempts/a1/world');
      expect(auth.clearSession).toHaveBeenCalledTimes(1); // 401: sigue siendo sesión inválida
    });

    it('el cambio de contraseña obligatorio manda sobre el consentimiento (su eslabón va antes)', () => {
      router.url = '/portal/simulador/7';
      run(new HttpErrorResponse({ status: 403, error: { success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'x' } }), '/api/simulation/attempts/a1/world');
      expect(auth.requirePasswordChange).toHaveBeenCalledTimes(1);
    });
  });

  // req: RN-10 (E2-9: hasta cambiar la contraseña temporal, el servidor responde 403 PASSWORD_CHANGE_REQUIRED a todo)
  describe('cambio de contraseña obligatorio', () => {
    const passwordChange = () => new HttpErrorResponse({
      status: 403, statusText: 'Forbidden',
      error: { success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Debes cambiar tu contraseña temporal antes de continuar.' },
    });

    it('lleva a «Cambia tu contraseña» con la ruta en la que estaba, sin «No tienes permisos» ni cerrar la sesión', () => {
      router.url = '/portal/grupos?pagina=2';
      run(passwordChange(), '/api/grupos');
      expect(auth.requirePasswordChange).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledWith(['/cambiar-contrasena'], { queryParams: { returnUrl: '/portal/grupos?pagina=2' } });
      expect(effects()).toEqual({ clear: 0, nav: 1, err: 0, warn: 0 });
    });

    it('estando ya en «Cambia tu contraseña» no vuelve a navegar', () => {
      router.url = '/cambiar-contrasena?returnUrl=%2Fportal%2Fgrupos';
      run(passwordChange(), '/api/grupos');
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 });
    });

    // E2-2: una pantalla que explica su propio 403 (rúbrica de solo lectura) no recibe además el aviso genérico.
    it('un 403 que la pantalla explica (`screenHandlesForbidden`) no dispara el aviso de permiso', () => {
      buildHttpErrorChain().handle({ ...ctxBase, error: http(403), url: '/api/rubrics/4', screenHandlesForbidden: true });
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 });
    });

    // V3 (REGLA-004): la pausa sin red ya la explica la pantalla de pausa; el aviso de conexión le taparía el título.
    it('una petición sin red que la pantalla explica (`screenHandlesOffline`) no dispara el aviso de conexión', () => {
      buildHttpErrorChain().handle({ ...ctxBase, error: http(0), url: '/api/simulation/attempts/a/safe-exit', screenHandlesOffline: true });
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 });
      buildHttpErrorChain().handle({ ...ctxBase, error: http(0), url: '/api/simulation/attempts/a/safe-exit' });
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 1, warn: 0 });
    });

    it('…pero el cambio de contraseña obligatorio manda igual', () => {
      router.url = '/portal/rubricas';
      buildHttpErrorChain().handle({ ...ctxBase, error: passwordChange(), url: '/api/rubrics/4', screenHandlesForbidden: true });
      expect(router.navigate).toHaveBeenCalledWith(['/cambiar-contrasena'], { queryParams: { returnUrl: '/portal/rubricas' } });
    });

    it('un 403 con otro código sigue siendo falta de permisos', () => {
      run(new HttpErrorResponse({ status: 403, error: { code: 'FORBIDDEN', message: 'No tiene permisos' } }));
      expect(notifications.warning).toHaveBeenCalledWith(PERMISSION_MESSAGE);
      expect(auth.requirePasswordChange).not.toHaveBeenCalled();
    });
  });

  describe('cada eslabón atiende lo suyo', () => {
    it('un error que no es HTTP avisa de conexión', () => {
      run(new Error('boom'));
      expect(notifications.error).toHaveBeenCalledWith(CONNECTION_MESSAGE);
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 1, warn: 0 });
    });

    it('401: limpia la sesión, avisa y navega al login recordando dónde estaba (returnUrl, plan visual F3-6 / H-34)', () => {
      router.url = '/portal/grupos?pagina=2';
      run(http(401));
      expect(notifications.warning).toHaveBeenCalledWith(SESSION_MESSAGE);
      expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/portal/grupos?pagina=2' } });
      expect(effects()).toEqual({ clear: 1, nav: 1, err: 0, warn: 1 });
    });

    it('401 estando en /login: limpia la sesión sin avisar ni navegar', () => {
      router.url = '/login?next=%2Fa';
      run(http(401));
      expect(effects()).toEqual({ clear: 1, nav: 0, err: 0, warn: 0 });
    });

    it('403 en /api/auth/me es sesión inválida, no falta de permisos (sin returnUrl: un usuario inactivo no vuelve)', () => {
      run(http(403), '/api/auth/me');
      expect(notifications.warning).toHaveBeenCalledWith(SESSION_MESSAGE);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
      expect(effects()).toEqual({ clear: 1, nav: 1, err: 0, warn: 1 });
    });

    it('403 en /api/auth/me estando en /login no avisa ni navega', () => {
      router.url = '/login';
      run(http(403), '/api/auth/me');
      expect(effects()).toEqual({ clear: 1, nav: 0, err: 0, warn: 0 });
    });

    // req: SIEP-RNF-04 (S1-4: cerrar sesión con un token ya revocado no avisa de «sesión vencida»)
    it('un 401 al cerrar sesión no avisa ni navega: la persona acaba de salir', () => {
      run(http(401), '/api/auth/logout');
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 });
    });

    it('403 en otra ruta avisa de permisos y conserva la sesión', () => {
      run(http(403));
      expect(notifications.warning).toHaveBeenCalledWith(PERMISSION_MESSAGE);
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 1 });
    });

    it('status 0 avisa de conexión y conserva la sesión', () => {
      run(http(0));
      expect(notifications.error).toHaveBeenCalledWith(CONNECTION_MESSAGE);
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 1, warn: 0 });
    });

    it.each([400, 404, 409, 422, 500])('el %i no lo atiende nadie', status => {
      run(http(status));
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 });
    });
  });

  // req: DJA-2 (S1-2: el limitador responde 429 con el texto y los segundos de espera)
  describe('429 del limitador', () => {
    const throttled = (body?: unknown, headers?: Record<string, string>) =>
      new HttpErrorResponse({ status: 429, statusText: 'Too Many Requests', error: body, headers: new HttpHeaders(headers) });

    it('avisa con el texto del servidor y no toca la sesión ni navega', () => {
      const message = 'Demasiados intentos. Espera 30 s e inténtalo de nuevo.';
      run(throttled({ code: 'THROTTLED', message, retryAfter: 30 }), '/api/admin/users/approve');
      expect(notifications.warning).toHaveBeenCalledWith(message);
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 1 });
    });

    it('sin texto del servidor usa los segundos de Retry-After o, si no hay nada, el de respaldo', () => {
      run(throttled(undefined, { 'Retry-After': '20' }), '/api/grupos/3/estudiantes/import');
      expect(notifications.warning).toHaveBeenLastCalledWith('Demasiados intentos. Espera 20 s e inténtalo de nuevo.');
      run(throttled(), '/api/grupos/3/estudiantes/import');
      expect(notifications.warning).toHaveBeenLastCalledWith(THROTTLED_FALLBACK_MESSAGE);
    });

    // La generación de casos con IA explica sus 429 en su pantalla (el tope del día en «Describe tu caso», los intentos
    // agotados junto a la parte que falló en el avance): el aviso global los repetiría y los anunciaría dos veces.
    it.each(['/api/auth/login', '/api/auth/google', '/api/auth/access-request', '/api/authoring/generations/6f1d3c2a/scenes/consulta'])(
      '%s lo explica su propia pantalla: la cadena no avisa además', url => {
        run(throttled({ message: 'Demasiados intentos. Espera 5 s e inténtalo de nuevo.' }), url);
        expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 });
      });
  });

  describe('el primero que reconoce el error corta la cadena', () => {
    it.each([0, 401, 403, 500])('en el login el %i no produce efectos aunque otro eslabón lo reconocería', status => {
      run(http(status), '/api/auth/login');
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 });
    });

    it('un error no HTTP en el login igual avisa (el eslabón no-HTTP va antes)', () => {
      run(new Error('boom'), '/api/auth/login');
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 1, warn: 0 });
    });

    it('403 en /me no pasa además por el eslabón de permisos', () => {
      run(http(403), '/api/auth/me');
      expect(notifications.warning).toHaveBeenCalledTimes(1);
      expect(notifications.warning).not.toHaveBeenCalledWith(PERMISSION_MESSAGE);
    });

    it('un solo eslabón actúa por error: el 401 limpia la sesión una sola vez', () => {
      run(http(401));
      expect(auth.clearSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('la cadena es extensible', () => {
    class Spy extends HttpErrorHandler {
      calls = 0;
      constructor(private readonly status: number) {
        super();
      }
      protected canHandle(ctx: HttpErrorContext): boolean {
        return ctx.error instanceof HttpErrorResponse && ctx.error.status === this.status;
      }
      protected apply(): void {
        this.calls++;
      }
    }

    it('un eslabón nuevo se agrega sin tocar los demás y recibe solo lo suyo', () => {
      const teapot = new Spy(418);
      const chain = buildHttpErrorChain([...defaultHttpErrorHandlers(), teapot]);
      chain.handle({ ...ctxBase, error: http(418), url: '/api/cosa' });
      chain.handle({ ...ctxBase, error: http(500), url: '/api/cosa' });
      expect(teapot.calls).toBe(1);
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 });
    });

    it('un eslabón puesto antes tapa a los siguientes', () => {
      const early = new Spy(401);
      buildHttpErrorChain([early, ...defaultHttpErrorHandlers()]).handle({ ...ctxBase, error: http(401), url: '/api/cosa' });
      expect(early.calls).toBe(1);
      expect(auth.clearSession).not.toHaveBeenCalled();
    });

    it('con un solo eslabón la cadena funciona y lo que no reconoce se ignora', () => {
      const only = new Spy(1);
      const chain = buildHttpErrorChain([only]);
      chain.handle({ ...ctxBase, error: http(2), url: '/x' });
      expect(only.calls).toBe(0);
    });

    it('setNext devuelve el eslabón recibido para poder encadenar', () => {
      const a = new Spy(1);
      const b = new Spy(2);
      expect(a.setNext(b)).toBe(b);
    });
  });
});
