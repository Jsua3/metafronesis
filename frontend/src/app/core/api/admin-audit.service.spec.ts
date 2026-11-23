import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AdminAuditService, AuditList } from './admin-audit.service';

const PAGINA: AuditList = {
  items: [{ id: 9, actorId: 3, action: 'AUDIT_VIEWED', occurredAt: '2026-11-20T12:00:00-05:00' }],
  page: 1,
  pageSize: 50,
  coverage: { shown: 1, total: 1 },
};

/** Consulta administrativa del registro de auditoría: nombres de filtro que el servidor entiende y sobre `{ data }`. */
// req: RNF-002
describe('AdminAuditService', () => {
  let service: AdminAuditService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminAuditService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide GET /api/admin/audit sin filtros y desenvuelve la página', () => {
    let pagina: AuditList | undefined;
    service.list().subscribe(value => (pagina = value));
    const request = http.expectOne(candidate => candidate.url === '/api/admin/audit');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    request.flush({ data: PAGINA });
    expect(pagina).toEqual(PAGINA);
  });

  it('manda solo los filtros con valor, con los nombres del servidor', () => {
    service.list({ actorId: 3, action: 'AUDIT_VIEWED', desde: '2026-11-01', hasta: '2026-11-20', page: 2 }).subscribe();
    const request = http.expectOne(candidate => candidate.url === '/api/admin/audit');
    expect(request.request.params.get('actorId')).toBe('3');
    expect(request.request.params.get('action')).toBe('AUDIT_VIEWED');
    expect(request.request.params.get('desde')).toBe('2026-11-01');
    expect(request.request.params.get('hasta')).toBe('2026-11-20');
    expect(request.request.params.get('page')).toBe('2');
    request.flush({ data: PAGINA });
  });

  it('un filtro vacío no viaja', () => {
    service.list({ action: '' }).subscribe();
    const request = http.expectOne(candidate => candidate.url === '/api/admin/audit');
    expect(request.request.params.has('action')).toBe(false);
    request.flush({ data: PAGINA });
  });
});
