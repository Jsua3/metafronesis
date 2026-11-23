import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { SCREEN_HANDLES_FORBIDDEN } from '../auth/http-error-chain';
import { RubricAdmin, RubricService } from './rubric.service';

/**
 * E2-2: las órdenes que modifican una rúbrica pueden recibir 403 (es de otra persona o la global) y la pantalla lo
 * explica con su propio texto; por eso marcan la petición para que el interceptor no avise además «No tienes
 * permisos…». Las lecturas no se marcan (un 403 ahí sí es falta de permisos).
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
    request.flush({ data: null });
    return flag;
  };

  it.each([
    ['actualizar', () => service.update(4, {}), '/api/rubrics/4'],
    ['activar', () => service.activate(4), '/api/rubrics/4/activate'],
    ['desactivar', () => service.deactivate(4), '/api/rubrics/4/deactivate'],
    ['predeterminada', () => service.setDefault(4), '/api/rubrics/4/default'],
    ['asignar a un caso', () => service.assignToCaseVersion(3, 4), '/api/rubrics/case-versions/3'],
  ] as const)('%s marca la petición', (_name, call, url) => {
    expect(marked(call, url)).toBe(true);
  });

  it('leer no la marca', () => {
    expect(marked(() => service.list(), '/api/rubrics/')).toBe(false);
    expect(marked(() => service.detail(4), '/api/rubrics/4')).toBe(false);
  });
});

/**
 * Bloque R0 (RK-2, RK-3) · Las lecturas nuevas que usan la biblioteca y la rúbrica del caso: no se marcan (un 403 ahí
 * es falta de permisos de verdad) y los campos nuevos llegan tipados, todos opcionales.
 */
// req: SIEP-CU-04, RN-09
describe('RubricService: lecturas del rediseño (R0)', () => {
  let service: RubricService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RubricService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('la rúbrica de un caso se lee de /api/rubrics/case-versions/{id} sin marcar la petición', () => {
    let leida: RubricAdmin | undefined;
    service.caseVersionRubric(12).subscribe(r => (leida = r));
    const request = http.expectOne('/api/rubrics/case-versions/12');
    expect(request.request.method).toBe('GET');
    expect(request.request.context.get(SCREEN_HANDLES_FORBIDDEN)).toBe(false);
    request.flush({
      data: {
        id: 5, name: 'Competencias del programa', description: null, active: true, version: '1.0', isDefault: false,
        totalWeight: 100, criteriaCount: 1,
        caseVersion: { id: 12, title: 'Violencia familiar', semanticVersion: '2.1.0', status: 'DRAFT' },
        usage: { caseVersions: 1, evaluations: 0 },
        criteria: [{ id: 1, title: 'Contención', weight: 100, displayOrder: 1, active: true, levelDescriptors: { LOGRADO: 'Estabiliza.' } }],
      },
    });
    expect(leida?.caseVersion?.semanticVersion).toBe('2.1.0');
    expect(leida?.usage?.caseVersions).toBe(1);
    expect(leida?.criteria?.[0].levelDescriptors?.LOGRADO).toBe('Estabiliza.');
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
    request.flush({ data: null });
  });
});
