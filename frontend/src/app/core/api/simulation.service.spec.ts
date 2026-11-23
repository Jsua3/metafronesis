import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { resolveScenarioConfigAssetKey } from '../../features/simulator/scenario-config-assets.util';
import { SCREEN_HANDLES_FORBIDDEN, SCREEN_HANDLES_OFFLINE } from '../auth/http-error-chain';
import { SimulationAttemptState } from '../models/simulation.model';
import { SimulationService } from './simulation.service';

/**
 * Contrato HTTP del adaptador del jugador contra la API de metafronesis: verbo, URL, cuerpo y forma de la respuesta de
 * cada método. La sesión es el JWT: ninguna llamada lleva `attemptToken` (ni en el cuerpo ni en la cabecera).
 */
describe('SimulationService (API de metafronesis)', () => {
  const S = '/api/simulation';
  const A = 'att-1';
  const att = `${S}/attempts/${A}`;

  let service: SimulationService;
  let http: HttpTestingController;

  /** El intento como lo serializa el servidor (sin sobre). */
  const intento = (extra: Record<string, unknown> = {}) => ({
    id: A, case_version: 7, current_node: 11, status: 'IN_PROGRESS', started_at: '2026-11-01T10:00:00Z', ended_at: null, active_seconds: 0, ...extra,
  });

  /** El estado completo que entrega `GET …/state`. */
  const estado = (extra: Record<string, unknown> = {}) => ({
    attemptId: A, caseVersionId: 7, caseTitle: 'Caso siete', status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { id: 11, key: 'inicio', title: 'Recepción', narrative: 'Llega una persona.', terminal: false, options: [{ id: 5, text: 'Preguntar' }] },
    completionReport: null, supportResources: [], ...extra,
  });
  const responderEstado = (extra: Record<string, unknown> = {}, id = A) =>
    http.expectOne(`${S}/attempts/${id}/state`).flush({ success: true, data: estado(extra) });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [SimulationService, provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SimulationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const sinToken = (request: TestRequest) => {
    expect(request.request.headers.has('X-SIEP-Attempt-Token')).toBe(false);
    expect(JSON.stringify(request.request.body ?? {})).not.toContain('attemptToken');
  };

  describe('el mundo y las acciones del intento (mismas rutas y JSON de v3, sin token)', () => {
    it('lee el mundo, el mapa de progreso y las pistas, y desenvuelve el sobre', () => {
      const resultados: unknown[] = [];
      service.getWorld(A).subscribe(r => resultados.push(r));
      service.getProgressMap(A).subscribe(r => resultados.push(r));
      service.getHints(A).subscribe(r => resultados.push(r));
      for (const ruta of ['world', 'progress-map', 'hints']) {
        const request = http.expectOne(`${att}/${ruta}`);
        expect(request.request.method).toBe('GET');
        sinToken(request);
        request.flush({ success: true, data: { ruta } });
      }
      expect(resultados).toEqual([{ ruta: 'world' }, { ruta: 'progress-map' }, { ruta: 'hints' }]);
    });

    it.each([
      ['revealNextHint', () => service.revealNextHint(A, 'r-1'), 'hints/next', { requestId: 'r-1' }],
      ['enterRoom', () => service.enterRoom(A, 'sala-2', 'puerta-a'), 'enter-room', { targetNodeKey: 'sala-2', doorKey: 'puerta-a' }],
      ['openInteraction', () => service.openInteraction(A, 'mesa'), 'interactions/mesa', {}],
      ['useTool', () => service.useTool(A, 'ficha', 'mesa'), 'tools/use', { toolCode: 'ficha', targetInteractionKey: 'mesa' }],
      ['recordNpcInteraction', () => service.recordNpcInteraction(A, 'ana'), 'npcs/ana', {}],
      ['saveReflection', () => service.saveReflection(A, 11, 'texto'), 'reflections', { nodeId: 11, text: 'texto' }],
    ])('%s hace POST a %s con el cuerpo del servidor y sin token', (_nombre, llamar, ruta, cuerpo) => {
      (llamar() as { subscribe: () => void }).subscribe();
      const request = http.expectOne(`${att}/${ruta}`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(cuerpo);
      sinToken(request);
      request.flush({ success: true, data: {} });
    });

    it('la posición viaja por PATCH world-state y, con la pausa, no saca el aviso global de conexión', () => {
      service.updateWorldState(A, 10, 20, 'sala-1', true).subscribe();
      const request = http.expectOne(`${att}/world-state`);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ playerX: 10, playerY: 20, currentMapKey: 'sala-1' });
      expect(request.request.context.get(SCREEN_HANDLES_OFFLINE)).toBe(true);
      request.flush({ success: true, data: {} });

      service.updateWorldState(A, 1, 2, 'sala-1').subscribe();
      const caminar = http.expectOne(`${att}/world-state`);
      expect(caminar.request.context.get(SCREEN_HANDLES_OFFLINE)).toBe(false);
      caminar.flush({ success: true, data: {} });
    });

    it('la salida segura manda solo el motivo, devuelve el estado del servidor y deja a la pantalla explicar la falta de red', () => {
      let estado: SimulationAttemptState | undefined;
      service.safeExit(A, 'cansancio').subscribe(r => (estado = r));
      const request = http.expectOne(`${att}/safe-exit`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ reason: 'cansancio' });
      expect(request.request.context.get(SCREEN_HANDLES_OFFLINE)).toBe(true);
      request.flush({ success: true, data: { attemptId: A, status: 'PAUSED' } });
      expect(estado?.status).toBe('PAUSED');
    });

    it('el informe del estudiante completa phaseDurations con [] cuando el servidor no lo manda', () => {
      let informe: { phaseDurations: unknown[] } | undefined;
      service.studentReport(A).subscribe(r => (informe = r));
      http.expectOne(`${att}/student-report`).flush({ success: true, data: { attemptId: A } });
      expect(informe?.phaseDurations).toEqual([]);
    });

    it('el escenario sale de los activos versionados, sin sobre', () => {
      service.getScenarioConfig('hospital-sala-escucha').subscribe();
      const request = http.expectOne(`/assets/game/scenarios/${resolveScenarioConfigAssetKey('hospital-sala-escucha')}.json`);
      expect(request.request.method).toBe('GET');
      request.flush({});
    });
  });

  describe('el catálogo y la ficha (rutas que metafronesis ya tenía)', () => {
    it('getCatalog traduce las filas del servidor (snake_case, sin sobre) al catálogo del cliente', () => {
      let catalogo: unknown;
      service.getCatalog().subscribe(r => (catalogo = r));
      http.expectOne(`${S}/catalog`).flush([
        { case_version_id: 7, case_id: 3, title: 'Caso siete', completed: true, allowed: true, reason: null },
        { case_version_id: 8, case_id: 4, title: 'Caso ocho', completed: false, allowed: false, reason: 'LOCKED_BY_SEQUENCE' },
      ]);
      expect(catalogo).toEqual([
        { caseVersionId: 7, code: '', title: 'Caso siete', description: '', order: 1, unlocked: true, completed: true, locked: false, access: { allowed: true } },
        { caseVersionId: 8, code: '', title: 'Caso ocho', description: '', order: 2, unlocked: false, completed: false, locked: true, access: { allowed: false, reason: 'LOCKED_BY_SEQUENCE' } },
      ]);
    });

    it('listCases une el catálogo con los casos por el id del caso (código y descripción)', () => {
      let casos: unknown;
      service.listCases().subscribe(r => (casos = r));
      http.expectOne(`${S}/catalog`).flush([{ case_version_id: 7, case_id: 3, title: 'Caso siete', completed: false, allowed: true, reason: null }]);
      http.expectOne(`${S}/cases`).flush([{ id: 3, code: 'SIM-3', title: 'Caso siete', description: 'Descripción', active: true }]);
      expect(casos).toEqual([{ caseVersionId: 7, caseId: 3, code: 'SIM-3', title: 'Caso siete', description: 'Descripción', semanticVersion: '', nodeCount: 0, status: 'PUBLISHED' }]);
    });

    it('la ficha se arma con el contexto y los objetivos del servidor; el aviso de contenido sale del consentimiento', () => {
      let ficha: unknown;
      service.getCaseBrief(7).subscribe(r => (ficha = r));
      const brief = http.expectOne(`${S}/cases/7/brief`);
      expect(brief.request.context.get(SCREEN_HANDLES_FORBIDDEN)).toBe(true);
      brief.flush({ success: true, data: { caseVersionId: 7, code: 'C', title: 'Caso siete', description: 'd', narrativeContext: 'Contexto', learningObjectives: ['Escuchar'], estimatedMinutes: 20 } });
      http.expectOne(`${S}/cases/7/consent`).flush({ success: true, data: { required: true, noticeVersion: 'v1', accepted: false, acceptedAt: null } });
      expect(ficha).toEqual({
        caseVersionId: 7, title: 'Caso siete', context: 'Contexto', characters: [], learningObjectives: ['Escuchar'], hasSensitiveContent: true, access: { allowed: true },
      });
    });

    it('el historial agrega el título del caso desde el catálogo y la duración desde las horas', () => {
      let historial: unknown;
      service.attemptHistory().subscribe(r => (historial = r));
      http.expectOne(`${S}/attempts/history`).flush({ success: true, data: [
        { attemptId: A, caseVersionId: 7, status: 'COMPLETED', startedAt: '2026-11-01T10:00:00Z', endedAt: '2026-11-01T10:10:00Z', currentNodeId: 11 },
      ] });
      http.expectOne(`${S}/catalog`).flush([{ case_version_id: 7, case_id: 3, title: 'Caso siete', completed: true, allowed: true, reason: null }]);
      expect(historial).toEqual([{ attemptId: A, caseVersionId: 7, caseTitle: 'Caso siete', status: 'COMPLETED', totalDurationSeconds: 600, activeDurationSeconds: 600, startedAt: '2026-11-01T10:00:00Z', endedAt: '2026-11-01T10:10:00Z' }]);
    });

    it('la retroalimentación del docente sale de `result`; sin intento terminado (409) no hay retroalimentación', () => {
      let evaluacion: unknown;
      service.getOwnerEvaluation(A).subscribe(r => (evaluacion = r));
      const request = http.expectOne(`${att}/result`);
      expect(request.request.context.get(SCREEN_HANDLES_FORBIDDEN)).toBe(true);
      request.flush({ success: true, data: { teacherFeedback: 'Buen recorrido' } });
      expect(evaluacion).toMatchObject({ attemptId: A, evaluations: [{ origin: 'DOCENTE', comment: 'Buen recorrido', overallLevel: null, criteria: [] }] });

      service.getOwnerEvaluation(A).subscribe(r => (evaluacion = r));
      http.expectOne(`${att}/result`).flush({ code: 'ATTEMPT_NOT_FINISHED' }, { status: 409, statusText: 'Conflict' });
      expect(evaluacion).toEqual({ attemptId: A, evaluations: [] });
    });

    it('el consentimiento no cambia de ruta ni de cuerpo', () => {
      service.getConsent(7).subscribe();
      http.expectOne(`${S}/cases/7/consent`).flush({ success: true, data: {} });
      service.acceptConsent(7, 'v1').subscribe();
      const aceptar = http.expectOne(`${S}/cases/7/consent`);
      expect(aceptar.request.method).toBe('POST');
      expect(aceptar.request.body).toEqual({ noticeVersion: 'v1' });
      aceptar.flush({ success: true, data: {} });
      service.withdrawConsent(7).subscribe();
      expect(http.expectOne(`${S}/cases/7/consent`).request.method).toBe('DELETE');
    });
  });

  describe('intentos (formas nuevas: snake_case y estado desde `GET …/state`)', () => {
    it('startAttempt crea el intento con `case_version_id` y lee el estado completo', () => {
      let resultado: SimulationAttemptState | undefined;
      service.startAttempt(7).subscribe(r => (resultado = r));
      const request = http.expectOne(`${S}/attempts`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ case_version_id: 7 });
      expect(request.request.context.get(SCREEN_HANDLES_FORBIDDEN)).toBe(true);
      request.flush(intento(), { status: 201, statusText: 'Created' });
      responderEstado();
      expect(resultado).toMatchObject({ attemptId: A, caseTitle: 'Caso siete', currentNode: { narrative: 'Llega una persona.', options: [{ id: 5, text: 'Preguntar' }] } });
      expect('attemptToken' in (resultado as object)).toBe(false);
    });

    it('al reemplazar manda el intento que la persona aceptó perder, lo reemplaza y abre otro', () => {
      let resultado: SimulationAttemptState | undefined;
      service.startAttempt(7, true, A).subscribe(r => (resultado = r));
      const primero = http.expectOne(`${S}/attempts`);
      expect(primero.request.body).toEqual({ case_version_id: 7, expectedAttemptId: A });
      primero.flush(intento(), { status: 200, statusText: 'OK' });
      const reemplazo = http.expectOne(`${att}/replace`);
      expect(reemplazo.request.method).toBe('POST');
      reemplazo.flush(intento({ status: 'REPLACED' }));
      http.expectOne(`${S}/attempts`).flush(intento({ id: 'att-2' }), { status: 201, statusText: 'Created' });
      responderEstado({ attemptId: 'att-2' }, 'att-2');
      expect(resultado?.attemptId).toBe('att-2');
    });

    it('si ya había un intento abierto y no se pidió reemplazo, devuelve ese', () => {
      let resultado: SimulationAttemptState | undefined;
      service.startAttempt(7).subscribe(r => (resultado = r));
      http.expectOne(`${S}/attempts`).flush(intento(), { status: 200, statusText: 'OK' });
      responderEstado();
      expect(resultado?.attemptId).toBe(A);
    });

    it('el 409 ATTEMPT_CHANGED del servidor llega a la pantalla sin reemplazar nada', () => {
      let fallo: { status?: number } | undefined;
      service.startAttempt(7, true, A).subscribe({ error: e => (fallo = e) });
      http.expectOne(`${S}/attempts`).flush({ code: 'ATTEMPT_CHANGED', currentAttemptId: 'otro' }, { status: 409, statusText: 'Conflict' });
      expect(fallo?.status).toBe(409);
    });

    it('getActiveAttempt devuelve null sin intento abierto y el estado con él', () => {
      let abierto: SimulationAttemptState | null | undefined;
      service.getActiveAttempt(7).subscribe(r => (abierto = r));
      http.expectOne(`${S}/cases/7/active-attempt`).flush({ success: true, data: { attemptId: null } });
      expect(abierto).toBeNull();

      service.getActiveAttempt(7).subscribe(r => (abierto = r));
      http.expectOne(`${S}/cases/7/active-attempt`).flush({ success: true, data: { attemptId: A, caseVersionId: 7, status: 'PAUSED', currentNodeId: 11 } });
      responderEstado({ status: 'PAUSED', supportResources: ['Línea de apoyo'] });
      expect(abierto).toMatchObject({ attemptId: A, status: 'PAUSED', supportResources: ['Línea de apoyo'] });
    });

    it('getAttempt lee `GET …/state` sin token', () => {
      let resultado: SimulationAttemptState | undefined;
      service.getAttempt(A).subscribe(r => (resultado = r));
      const lectura = http.expectOne(`${att}/state`);
      expect(lectura.request.method).toBe('GET');
      sinToken(lectura);
      lectura.flush({ success: true, data: estado({ completionReport: { summaryMessage: 'ok' }, status: 'COMPLETED' }) });
      expect(resultado?.completionReport?.summaryMessage).toBe('ok');
    });

    it('resumeAttempt reanuda por POST y lee el estado', () => {
      let resultado: SimulationAttemptState | undefined;
      service.resumeAttempt(A).subscribe(r => (resultado = r));
      const reanudar = http.expectOne(`${att}/resume`);
      expect(reanudar.request.method).toBe('POST');
      sinToken(reanudar);
      reanudar.flush(intento());
      responderEstado();
      expect(resultado?.status).toBe('IN_PROGRESS');
    });
  });

  describe('decisiones', () => {
    it('chooseDecision manda `decision_option_id` y `request_id` y devuelve el estado, la consecuencia, el reintento y la reacción', () => {
      let resultado: unknown;
      service.chooseDecision(A, 5, 'req-1').subscribe(r => (resultado = r));
      const request = http.expectOne(`${att}/decisions`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ decision_option_id: 5, request_id: 'req-1' });
      sinToken(request);
      request.flush({
        attempt_id: A, retry_required: false, attempt: estado({ currentNode: { id: 12, key: 'b', title: 'B', narrative: '', terminal: false, options: [] } }),
        consequence: { text: 'Ella respira hondo.', source: 'OPTION' }, retry: { allowed: true, message: 'Otra vez' },
        reaction: { line: 'Mmm', emotion: null, gesture: 'baja-la-mirada', objectKey: null },
      });
      expect(resultado).toMatchObject({
        attemptId: A, currentNode: { id: 12 }, consequence: { text: 'Ella respira hondo.', source: 'OPTION' },
        retry: { allowed: true, message: 'Otra vez' }, reaction: { gesture: 'baja-la-mirada' },
      });
    });

    it('sin requestId genera uno (el servidor lo exige); sin reintento ni reacción llegan null', () => {
      let resultado: { retry: unknown; reaction: unknown; consequence: unknown } | undefined;
      service.chooseDecision(A, 5).subscribe(r => (resultado = r as never));
      const request = http.expectOne(`${att}/decisions`);
      expect((request.request.body as { request_id: string }).request_id).toMatch(/\S+/);
      request.flush({ attempt: estado() });
      expect(resultado).toMatchObject({ retry: null, reaction: null, consequence: null });
    });
  });
});
