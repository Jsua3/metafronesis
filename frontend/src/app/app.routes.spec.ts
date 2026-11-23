import { TestBed } from '@angular/core/testing';
import { AuthService } from './core/auth/auth.service';
import { routes } from './app.routes';

describe('rutas del portal', () => {
  const portal = routes.find(route => route.path === 'portal')!;
  it.each([['ESTUDIANTE', '/portal/dashboard'], ['PROFESOR', '/portal/grupos'], ['ADMIN', '/portal/admin/usuarios']] as const)('redirige %s a su pantalla', (role, expected) => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { currentUser: () => ({ role }) } }] });
    for (const path of ['', 'dashboard']) {
      const redirect = portal.children!.find(route => route.path === path && route.redirectTo !== undefined)!.redirectTo;
      expect(typeof redirect).toBe('function');
      expect(TestBed.runInInjectionContext(() => (redirect as () => string)())).toBe(expected);
    }
  });
  it('conserva las pantallas del portal y elimina las rutas de olas posteriores', () => {
    const paths = portal.children!.map(route => route.path);
    expect(paths).toEqual(expect.arrayContaining(['', 'dashboard', 'invitaciones', 'grupos', 'grupos/:grupoId', 'admin/usuarios', 'cuenta/contrasena']));
    // SIEP-239: el estudiante vuelve a entrar al juego; las rutas del editor y del docente siguen fuera.
    expect(paths).toEqual(expect.arrayContaining(['jugar', 'simulador', 'simulador/:caseVersionId/ficha', 'simulador/:caseVersionId/cierre/:attemptId', 'simulador/:caseVersionId', 'personaje']));
    for (const path of ['casos', 'rubricas', 'reportes']) expect(paths).not.toContain(path);
  });
  it('el inicio del estudiante carga su pantalla y solo para ese rol', () => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { currentUser: () => ({ role: 'PROFESOR' }) } }] });
    const inicio = portal.children!.find(route => route.path === 'dashboard' && route.loadComponent)!;
    expect(TestBed.runInInjectionContext(() => (inicio.canMatch![0] as () => boolean)())).toBe(false);
  });
});
