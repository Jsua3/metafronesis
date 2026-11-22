import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';

import { NotificationService } from '../notifications/notification.service';
import { AuthService } from './auth.service';
import { watchConnectionRecovery } from '../notifications/connection-recovery';
import { CONNECTION_MESSAGE, SCREEN_HANDLES_FORBIDDEN } from './http-error-chain';
import { jwtInterceptor } from './jwt.interceptor';

/**
 * Caracteriza el comportamiento actual de `jwtInterceptor` (cabecera Bearer y manejo de
 * 401/403/sin conexión). Sirve de red de seguridad antes de partirlo en interceptores
 * encadenados (patrón Chain of Responsibility): el contrato que dependen los componentes
 * es `HANDLED_BY_INTERCEPTOR = {0, 401, 403}` de `api-error.util.ts`.
 */
describe('jwtInterceptor', () => {
  const SESSION_MESSAGE = 'Tu sesión ya no es válida o tu usuario está inactivo. Contacta al administrador.';
  const PERMISSION_MESSAGE = 'No tienes permisos para realizar esta acción.';

  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: { getToken: ReturnType<typeof vi.fn>; isTokenExpired: ReturnType<typeof vi.fn>; clearSession: ReturnType<typeof vi.fn> };
  let router: { url: string; navigate: ReturnType<typeof vi.fn> };
  let notifications: { error: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn>; dismissMatching: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auth = {
      getToken: vi.fn().mockReturnValue('jwt-valido'),
      isTokenExpired: vi.fn().mockReturnValue(false),
      clearSession: vi.fn(),
    };
    router = { url: '/dashboard', navigate: vi.fn() };
    notifications = { error: vi.fn(), warning: vi.fn(), dismissMatching: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        { provide: NotificationService, useValue: notifications },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function fail(url: string, status: number, body: object = { message: 'x' }) {
    let error: { status: number } | undefined;
    http.get(url).subscribe({ error: e => (error = e) });
    const req = httpMock.expectOne(url);
    if (status === 0) {
      req.error(new ProgressEvent('error'));
    } else {
      req.flush(body, { status, statusText: 'err' });
    }
    return error;
  }

  describe('cabecera Authorization', () => {
    it('agrega el Bearer cuando hay un token vigente', () => {
      http.get('/api/cosa').subscribe();

      const req = httpMock.expectOne('/api/cosa');
      expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-valido');
      req.flush({});
    });

    // req: SIEP-RNF-04 (S1-4: el token solo viaja a la propia API)
    it('no la agrega a una URL absoluta de un tercero ni a una protocolo-relativa', () => {
      http.get('https://otro.sitio/api/cosa').subscribe();
      const ajena = httpMock.expectOne('https://otro.sitio/api/cosa');
      expect(ajena.request.headers.has('Authorization')).toBe(false);
      ajena.flush({});

      http.get('//otro.sitio/api/cosa').subscribe();
      const relativa = httpMock.expectOne('//otro.sitio/api/cosa');
      expect(relativa.request.headers.has('Authorization')).toBe(false);
      relativa.flush({});
    });

    it('la agrega a una URL absoluta del mismo origen y no a rutas que no son de la API', () => {
      const propia = `${location.origin}/api/cosa`;
      http.get(propia).subscribe();
      const mismoOrigen = httpMock.expectOne(propia);
      expect(mismoOrigen.request.headers.get('Authorization')).toBe('Bearer jwt-valido');
      mismoOrigen.flush({});

      http.get('/assets/mundo/fondo.webp').subscribe();
      const estatico = httpMock.expectOne('/assets/mundo/fondo.webp');
      expect(estatico.request.headers.has('Authorization')).toBe(false);
      estatico.flush({});
    });

    it('no la agrega sin token', () => {
      auth.getToken.mockReturnValue(null);
      http.get('/api/cosa').subscribe();

      const req = httpMock.expectOne('/api/cosa');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });

    it('no la agrega si el token está vencido', () => {
      auth.isTokenExpired.mockReturnValue(true);
      http.get('/api/cosa').subscribe();

      const req = httpMock.expectOne('/api/cosa');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });

    it('no la agrega en el login aunque haya token guardado', () => {
      http.post('/api/auth/login', {}).subscribe();

      const req = httpMock.expectOne('/api/auth/login');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });

    it('conserva el resto de las cabeceras de la petición', () => {
      http.get('/api/cosa', { headers: { 'X-SIEP-Attempt-Token': 't' } }).subscribe();

      const req = httpMock.expectOne('/api/cosa');
      expect(req.request.headers.get('X-SIEP-Attempt-Token')).toBe('t');
      expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-valido');
      req.flush({});
    });
  });

  describe('respuestas correctas', () => {
    it('no toca la sesión ni avisa', () => {
      http.get('/api/cosa').subscribe();
      httpMock.expectOne('/api/cosa').flush({ ok: true });

      expect(auth.clearSession).not.toHaveBeenCalled();
      expect(notifications.error).not.toHaveBeenCalled();
      expect(notifications.warning).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('401', () => {
    it('limpia la sesión, avisa y lleva al login con la ruta en la que estaba (returnUrl)', () => {
      const error = fail('/api/cosa', 401);

      expect(error?.status).toBe(401);
      expect(auth.clearSession).toHaveBeenCalledTimes(1);
      expect(notifications.warning).toHaveBeenCalledWith(SESSION_MESSAGE);
      expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/dashboard' } });
    });

    it('si ya está en /login limpia la sesión pero no avisa ni navega', () => {
      router.url = '/login?returnUrl=%2Fdashboard';

      fail('/api/cosa', 401);

      expect(auth.clearSession).toHaveBeenCalledTimes(1);
      expect(notifications.warning).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('también limpia la sesión en rutas con token de intento (cualquier 401)', () => {
      let status: number | undefined;
      http.get('/api/simulation/attempts/a/world', { headers: { 'X-SIEP-Attempt-Token': 't' } })
        .subscribe({ error: e => (status = e.status) });
      httpMock.expectOne('/api/simulation/attempts/a/world').flush({}, { status: 401, statusText: 'x' });

      expect(status).toBe(401);
      expect(auth.clearSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('403', () => {
    it('en /api/auth/me se trata como sesión inválida', () => {
      const error = fail('/api/auth/me', 403);

      expect(error?.status).toBe(403);
      expect(auth.clearSession).toHaveBeenCalledTimes(1);
      expect(notifications.warning).toHaveBeenCalledWith(SESSION_MESSAGE);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('en /api/auth/me estando en /login no avisa ni navega', () => {
      router.url = '/login';

      fail('/api/auth/me', 403);

      expect(auth.clearSession).toHaveBeenCalledTimes(1);
      expect(notifications.warning).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('en otra ruta avisa de falta de permisos y conserva la sesión', () => {
      const error = fail('/api/grupos', 403);

      expect(error?.status).toBe(403);
      expect(notifications.warning).toHaveBeenCalledWith(PERMISSION_MESSAGE);
      expect(auth.clearSession).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    // req: RNF-002 (E2-2: la pantalla de Rúbricas explica su 403 de solo lectura)
    it('si la petición dice que su pantalla explica el 403, no avisa y el error sigue llegando a la pantalla', () => {
      let error: { status: number } | undefined;
      http.put('/api/rubrics/4', {}, { context: new HttpContext().set(SCREEN_HANDLES_FORBIDDEN, true) })
        .subscribe({ error: e => (error = e) });
      httpMock.expectOne('/api/rubrics/4').flush({ message: 'x' }, { status: 403, statusText: 'err' });

      expect(error?.status).toBe(403);
      expect(notifications.warning).not.toHaveBeenCalled();
    });

    // req: ETH-01, SIEP-RF-05 (S3-2b: el consentimiento exigido lo explica el aviso del juego, no «No tienes permisos»)
    it('un 403 CONSENT_REQUIRED no avisa de permisos ni toca la sesión, y el error sigue llegando a la pantalla de juego', () => {
      const error = fail('/api/simulation/attempts/a1/world', 403, {
        success: false, code: 'CONSENT_REQUIRED', message: 'Para continuar necesitas leer y aceptar el aviso.', noticeVersion: 'v',
      }) as { status: number; error: { code: string } } | undefined;

      expect(error?.status).toBe(403);
      expect(error?.error.code).toBe('CONSENT_REQUIRED');
      expect(notifications.warning).not.toHaveBeenCalled();
      expect(auth.clearSession).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('sin conexión (status 0)', () => {
    it('avisa con un error y conserva la sesión', () => {
      const error = fail('/api/cosa', 0);

      expect(error?.status).toBe(0);
      expect(notifications.error).toHaveBeenCalledWith(CONNECTION_MESSAGE);
      expect(auth.clearSession).not.toHaveBeenCalled();
    });

    it('un error que no es HTTP (p. ej. lanzado por otro interceptor) avisa igual y se propaga', () => {
      const boom = new Error('boom');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(
            withInterceptors([
              jwtInterceptor,
              () => throwError(() => boom),
            ]),
          ),
          provideHttpClientTesting(),
          { provide: AuthService, useValue: auth },
          { provide: Router, useValue: router },
          { provide: NotificationService, useValue: notifications },
        ],
      });
      let caught: unknown;
      TestBed.inject(HttpClient).get('/api/cosa').subscribe({ error: e => (caught = e) });

      expect(caught).toBe(boom);
      expect(notifications.error).toHaveBeenCalledWith(CONNECTION_MESSAGE);
    });
  });

  describe('errores del negocio y del servidor', () => {
    it.each([400, 404, 409, 422, 500])('el %i pasa de largo sin avisos ni cambios de sesión', status => {
      const error = fail('/api/cosa', status);

      expect(error?.status).toBe(status);
      expect(auth.clearSession).not.toHaveBeenCalled();
      expect(notifications.error).not.toHaveBeenCalled();
      expect(notifications.warning).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it.each([0, 401, 403, 500])('un error %i del login se propaga sin avisos ni limpiar la sesión', status => {
      const error = fail('/api/auth/login', status);

      expect(error?.status).toBe(status);
      expect(auth.clearSession).not.toHaveBeenCalled();
      expect(notifications.error).not.toHaveBeenCalled();
      expect(notifications.warning).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  // El aviso de conexión no se cierra solo (es un error): se retira cuando la conexión vuelve.
  describe('aviso de conexión pegado', () => {
    let real: NotificationService;
    let visible: () => string[];

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([jwtInterceptor])),
          provideHttpClientTesting(),
          { provide: AuthService, useValue: auth },
          { provide: Router, useValue: router },
        ],
      });
      http = TestBed.inject(HttpClient);
      httpMock = TestBed.inject(HttpTestingController);
      real = TestBed.inject(NotificationService);
      let current: string[] = [];
      real.messages$.subscribe(list => (current = list.map(m => m.text)));
      visible = () => current;
    });

    it('un fallo de red deja el aviso', () => {
      fail('/api/cosa', 0);
      expect(visible()).toEqual([CONNECTION_MESSAGE]);
    });

    it('dos fallos de red seguidos dejan un solo aviso', () => {
      fail('/api/cosa', 0);
      fail('/api/otra', 0);
      expect(visible()).toEqual([CONNECTION_MESSAGE]);
    });

    it('la primera respuesta correcta retira el aviso', () => {
      fail('/api/cosa', 0);
      http.get('/api/otra').subscribe();
      httpMock.expectOne('/api/otra').flush({ ok: true });
      expect(visible()).toEqual([]);
    });

    it('una respuesta de error del servidor (p. ej. 400) no lo retira: no prueba que haya conexión de punta a punta y no lo crea', () => {
      fail('/api/cosa', 400);
      expect(visible()).toEqual([]);
      fail('/api/cosa', 0);
      fail('/api/otra', 400);
      expect(visible()).toEqual([CONNECTION_MESSAGE]);
    });

    it('no retira otros avisos al llegar una respuesta correcta', () => {
      real.error('Otro error que sí espera al usuario');
      http.get('/api/cosa').subscribe();
      httpMock.expectOne('/api/cosa').flush({});
      expect(visible()).toEqual(['Otro error que sí espera al usuario']);
    });

    it('el evento online lo retira sin esperar a una petición', () => {
      const target = new EventTarget();
      const stop = watchConnectionRecovery(real, target as unknown as Window);
      fail('/api/cosa', 0);
      expect(visible()).toEqual([CONNECTION_MESSAGE]);

      target.dispatchEvent(new Event('online'));
      expect(visible()).toEqual([]);

      fail('/api/cosa', 0);
      stop();
      target.dispatchEvent(new Event('online'));
      expect(visible()).toEqual([CONNECTION_MESSAGE]);
    });
  });
});
