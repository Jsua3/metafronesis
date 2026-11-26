import { portalRoutes } from './portal.routes';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './core/auth/auth.service';
import { routes } from './app.routes';

describe('rutas del portal', () => {
  const portal = routes.find(route => route.path === 'portal')!;
  it('carga las rutas y el proveedor del portal al entrar', async () => {
    expect(portal.children).toBeUndefined();
    const load = portal.loadChildren as () => Promise<typeof portalRoutes>;
    expect(await load()).toBe(portalRoutes);
    expect(portalRoutes[0].providers).toBeDefined();
  });
  it.each([['ESTUDIANTE', '/portal/dashboard'], ['PROFESOR', '/portal/dashboard'], ['ADMIN', '/portal/dashboard']] as const)('redirige %s a su inicio', (role, expected) => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { currentUser: () => ({ role }) } }] });
    const redirect = portalRoutes[0].children!.find(route => route.path === '')!.redirectTo;
    expect(typeof redirect).toBe('function');
    expect(TestBed.runInInjectionContext(() => (redirect as () => string)())).toBe(expected);
  });
  it('sin rol conocido, la raíz del portal va a la bandeja de grupos', () => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { currentUser: () => null } }] });
    const redirect = portalRoutes[0].children!.find(route => route.path === '')!.redirectTo as () => string;
    expect(TestBed.runInInjectionContext(() => redirect())).toBe('/portal/invitaciones');
  });
  const inicios = () => portalRoutes[0].children!.filter(route => route.path === 'dashboard' && !!route.loadComponent);
  it.each([['PROFESOR', [true, false]], ['ADMIN', [true, false]], ['ESTUDIANTE', [false, true]]] as const)('el inicio que coincide para %s es el suyo', (role, coincide) => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { currentUser: () => ({ role }) } }] });
    expect(inicios().map(inicio => TestBed.runInInjectionContext(() => (inicio.canMatch![0] as () => boolean)()))).toEqual(coincide);
  });
  it('sin otro inicio que coincida, /portal/dashboard cae a la bandeja de grupos con una redirección fija', () => {
    const rutas = portalRoutes[0].children!.filter(route => route.path === 'dashboard');
    expect(rutas.map(route => route.redirectTo ?? 'pantalla')).toEqual(['pantalla', 'pantalla', '/portal/invitaciones']);
  });
  it('conserva las pantallas del portal y elimina las rutas de olas posteriores', () => {
    const paths = portalRoutes[0].children!.map(route => route.path);
    expect(paths).toEqual(expect.arrayContaining(['', 'dashboard', 'invitaciones', 'grupos', 'grupos/:grupoId', 'admin/usuarios', 'cuenta/contrasena', 'rubricas', 'docente/trazabilidad', 'reportes', 'reportes/estudiante/:estudianteId']));
    // SIEP-239: el estudiante vuelve a entrar al juego. SIEP-240: el personal edita casos.
    expect(paths).toEqual(expect.arrayContaining(['jugar', 'simulador', 'simulador/:caseVersionId/ficha', 'simulador/:caseVersionId/cierre/:attemptId', 'simulador/:caseVersionId', 'personaje']));
    expect(paths).toEqual(expect.arrayContaining(['casos', 'casos/nuevo', 'casos/:caseVersionId/editor', 'casos/:caseVersionId/ensayo']));
  });
});
