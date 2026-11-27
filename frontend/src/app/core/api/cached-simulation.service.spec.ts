import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createEnvironmentInjector, EnvironmentInjector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { portalRoutes } from '../../portal.routes';

import { AuthService } from '../auth/auth.service';
import { SimulationCaseSummary } from '../models/simulation.model';
import { User } from '../models/user.model';
import { CASE_LIST_TTL_MS, CaseListCache } from './case-list-cache';
import { CachedSimulationService } from './cached-simulation.service';
import { SimulationService } from './simulation.service';

/** Proxy de caché de `listCases` (P-06): qué guarda, cuándo lo olvida y qué no toca. */
describe('CachedSimulationService (proxy de caché)', () => {
  const CATALOG = '/api/simulation/catalog';
  const CASES = '/api/simulation/cases';
  /** Lo que arma `listCases` desde el catálogo y la lista de casos del servidor. */
  const summary = (id: number): SimulationCaseSummary => ({
    caseVersionId: id, caseId: id, code: `C${id}`, title: `Caso ${id}`, description: '', semanticVersion: '', nodeCount: 0, status: 'PUBLISHED',
  });
  /** Responde las dos lecturas del servidor (catálogo y casos) para esa lista; devuelve cuántas veces se pidió el catálogo. */
  function responder(lista: SimulationCaseSummary[]): number {
    const catalogos = http.match(CATALOG);
    catalogos.forEach(r => r.flush(lista.map(c => ({ case_version_id: c.caseVersionId, case_id: c.caseVersionId, title: c.title, completed: false, allowed: true, reason: null }))));
    http.match(CASES).forEach(r => r.flush(lista.map(c => ({ id: c.caseVersionId, code: c.code, title: c.title, description: '', active: true }))));
    return catalogos.length;
  }
  const user = (id: number, role: User['role'] = 'ESTUDIANTE'): User =>
    ({ id, nombre: 'N', apellido: 'A', email: `u${id}@x.co`, role });

  let service: CachedSimulationService;
  let http: HttpTestingController;
  let currentUser: ReturnType<typeof signal<User | null>>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    currentUser = signal<User | null>(user(1));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser } },
      ],
    });
    service = TestBed.inject(CachedSimulationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /** Pide la lista y, si hace falta, responde la petición; devuelve lo recibido y cuántas peticiones hubo. */
  function pedir(respuesta: SimulationCaseSummary[] = [summary(1)]) {
    let recibido: SimulationCaseSummary[] | undefined;
    service.listCases().subscribe(c => (recibido = c));
    const peticiones = responder(respuesta);
    return { recibido, peticiones };
  }

  it('es un SimulationService: los componentes no notan el cambio', () => {
    expect(service).toBeInstanceOf(SimulationService);
  });

  it('la primera llamada va al backend y la segunda, dentro de la vigencia, no', () => {
    expect(pedir().peticiones).toBe(1);
    const segunda = pedir();
    expect(segunda.peticiones).toBe(0);
    expect(segunda.recibido).toEqual([summary(1)]);
  });

  it('dos llamadas simultáneas comparten una sola petición', () => {
    const recibidos: SimulationCaseSummary[][] = [];
    service.listCases().subscribe(c => recibidos.push(c));
    service.listCases().subscribe(c => recibidos.push(c));
    expect(responder([summary(1)])).toBe(1);
    expect(recibidos).toEqual([[summary(1)], [summary(1)]]);
  });

  describe('vigencia', () => {
    it('justo antes de vencer sigue sirviendo la lista guardada', () => {
      pedir();
      vi.advanceTimersByTime(CASE_LIST_TTL_MS - 1);
      expect(pedir().peticiones).toBe(0);
    });

    it('al vencer vuelve al backend y trae los datos nuevos', () => {
      pedir([summary(1)]);
      vi.advanceTimersByTime(CASE_LIST_TTL_MS);
      const nueva = pedir([summary(1), summary(2)]);
      expect(nueva.peticiones).toBe(1);
      expect(nueva.recibido).toEqual([summary(1), summary(2)]);
    });
  });

  describe('la lista depende del usuario', () => {
    it('otro usuario no recibe la lista del anterior', () => {
      pedir([summary(1)]);
      currentUser.set(user(2));
      const otro = pedir([summary(9)]);
      expect(otro.peticiones).toBe(1);
      expect(otro.recibido).toEqual([summary(9)]);
    });

    it('el mismo id con otro rol tampoco comparte lista', () => {
      pedir();
      currentUser.set(user(1, 'ADMIN'));
      expect(pedir().peticiones).toBe(1);
    });

    it('al cerrar sesión no se sirve la lista del usuario que salió', () => {
      pedir();
      currentUser.set(null);
      expect(pedir().peticiones).toBe(1);
    });

    it('al volver el mismo usuario, dentro de la vigencia, no hace falta pedirla otra vez', () => {
      pedir();
      currentUser.set(user(2));
      pedir();
      currentUser.set(user(1));
      expect(pedir().peticiones).toBe(1); // solo guarda la del usuario más reciente
    });
  });

  describe('errores', () => {
    it('un error no se guarda: la siguiente llamada reintenta', () => {
      let error: unknown;
      service.listCases().subscribe({ error: e => (error = e) });
      http.expectOne(CATALOG).flush({ message: 'x' }, { status: 500, statusText: 'err' });
      http.match(CASES);   // la otra lectura de la lista queda cancelada por el error
      expect(error).toBeDefined();

      const reintento = pedir([summary(1)]);
      expect(reintento.peticiones).toBe(1);
      expect(reintento.recibido).toEqual([summary(1)]);
    });

    it('un error propaga el mismo HttpErrorResponse a quien lo pidió', () => {
      let status: number | undefined;
      service.listCases().subscribe({ error: e => (status = e.status) });
      http.expectOne(CATALOG).flush({}, { status: 503, statusText: 'err' });
      http.match(CASES);
      expect(status).toBe(503);
    });
  });

  describe('copias', () => {
    it('cada quien recibe su propia lista: modificarla no afecta a los demás', () => {
      const primera = pedir([summary(1)]).recibido!;
      primera[0].title = 'MODIFICADO';
      primera.push(summary(99));
      expect(pedir().recibido).toEqual([summary(1)]);
    });
  });

  describe('invalidación', () => {
    it('invalidate() obliga a volver al backend', () => {
      pedir();
      TestBed.inject(CaseListCache).invalidate();
      expect(pedir().peticiones).toBe(1);
    });
  });

  describe('lo demás pasa sin tocar', () => {
    it('getCatalog no se guarda: cada llamada va al backend', () => {
      for (let i = 0; i < 2; i++) {
        service.getCatalog().subscribe();
        http.expectOne('/api/simulation/catalog').flush([]);
      }
    });
  });

  it('las rutas del portal registran el proxy bajo el token SimulationService', () => {
    const portal = createEnvironmentInjector(portalRoutes[0].providers!, TestBed.inject(EnvironmentInjector));
    try {
      expect(portal.get(SimulationService)).toBe(service);
    } finally {
      portal.destroy();
    }
  });
});
