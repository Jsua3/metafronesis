import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';

/** JWT de prueba que no vence (año 2100) con el rol y el id que lee `loadUser`. */
function token(role = 'ESTUDIANTE'): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'ana@cue.edu.co', userId: 7, role, exp: 4_102_444_800 })}.firma`;
}

/**
 * El cambio de contraseña obligatorio de E2-9 (RN-10): `/auth/login` y `/auth/me` traen `mustChangePassword` y la
 * sesión lo conserva; `/auth/change-password` lo apaga. Sin esto, la interfaz no sabía que la persona estaba entrando
 * con una contraseña temporal y la dejaba en un portal donde el servidor le niega todo.
 */
// req: RN-10, RNF-01
describe('AuthService: cambio de contraseña obligatorio (E2-9)', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  const summary = (mustChangePassword: boolean) =>
    ({ id: 7, nombre: 'Ana', apellido: 'Ríos', email: 'ana@cue.edu.co', role: 'ESTUDIANTE', mustChangePassword });

  it('el acceso conserva `mustChangePassword` de la respuesta', async () => {
    const done = firstValueFrom(service.login('ana@cue.edu.co', 'Temporal-123'));
    http.expectOne('/api/auth/login').flush({ success: true, message: null, data: { token: token(), user: summary(true) } });
    await done;
    expect(service.mustChangePassword()).toBe(true);
  });

  it('`/auth/me` también lo trae al recargar (el JWT no lo lleva)', async () => {
    localStorage.setItem('psychosim_token', token());
    expect(service.mustChangePassword()).toBe(false);
    const done = firstValueFrom(service.syncCurrentUser());
    http.expectOne('/api/auth/me').flush({ success: true, message: null, data: summary(true) });
    await done;
    expect(service.mustChangePassword()).toBe(true);
  });

  it('cambiarla envía la actual y la nueva a `/auth/change-password`; al terminar la sesión deja de exigirlo', async () => {
    const done = firstValueFrom(service.login('ana@cue.edu.co', 'Temporal-123'));
    http.expectOne('/api/auth/login').flush({ success: true, message: null, data: { token: token(), user: summary(true) } });
    await done;

    const change = firstValueFrom(service.changePassword('Temporal-123', 'Nueva-clave-2026'));
    const request = http.expectOne('/api/auth/change-password');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ currentPassword: 'Temporal-123', newPassword: 'Nueva-clave-2026' });
    const reemitido = token('PROFESOR');  // S1-4: el servidor reemite un token con la época nueva
    request.flush({ success: true, message: 'Contraseña actualizada', data: { token: reemitido } });
    await change;
    expect(service.getToken()).toBe(reemitido);

    service.markPasswordChanged();
    expect(service.mustChangePassword()).toBe(false);
    expect(service.currentUser()?.nombre).toBe('Ana');
  });

  it('un 403 PASSWORD_CHANGE_REQUIRED marca la sesión aunque `/me` no haya llegado', () => {
    localStorage.setItem('psychosim_token', token());
    expect(service.mustChangePassword()).toBe(false);
    service.requirePasswordChange();
    expect(service.mustChangePassword()).toBe(true);
  });
});

/**
 * Cerrar sesión (S1-4): avisa al servidor para que el token deje de valer (`POST /api/auth/logout`), pero la salida
 * local no espera ni depende de eso.
 */
// req: SIEP-RNF-04
describe('AuthService: cierre de sesión revocable (S1-4)', () => {
  let service: AuthService;
  let http: HttpTestingController;
  const router = { navigate: vi.fn(), url: '/portal/dashboard' };

  beforeEach(() => {
    localStorage.clear();
    router.navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: Router, useValue: router }, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('avisa al servidor con el token de la sesión y cierra la sesión local sin esperar la respuesta', () => {
    const jwt = token();
    localStorage.setItem('psychosim_token', jwt);
    service.logout();
    expect(service.getToken()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    const req = http.expectOne('/api/auth/logout');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${jwt}`);
    req.flush({ success: true, message: 'Sesión cerrada', data: null });
  });

  it('si el servidor falla (sin red, 401, 500) la sesión local ya está cerrada y no hay error', () => {
    localStorage.setItem('psychosim_token', token());
    service.logout();
    http.expectOne('/api/auth/logout').flush({ success: false }, { status: 500, statusText: 'err' });
    expect(service.getToken()).toBeNull();
    expect(service.currentUser()).toBeNull();
  });

  it('sin token no llama al servidor', () => {
    service.logout();
    http.expectNone('/api/auth/logout');
  });
});
