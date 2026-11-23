import { TestBed } from '@angular/core/testing';
import { AuthService } from './core/auth/auth.service';
import { routes } from './app.routes';

describe('rutas de la ola 1', () => {
  const portal = routes.find(route => route.path === 'portal')!;
  it.each([['ESTUDIANTE', '/portal/invitaciones'], ['PROFESOR', '/portal/dashboard'], ['ADMIN', '/portal/dashboard']] as const)('redirige %s a su pantalla', (role, expected) => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { currentUser: () => ({ role }) } }] });
    const redirect = portal.children!.find(route => route.path === '')!.redirectTo;
    expect(typeof redirect).toBe('function');
    expect(TestBed.runInInjectionContext(() => (redirect as () => string)())).toBe(expected);
  });
  it.each([['PROFESOR', true], ['ADMIN', true], ['ESTUDIANTE', false]] as const)('el inicio del personal coincide para %s: %s', (role, coincide) => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { currentUser: () => ({ role }) } }] });
    const inicio = portal.children!.find(route => route.path === 'dashboard' && !!route.loadComponent)!;
    expect(inicio.canMatch).toHaveLength(1);
    expect(TestBed.runInInjectionContext(() => (inicio.canMatch![0] as () => boolean)())).toBe(coincide);
  });
  it('sin otro inicio que coincida, /portal/dashboard cae a la bandeja de grupos del estudiante', () => {
    const rutas = portal.children!.filter(route => route.path === 'dashboard');
    expect(rutas.map(route => route.redirectTo ?? 'pantalla')).toEqual(['pantalla', '/portal/invitaciones']);
  });
  it('conserva las pantallas del portal y elimina las rutas de olas posteriores', () => {
    const paths = portal.children!.map(route => route.path);
    expect(paths).toEqual(expect.arrayContaining(['', 'dashboard', 'invitaciones', 'grupos', 'grupos/:grupoId', 'admin/usuarios', 'cuenta/contrasena', 'rubricas', 'docente/trazabilidad', 'reportes', 'reportes/estudiante/:estudianteId']));
    for (const path of ['simulador', 'casos']) expect(paths).not.toContain(path);
  });
});
