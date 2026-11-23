import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { InstructorAttemptsPage } from '../models/revision.model';
import { EVALUATION_ALREADY_DELIVERED, InstructorApi, esValoracionYaEntregada } from './instructor.api';

/** E1-2 (RN-07): el reemplazo docente manda el motivo (obligatorio) y el servidor devuelve el intento ya REPLACED. */
// req: RN-07
describe('InstructorApi: reemplazo docente', () => {
  it('POST /api/instructor/attempts/{id}/replace con {reason}', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(InstructorApi);
    const http = TestBed.inject(HttpTestingController);

    const done = firstValueFrom(api.replaceAttempt('a-1', 'Se trabó el mundo'));
    const request = http.expectOne('/api/instructor/attempts/a-1/replace');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reason: 'Se trabó el mundo' });
    request.flush({ success: true, message: 'Intento reemplazado', data: { attemptId: 'a-1', status: 'REPLACED', reason: 'Se trabó el mundo', replacedAt: null } });
    expect((await done).status).toBe('REPLACED');
    http.verify();
  });
});

/**
 * RK-5 (bloque R0) · «Guardar sin entregar». Un cliente que no lo pide manda el cuerpo de siempre (el servidor entrega la
 * valoración completa, como hoy); `deliver: false` viaja solo cuando se pide, y el 409 de una valoración ya entregada se
 * reconoce por su código para que la pantalla no lo confunda con otro conflicto.
 */
// req: RN-09, SIEP-CU-04
describe('InstructorApi: guardar sin entregar (RK-5)', () => {
  const scores = [{ criterionId: 1, level: 'LOGRADO' as const, comment: '' }];

  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return { api: TestBed.inject(InstructorApi), http: TestBed.inject(HttpTestingController) };
  }

  it('sin opciones el cuerpo es el de siempre, sin deliver', () => {
    const { api, http } = setup();
    api.saveRubric('a-1', 3, 'Bien', scores).subscribe();
    const request = http.expectOne('/api/instructor/attempts/a-1/rubric-evaluation');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ rubricId: 3, comment: 'Bien', scores });
    request.flush({ data: null });
    http.verify();
  });

  it('con deliver: false lo manda tal cual', () => {
    const { api, http } = setup();
    api.saveRubric('a-1', 3, '', scores, { deliver: false }).subscribe();
    const request = http.expectOne('/api/instructor/attempts/a-1/rubric-evaluation');
    expect(request.request.body).toEqual({ rubricId: 3, comment: '', scores, deliver: false });
    request.flush({ data: null });
    http.verify();
  });

  it('reconoce el 409 EVALUATION_ALREADY_DELIVERED y solo ese', () => {
    const entregada = new HttpErrorResponse({
      status: 409, error: { success: false, code: EVALUATION_ALREADY_DELIVERED, message: 'Ya se entregó.' },
    });
    const revision = new HttpErrorResponse({ status: 409, error: { success: false, code: 'REVISION_CONFLICT' } });
    const otroEstado = new HttpErrorResponse({ status: 400, error: { code: EVALUATION_ALREADY_DELIVERED } });
    expect(esValoracionYaEntregada(entregada)).toBe(true);
    expect(esValoracionYaEntregada(revision)).toBe(false);
    expect(esValoracionYaEntregada(otroEstado)).toBe(false);
    expect(esValoracionYaEntregada(new Error('x'))).toBe(false);
  });
});

/**
 * La bandeja sale de `GET /api/instructor/attempts/recent` (el servidor no pagina ni filtra por valoración): el Adapter
 * filtra y pagina en el cliente.
 */
describe('InstructorApi: bandeja de revisión sobre los intentos recientes', () => {
  const fila = (attemptId: string, evaluationStatus: string, caseVersionId = 1) => ({
    attemptId, studentAlias: `Estudiante-${attemptId}`, caseTitle: 'Caso', status: 'COMPLETED',
    startedAt: '2026-11-20T10:00:00-05:00', caseVersionId, endedAt: '2026-11-20T11:00:00-05:00', evaluationStatus,
  });

  function listar(query: Parameters<InstructorApi['listAttempts']>[0]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    let pagina: InstructorAttemptsPage | undefined;
    TestBed.inject(InstructorApi).listAttempts(query).subscribe(value => (pagina = value));
    http.expectOne('/api/instructor/attempts/recent').flush({
      data: [fila('a', 'PENDIENTE'), fila('b', 'APLICADA'), fila('c', 'PENDIENTE', 2), fila('d', 'NO_APLICA')],
    });
    http.verify();
    return pagina!;
  }

  it('«pendiente» deja los terminados sin valoración concluida y cuenta el total', () => {
    const pagina = listar({ evaluacion: 'pendiente', pageSize: 1 });
    expect(pagina.items.map(item => item.attemptId)).toEqual(['a']);
    expect(pagina.coverage).toEqual({ shown: 1, total: 2 });
  });

  it('filtra por versión del caso y pagina', () => {
    expect(listar({ caseVersionId: 2 }).items.map(item => item.attemptId)).toEqual(['c']);
    expect(listar({ pageSize: 3, page: 2 }).items.map(item => item.attemptId)).toEqual(['d']);
  });
});
