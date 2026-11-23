import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { SCREEN_HANDLES_FORBIDDEN } from '../auth/http-error-chain';
import { RubricAdmin, RubricService } from './rubric.service';

const FICHA = {
  id: 4, name: 'Competencias del programa', description: 'Base', active: true, version: '1.0', isDefault: false,
  totalWeight: 100, criteriaCount: 2, ownerId: 9, editable: true,
  caseVersion: { id: 12, title: 'Violencia familiar', semanticVersion: '2.1.0', status: 'DRAFT' },
  usage: { caseVersions: 1, evaluations: 0 },
};
const MINIMA = {
  id: 4, name: 'Competencias del programa',
  criteria: [
    { id: 1, competency: 'Contención', description: 'Estabiliza', weight: '60.00', levelDescriptors: { LOGRADO: 'Estabiliza.' } },
    { id: 2, competency: 'Escucha', description: '', weight: '40.00', levelDescriptors: {} },
  ],
};

/**
 * Las órdenes que modifican una rúbrica pueden recibir 403 (es de otra persona o la global) y la pantalla lo explica con
 * su propio texto; por eso marcan la petición para que el interceptor no avise además «No tienes permisos…». Las lecturas
 * no se marcan (un 403 ahí sí es falta de permisos).
 */
// req: SIEP-CU-04, RNF-002
describe('RubricService: el 403 de las órdenes lo explica la pantalla', () => {
  let service: RubricService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RubricService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const marked = (call: () => Observable<unknown>, url: string) => {
    call().subscribe();
    const request = http.expectOne(url);
    const flag = request.request.context.get(SCREEN_HANDLES_FORBIDDEN);
    request.flush({ data: { ...FICHA, rubricId: 4, caseVersionId: 3 } });
    return flag;
  };

  it.each([
    ['actualizar', () => service.update(4, {}), '/api/rubrics/4'],
    ['activar', () => service.activate(4), '/api/rubrics/4/activate'],
    ['desactivar', () => service.deactivate(4), '/api/rubrics/4/deactivate'],
    ['predeterminada', () => service.setDefault(4), '/api/rubrics/4/default'],
  ] as const)('%s marca la petición', (_name, call, url) => {
    expect(marked(call, url)).toBe(true);
  });

  it('asignar a un caso marca el PUT y completa la ficha con la lectura', () => {
    let resultado: { caseVersionId: number; rubric: RubricAdmin } | undefined;
    service.assignToCaseVersion(3, 4).subscribe(r => (resultado = r));
    const put = http.expectOne('/api/rubrics/case-versions/3');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ rubricId: 4 });
    expect(put.request.context.get(SCREEN_HANDLES_FORBIDDEN)).toBe(true);
    put.flush({ data: { caseVersionId: 3, rubricId: 4 } });
    http.expectOne('/api/rubrics/4').flush({ data: MINIMA });
    http.expectOne('/api/rubrics').flush({ data: [FICHA] });
    expect(resultado?.caseVersionId).toBe(3);
    expect(resultado?.rubric.name).toBe('Competencias del programa');
  });

  it('leer no la marca', () => {
    service.list().subscribe();
    const lista = http.expectOne('/api/rubrics');
    expect(lista.request.context.get(SCREEN_HANDLES_FORBIDDEN)).toBe(false);
    lista.flush({ data: [] });
    service.detail(4).subscribe();
    const detalle = http.expectOne('/api/rubrics/4');
    expect(detalle.request.context.get(SCREEN_HANDLES_FORBIDDEN)).toBe(false);
    detalle.flush({ data: MINIMA });
    http.expectOne('/api/rubrics').flush({ data: [] });
  });
});

/**
 * El Adapter une lo que el servidor reparte: la ficha en el listado y los criterios en la lectura por id; el alta solo
 * lleva nombre y criterios y el resto se guarda con un PUT.
 */
// req: SIEP-CU-04, RN-09
describe('RubricService: lecturas y alta sobre las rutas de metafronesis', () => {
  let service: RubricService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RubricService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('la rúbrica con ficha y criterios junta GET /api/rubrics/{id} y el listado', () => {
    let leida: RubricAdmin | undefined;
    service.detail(4).subscribe(r => (leida = r));
    http.expectOne('/api/rubrics/4').flush({ data: MINIMA });
    http.expectOne('/api/rubrics').flush({ data: [{ ...FICHA, id: 99 }, FICHA] });
    expect(leida?.caseVersion?.semanticVersion).toBe('2.1.0');
    expect(leida?.usage?.caseVersions).toBe(1);
    expect(leida?.criteria?.map(c => c.weight)).toEqual([60, 40]);
    // Sin título, orden ni estado en esa lectura: el título es la competencia, el orden la posición y todo cuenta.
    expect(leida?.criteria?.[0]).toMatchObject({ title: 'Contención', displayOrder: 1, active: true });
    expect(leida?.criteria?.[0].levelDescriptors?.LOGRADO).toBe('Estabiliza.');
  });

  it('el alta manda nombre y criterios y completa descripción, versión y títulos con un PUT', () => {
    let creada: RubricAdmin | undefined;
    service.create({
      name: 'Nueva', description: 'Texto', version: '2.0',
      criteria: [{ title: 'Contención', competency: 'CONT', weight: 100, displayOrder: 1, active: true, description: 'd' }],
    }).subscribe(r => (creada = r));
    const alta = http.expectOne('/api/rubrics');
    expect(alta.request.method).toBe('POST');
    expect(alta.request.body).toEqual({
      name: 'Nueva',
      criteria: [{ competency: 'CONT', description: 'd', weight: 100, levelDescriptors: {} }],
    });
    alta.flush({ data: { id: 7, name: 'Nueva', criteria: [{ id: 70, competency: 'CONT', description: 'd', weight: '100.00' }] } });
    const guardado = http.expectOne('/api/rubrics/7');
    expect(guardado.request.method).toBe('PUT');
    expect(guardado.request.body.version).toBe('2.0');
    expect(guardado.request.body.criteria[0]).toMatchObject({ id: 70, title: 'Contención' });
    guardado.flush({ data: { ...FICHA, id: 7, name: 'Nueva' } });
    expect(creada?.id).toBe(7);
  });

  it('el catálogo de competencias se lee de /api/competencies', () => {
    let codigos: string[] = [];
    service.competencies().subscribe(items => (codigos = items.map(c => c.code)));
    const request = http.expectOne('/api/competencies');
    expect(request.request.method).toBe('GET');
    request.flush({ data: [{ id: 1, code: 'CONTENCION', name: 'Contención', description: '', active: true, sortOrder: 1 }] });
    expect(codigos).toEqual(['CONTENCION']);
  });

  it('guardar sin levelDescriptors no los manda: el servidor no toca los escritos', () => {
    service.update(4, { name: 'X', criteria: [{ title: 'C', weight: 100, displayOrder: 1, active: true }] }).subscribe();
    const request = http.expectOne('/api/rubrics/4');
    expect('levelDescriptors' in request.request.body.criteria[0]).toBe(false);
    request.flush({ data: FICHA });
  });
});
