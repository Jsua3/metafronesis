import { TestBed } from '@angular/core/testing';
import { AuthService } from './core/auth/auth.service';
import { routes } from './app.routes';

describe('rutas de la ola 1', () => {
  const portal = routes.find(route => route.path === 'portal')!;
  it.each([['ESTUDIANTE', '/portal/invitaciones'], ['PROFESOR', '/portal/grupos'], ['ADMIN', '/portal/admin/usuarios']] as const)('redirige %s a su pantalla', (role, expected) => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { currentUser: () => ({ role }) } }] });
    for (const path of ['', 'dashboard']) {
      const redirect = portal.children!.find(route => route.path === path)!.redirectTo;
      expect(typeof redirect).toBe('function');
      expect(TestBed.runInInjectionContext(() => (redirect as () => string)())).toBe(expected);
    }
  });
  it('conserva las pantallas del portal y elimina las rutas de olas posteriores', () => {
    const paths = portal.children!.map(route => route.path);
    expect(paths).toEqual(expect.arrayContaining(['', 'dashboard', 'invitaciones', 'grupos', 'grupos/:grupoId', 'admin/usuarios', 'cuenta/contrasena']));
    for (const path of ['simulador', 'casos', 'rubricas', 'reportes']) expect(paths).not.toContain(path);
  });
});
