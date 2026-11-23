import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { SCREEN_HANDLES_FORBIDDEN } from '../auth/http-error-chain';
import { ReporteService } from './reporte.service';

/**
 * Cliente de C3 (E1-10): `GET /api/reportes/estudiante/{id}?caseVersionId=&limit=` con los intentos de un estudiante,
 * su tiempo activo y de reloj y la cobertura «X de N». Solo viajan los filtros que se pidieron.
 */
// req: RF-26, CU-15, RF-25, CU-14
describe('ReporteService · reporte de un estudiante (C3)', () => {
  let service: ReporteService;
  let http: HttpTestingController;

  const REPORT = {
    student: { ref: 'Estudiante-12', displayName: 'Ana Gómez' },
    attempts: [{ attemptId: 'a1', caseVersionId: 7, caseTitle: 'Duelo', status: 'COMPLETED', startedAt: '2026-10-10T10:00:00', activeSeconds: 600, clockSeconds: 900, ordinal: 2 }],
    coverage: { shown: 1, total: 5 },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ReporteService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide el reporte del estudiante sin filtros y devuelve el cuerpo de la respuesta', async () => {
    const result = firstValueFrom(service.getReporteEstudiante(12));
    const request = http.expectOne(candidate => candidate.url === '/api/reportes/estudiante/12');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    request.flush({ success: true, message: null, data: REPORT });

    expect((await result).coverage).toEqual({ shown: 1, total: 5 });
  });

  it('marca la petición: el 403 de un estudiante ajeno lo explica la pantalla, no el aviso genérico del interceptor', async () => {
    const result = firstValueFrom(service.getReporteEstudiante(12));
    const request = http.expectOne(candidate => candidate.url === '/api/reportes/estudiante/12');
    expect(request.request.context.get(SCREEN_HANDLES_FORBIDDEN)).toBe(true);
    request.flush({ success: true, message: null, data: REPORT });
    await result;
  });

  it('manda el caso y el límite cuando se piden', async () => {
    const result = firstValueFrom(service.getReporteEstudiante(12, { caseVersionId: 7, limit: 40 }));
    const request = http.expectOne(candidate => candidate.url === '/api/reportes/estudiante/12');
    expect(request.request.params.get('caseVersionId')).toBe('7');
    expect(request.request.params.get('limit')).toBe('40');
    request.flush({ success: true, message: null, data: REPORT });
    await result;
  });

  it('no manda filtros vacíos (null o sin definir)', async () => {
    const result = firstValueFrom(service.getReporteEstudiante(12, { caseVersionId: null, limit: undefined }));
    const request = http.expectOne(candidate => candidate.url === '/api/reportes/estudiante/12');
    expect(request.request.params.keys()).toEqual([]);
    request.flush({ success: true, message: null, data: REPORT });
    await result;
  });
});
