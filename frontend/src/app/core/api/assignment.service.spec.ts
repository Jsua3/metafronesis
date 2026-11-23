import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Assignment } from '../models/assignment.model';
import { AssignmentService } from './assignment.service';

const row: Assignment = {
  id: 5, caseVersionId: 12, target: { type: 'GROUP', groupId: 3 }, state: 'SCHEDULED', active: true, sortOrder: 0,
  opensAt: '2026-10-20T08:00:00-05:00',
};

/**
 * Contrato HTTP de las asignaciones con ventana (plan visual F10-5†; C7, RF-14, RN-04): verbo, URL y cuerpo de cada
 * operación, y que se desenvuelva el sobre `{ data }`. Las rutas existen en el servidor (lo comprueba el contrato de rutas).
 */
// req: RF-14, RF-15, CU-06
describe('AssignmentService', () => {
  let service: AssignmentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AssignmentService, provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AssignmentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list pide las asignaciones de un grupo y devuelve la lista sin el sobre', () => {
    let result: Assignment[] | undefined;
    service.list(3).subscribe(value => (result = value));
    const request = http.expectOne(candidate => candidate.url === '/api/assignments' && candidate.params.get('groupId') === '3');
    expect(request.request.method).toBe('GET');
    request.flush({ data: [row] });
    expect(result).toEqual([row]);
  });

  it('create asigna una versión a un grupo con su ventana', () => {
    const body = { caseVersionId: 12, target: { type: 'GROUP' as const, groupId: 3 }, opensAt: '2026-10-20T13:00:00.000Z', closesAt: null };
    let result: Assignment | undefined;
    service.create(body).subscribe(value => (result = value));
    const request = http.expectOne('/api/assignments');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush({ data: row });
    expect(result).toEqual(row);
  });

  it('update cambia solo lo que se manda (fechas, orden o pausa); null borra una fecha', () => {
    let result: Assignment | undefined;
    service.update(5, { closesAt: null, active: false }).subscribe(value => (result = value));
    const request = http.expectOne('/api/assignments/5');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ closesAt: null, active: false });
    request.flush({ data: { ...row, active: false } });
    expect(result?.active).toBe(false);
  });

  it('remove retira la asignación', () => {
    let done = false;
    service.remove(5).subscribe(() => (done = true));
    const request = http.expectOne('/api/assignments/5');
    expect(request.request.method).toBe('DELETE');
    request.flush({ data: { id: 5 } });
    expect(done).toBe(true);
  });
});
