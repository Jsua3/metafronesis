import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';

import { NotificationService } from '../notifications/notification.service';
import { authGuard, passwordChangeGuard, roleGuard } from './auth.guard';
import { AuthService } from './auth.service';

type TokenState = 'none' | 'valid' | 'expired' | 'malformed';

/**
 * Guardias del portal (plan visual F3-6, H-34): sin sesión mandan al acceso CON la ruta pedida (returnUrl) y, si la
 * sesión venció, con el motivo, que el acceso dice en la pantalla; así nadie pierde su lugar ni se queda sin saber
 * por qué volvió al acceso.
 */
// req: BLOQUE-H (H-34), RNF-004
describe('authGuard y roleGuard', () => {
  let token: TokenState;
  const clearSession = vi.fn();
  const warning = vi.fn();
  const error = vi.fn();
  let hasRole: (...roles: string[]) => boolean;
  let mustChange: boolean;

  beforeEach(() => {
    token = 'valid';
    hasRole = () => true;
    mustChange = false;
    clearSession.mockReset();
    warning.mockReset();
    error.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            getToken: () => (token === 'none' ? null : token),
            isTokenMalformed: () => token === 'malformed',
            isTokenExpired: () => token === 'expired',
            hasRole: (...roles: string[]) => hasRole(...roles),
            mustChangePassword: () => mustChange,
            clearSession,
          },
        },
        { provide: NotificationService, useValue: { warning, error } },
      ],
    });
  });

  const run = (guard: typeof authGuard, url: string) =>
    TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
  const serialize = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

  it('con sesión válida deja pasar', () => {
    expect(run(authGuard, '/portal/grupos')).toBe(true);
  });

  it('sin sesión manda al acceso con la ruta pedida, sin motivo', () => {
    token = 'none';
    expect(serialize(run(authGuard, '/portal/grupos?pagina=2'))).toBe('/login?returnUrl=%2Fportal%2Fgrupos%3Fpagina%3D2');
  });

  it('con la sesión vencida o rota: la limpia y manda al acceso con returnUrl y motivo=sesion-expirada (el acceso lo dice)', () => {
    for (const state of ['expired', 'malformed'] as const) {
      token = state;
      clearSession.mockReset();
      expect(serialize(run(authGuard, '/portal/reportes'))).toBe('/login?returnUrl=%2Fportal%2Freportes&motivo=sesion-expirada');
      expect(clearSession).toHaveBeenCalledTimes(1);
    }
  });

  it('roleGuard: sesión vencida igual que authGuard; sin el rol, a la página «sin permiso» con la sección pedida (F4-3)', () => {
    token = 'expired';
    expect(serialize(run(roleGuard('PROFESOR'), '/portal/grupos'))).toBe('/login?returnUrl=%2Fportal%2Fgrupos&motivo=sesion-expirada');
    token = 'valid';
    hasRole = () => false;
    // Antes: al panel con un aviso flotante que se iba solo (una redirección muda, según el gancho de F3).
    expect(serialize(run(roleGuard('PROFESOR'), '/portal/grupos'))).toBe('/portal/sin-permiso?seccion=grupos');
    expect(serialize(run(roleGuard('PROFESOR'), '/portal/grupos/123'))).toBe('/portal/sin-permiso?seccion=%2Fportal%2Fgrupos%2F123');
    expect(warning).not.toHaveBeenCalled();
  });

  // req: RN-10 (E2-9: cuenta aprobada con contraseña temporal; el servidor niega todo con 403 hasta cambiarla)
  it('passwordChangeGuard: con el cambio de contraseña pendiente, el portal manda a «Cambia tu contraseña» con la ruta pedida', () => {
    expect(run(passwordChangeGuard, '/portal/grupos')).toBe(true);
    mustChange = true;
    expect(serialize(run(passwordChangeGuard, '/portal/grupos?pagina=2'))).toBe('/cambiar-contrasena?returnUrl=%2Fportal%2Fgrupos%3Fpagina%3D2');
    expect(warning).not.toHaveBeenCalled();
  });
});
