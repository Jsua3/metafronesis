import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { RubricService } from './rubric.service';

/**
 * Las rúbricas que el editor de casos lee y asigna, contra las rutas del servidor de metafronesis (sin barra final):
 * `/api/rubrics`, `/api/rubrics/{id}` y `/api/rubrics/case-versions/{id}`. El catálogo de competencias aún no tiene ruta.
 */
// req: SIEP-CU-04, RNF-002
describe('RubricService (adaptador del servidor de metafronesis)', () => {
  let service: RubricService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RubricService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('la rúbrica de un caso se lee de /api/rubrics/case-versions/{id} y llega sin sobre', () => {
    let leida: unknown;
    service.caseVersionRubric(9).subscribe(r => (leida = r));
    const peticion = http.expectOne('/api/rubrics/case-versions/9');
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ data: { id: 3 } });
    expect(leida).toEqual({ id: 3 });
  });

  it('el detalle, la lista y la creación usan /api/rubrics sin barra final', () => {
    service.list().subscribe();
    expect(http.expectOne('/api/rubrics').request.method).toBe('GET');
    service.detail(4).subscribe();
    http.expectOne('/api/rubrics/4').flush({ data: {} });
    service.create({ name: 'R' }).subscribe();
    const crear = http.expectOne('/api/rubrics');
    expect(crear.request.method).toBe('POST');
  });

  it('asignar una rúbrica a una versión: PUT con su id', () => {
    service.assignToCaseVersion(9, 4).subscribe();
    const peticion = http.expectOne('/api/rubrics/case-versions/9');
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toEqual({ rubricId: 4 });
    peticion.flush({ data: {} });
  });

  it('el catálogo de competencias falla con un 404 explicado, sin red', () => {
    let fallo: { status?: number } | null = null;
    service.competencies().subscribe({ error: (e: { status?: number }) => (fallo = e) });
    expect((fallo as { status?: number } | null)?.status).toBe(404);
  });
});
