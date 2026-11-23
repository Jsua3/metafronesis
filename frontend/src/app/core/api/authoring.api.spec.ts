import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { AuthoringApi } from './authoring.api';

/**
 * El adaptador del editor de casos frente al servidor de metafronesis (`apps/autoria`, `apps/publicacion`): la revisión
 * del caso viaja en la cabecera `X-Case-Revision` y en el cuerpo (escenas, decisiones y ficha la leen solo del cuerpo),
 * las escenas y decisiones se traducen a la forma del servidor y, como esas rutas no devuelven el editor, se vuelve a
 * leer. La generación con IA todavía no tiene backend.
 */
// req: RNF-08, REGLA-011, SIEP-RN-05
describe('AuthoringApi (adaptador del servidor de metafronesis)', () => {
  let api: AuthoringApi;
  let http: HttpTestingController;
  const vista = { caseVersionId: 9, revision: 8, status: 'DRAFT' };
  const body = {} as never;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AuthoringApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Responde una mutación y, si hace falta, la relectura del editor. */
  function responder(url: string, releer: boolean) {
    const peticion = http.expectOne(url);
    peticion.flush({ data: releer ? {} : vista });
    if (releer) http.expectOne('/api/authoring/cases/9/editor').flush({ data: vista });
    return peticion.request;
  }

  const conEditor: Array<[string, (a: AuthoringApi, r?: number) => Observable<unknown>, string, string, boolean]> = [
    ['createNode', (a, r) => a.createNode(9, body, r), 'POST', '/api/authoring/cases/9/nodes', true],
    ['updateNode', (a, r) => a.updateNode(9, 2, body, r), 'PUT', '/api/authoring/cases/9/nodes/2', true],
    ['deleteNode', (a, r) => a.deleteNode(9, 2, r), 'DELETE', '/api/authoring/cases/9/nodes/2', true],
    ['createDecision', (a, r) => a.createDecision(9, body, r), 'POST', '/api/authoring/cases/9/decisions', true],
    ['updateDecision', (a, r) => a.updateDecision(9, 2, body, r), 'PUT', '/api/authoring/cases/9/decisions/2', true],
    ['deleteDecision', (a, r) => a.deleteDecision(9, 2, r), 'DELETE', '/api/authoring/cases/9/decisions/2', true],
    ['updateBrief', (a, r) => a.updateBrief(9, body, r), 'PUT', '/api/authoring/cases/9/brief', true],
    ['createDialogue', (a, r) => a.createDialogue(9, 3, body, r), 'POST', '/api/authoring/cases/9/maps/3/dialogues', false],
    ['updateDialogue', (a, r) => a.updateDialogue(9, 2, body, r), 'PUT', '/api/authoring/cases/9/dialogues/2', false],
    ['deleteDialogue', (a, r) => a.deleteDialogue(9, 2, r), 'DELETE', '/api/authoring/cases/9/dialogues/2', false],
    ['acceptAiNode', (a, r) => a.acceptAiNode(9, 2, r), 'POST', '/api/authoring/cases/9/nodes/2/accept-ai', false],
    ['acceptAiDecision', (a, r) => a.acceptAiDecision(9, 2, r), 'POST', '/api/authoring/cases/9/decisions/2/accept-ai', false],
    ['acceptAiDialogue', (a, r) => a.acceptAiDialogue(9, 2, r), 'POST', '/api/authoring/cases/9/dialogues/2/accept-ai', false],
    ['acceptAiObject', (a, r) => a.acceptAiObject(9, 2, r), 'POST', '/api/authoring/cases/9/objects/2/accept-ai', false],
    ['createMap', (a, r) => a.createMap(9, body, r), 'POST', '/api/authoring/cases/9/maps', false],
    ['updateMap', (a, r) => a.updateMap(9, 2, body, r), 'PUT', '/api/authoring/cases/9/maps/2', false],
    ['deleteMap', (a, r) => a.deleteMap(9, 2, r), 'DELETE', '/api/authoring/cases/9/maps/2', false],
    ['createObject', (a, r) => a.createObject(9, 3, body, r), 'POST', '/api/authoring/cases/9/maps/3/objects', false],
    ['updateObject', (a, r) => a.updateObject(9, 2, body, r), 'PUT', '/api/authoring/cases/9/objects/2', false],
    ['deleteObject', (a, r) => a.deleteObject(9, 2, r), 'DELETE', '/api/authoring/cases/9/objects/2', false],
    ['createTool', (a, r) => a.createTool(9, body, r), 'POST', '/api/authoring/cases/9/tools', false],
    ['updateTool', (a, r) => a.updateTool(9, 2, body, r), 'PUT', '/api/authoring/cases/9/tools/2', false],
    ['deleteTool', (a, r) => a.deleteTool(9, 2, r), 'DELETE', '/api/authoring/cases/9/tools/2', false],
    ['updateMilestones', (a, r) => a.updateMilestones(9, [], r), 'PUT', '/api/authoring/cases/9/rules/milestones', false],
    ['updateRisk', (a, r) => a.updateRisk(9, null, r), 'PUT', '/api/authoring/cases/9/rules/risk', false],
    ['updateEndings', (a, r) => a.updateEndings(9, [], r), 'PUT', '/api/authoring/cases/9/rules/endings', false],
    ['updateChecklist', (a, r) => a.updateChecklist(9, body, r), 'PUT', '/api/authoring/cases/9/checklist', false],
    ['createHint', (a, r) => a.createHint(9, 3, body, r), 'POST', '/api/authoring/cases/9/maps/3/hints', false],
    ['updateHint', (a, r) => a.updateHint(9, 2, body, r), 'PUT', '/api/authoring/cases/9/hints/2', false],
    ['deleteHint', (a, r) => a.deleteHint(9, 2, r), 'DELETE', '/api/authoring/cases/9/hints/2', false],
    ['createCharacter', (a, r) => a.createCharacter(9, body, r), 'POST', '/api/authoring/cases/9/characters', false],
    ['updateCharacter', (a, r) => a.updateCharacter(9, 2, body, r), 'PUT', '/api/authoring/cases/9/characters/2', false],
    ['deleteCharacter', (a, r) => a.deleteCharacter(9, 2, r), 'DELETE', '/api/authoring/cases/9/characters/2', false],
    ['adoptRubric', (a, r) => a.adoptRubric(9, { fromCompetencies: true }, r), 'POST', '/api/authoring/cases/9/rubric', false],
    ['reorderNodes', (a, r) => a.reorderNodes(9, [2, 1], r), 'PATCH', '/api/authoring/cases/9/nodes/reorder', false],
  ];

  it.each(conEditor)('%s manda la revisión vigente en la cabecera y en el cuerpo', (_n, llamar, metodo, url, releer) => {
    let recibida: unknown;
    llamar(api, 7).subscribe(v => (recibida = v));
    const peticion = responder(url, releer);
    expect(peticion.method).toBe(metodo);
    expect(peticion.headers.get('X-Case-Revision')).toBe('7');
    expect((peticion.body as { revision?: number }).revision).toBe(7);
    expect(recibida).toEqual(vista);
  });

  it.each(conEditor)('%s sin revisión no manda cabecera ni campo (el servidor no compara)', (_n, llamar, _m, url, releer) => {
    llamar(api).subscribe();
    const peticion = responder(url, releer);
    expect(peticion.headers.has('X-Case-Revision')).toBe(false);
    expect(peticion.body == null || !('revision' in (peticion.body as object))).toBe(true);
  });

  it('una escena viaja con los campos del editor (sin goal) y la revisión', () => {
    api.createNode(9, {
      nodeKey: 'escena-3', title: 'T', narrative: 'N', requiredTools: ['a'], supportResources: [], sensitiveContent: true,
      safeExitRequired: false, warningMessage: 'aviso', terminal: false, startNode: true, positionX: 1, positionY: 2,
      decisionPrompt: '¿Qué haces?', intensity: 'HIGH', goal: 'no viaja',
    }, 4).subscribe();
    const peticion = responder('/api/authoring/cases/9/nodes', true);
    expect(peticion.body).toEqual({
      nodeKey: 'escena-3', title: 'T', narrative: 'N', requiredTools: ['a'], supportResources: [], sensitiveContent: true,
      safeExitRequired: false, warningMessage: 'aviso', terminal: false, startNode: true, positionX: 1, positionY: 2,
      decisionPrompt: '¿Qué haces?', intensity: 'HIGH', revision: 4,
    });
  });

  it('una decisión manda todos sus campos, incluidos feedbackText, efectos y reacción', () => {
    const decision = {
      sourceNodeId: 1, targetNodeId: 2, optionKey: 'o', text: 'Texto', responseClass: 'RECOMMENDED' as const, prohibitedConduct: false,
      prohibitionReason: null, immediateFeedback: 'x', feedbackText: 'Porque sí', theoryBasis: 'Teoría', consequenceText: 'c',
      effects: { milestones: ['h'] }, requires: {}, reaction: { linea: 'ok' },
    };
    api.updateDecision(9, 2, decision, 4).subscribe();
    expect(responder('/api/authoring/cases/9/decisions/2', true).body).toEqual({ ...decision, revision: 4 });
  });

  it('la ficha manda narrativeContext en lugar de context, y los temas sensibles', () => {
    api.updateBrief(9, { context: 'Contexto', learningObjectives: ['a'], contentWarnings: ['x'] }, 3).subscribe();
    const peticion = responder('/api/authoring/cases/9/brief', true);
    expect(peticion.body).toEqual({ narrativeContext: 'Contexto', learningObjectives: ['a'], contentWarnings: ['x'], revision: 3 });
  });

  it('las reglas viajan dentro de su clave: «milestones», «riskLevel» y «endings»', () => {
    api.updateRisk(9, 'SEVERE', 7).subscribe();
    expect(responder('/api/authoring/cases/9/rules/risk', false).body).toEqual({ riskLevel: 'SEVERE', revision: 7 });
  });

  it('el cuerpo de un diálogo viaja tal cual (más la revisión)', () => {
    const dialogo = { treeKey: 'escena-1', speakerName: 'Camila', emotion: 'neutral', lines: [{ displayOrder: 1, text: 'Hola', aiSuggested: true }] };
    api.createDialogue(9, 3, dialogo, 7).subscribe();
    expect(responder('/api/authoring/cases/9/maps/3/dialogues', false).body).toEqual({ ...dialogo, revision: 7 });
  });

  describe('crear y listar casos', () => {
    it('crear con un lugar manda lugarId, salas y porPiezas', () => {
      api.createCase({ title: 'C', code: 'X', lugarId: 'universidad', salas: ['a', 'b'], porPiezas: true }).subscribe();
      const peticion = http.expectOne('/api/authoring/cases');
      expect(peticion.request.body).toEqual({ code: 'X', title: 'C', description: '', lugarId: 'universidad', salas: ['a', 'b'], porPiezas: true });
      peticion.flush({ data: { versionId: 9 } });
      http.expectOne('/api/authoring/cases/9/editor').flush({ data: vista });
    });

    it('crear manda código (generado del título), título y descripción, y devuelve el editor', () => {
      let recibida: unknown;
      api.createCase({ title: 'Caso de prueba' }).subscribe(v => (recibida = v));
      const peticion = http.expectOne('/api/authoring/cases');
      expect(peticion.request.method).toBe('POST');
      const cuerpo = peticion.request.body as { code: string; title: string; description: string };
      expect(cuerpo.code).toMatch(/^CASO-DE-PRUEBA-[A-Z0-9]+$/);
      expect(cuerpo.title).toBe('Caso de prueba');
      expect(peticion.request.headers.has('X-Case-Revision')).toBe(false);
      peticion.flush({ data: { versionId: 9, status: 'DRAFT', revision: 0, brief: { code: 'C', title: 'Caso de prueba', description: '' } } });
      http.expectOne('/api/authoring/cases/9/editor').flush({ data: vista });
      expect(recibida).toEqual(vista);
    });

    it('un código dado se respeta', () => {
      api.createCase({ title: 'Caso', code: 'MI-CODIGO' }).subscribe();
      const peticion = http.expectOne('/api/authoring/cases');
      expect((peticion.request.body as { code: string }).code).toBe('MI-CODIGO');
      peticion.flush({ data: { versionId: 9 } });
      http.expectOne('/api/authoring/cases/9/editor').flush({ data: vista });
    });

    it('la lista se traduce al resumen que usa el centro de casos', () => {
      let lista: unknown;
      api.listAuthoringCases().subscribe(l => (lista = l));
      http.expectOne('/api/authoring/cases').flush({
        data: [{ versionId: 5, status: 'DRAFT', revision: 2, brief: { code: 'A', title: 'Título', description: null } }],
      });
      expect(lista).toEqual([{ caseVersionId: 5, code: 'A', title: 'Título', description: '', semanticVersion: '', nodeCount: 0, status: 'DRAFT' }]);
    });

    it('clonar devuelve el editor de la copia', () => {
      let recibida: unknown;
      api.cloneCaseVersion(9).subscribe(v => (recibida = v));
      http.expectOne('/api/authoring/cases/9/clone-version').flush({ data: { versionId: 10, status: 'DRAFT' } });
      http.expectOne('/api/authoring/cases/10/editor').flush({ data: { ...vista, caseVersionId: 10 } });
      expect(recibida).toEqual({ ...vista, caseVersionId: 10 });
    });
  });

  describe('validación y ciclo de vida', () => {
    it('la validación traduce los problemas a hallazgos y lleva a la escena', () => {
      let validacion: unknown;
      api.validateCase(9).subscribe(v => (validacion = v));
      http.expectOne('/api/authoring/cases/9/validate').flush({ data: { valid: false, problems: [
        { code: 'NODE_NO_QUESTION', where: 'nodes/12', message: 'La escena necesita una pregunta.' },
        { code: 'CASE_NO_START', where: 'case', message: 'El caso necesita una escena inicial.' },
      ] } });
      expect(validacion).toEqual({
        canPublish: false,
        issues: [
          { code: 'NODE_NO_QUESTION', severity: 'error', message: 'La escena necesita una pregunta.', path: 'nodes/12', nodeId: 12 },
          { code: 'CASE_NO_START', severity: 'error', message: 'El caso necesita una escena inicial.', path: 'case' },
        ],
      });
    });

    it('el ciclo se lee de GET lifecycle', () => {
      let ciclo: unknown;
      api.lifecycle(9).subscribe(c => (ciclo = c));
      const peticion = http.expectOne('/api/authoring/cases/9/lifecycle');
      expect(peticion.request.method).toBe('GET');
      peticion.flush({ data: { caseVersionId: 9, state: 'DRAFT', allowedTransitions: ['submit'] } });
      expect(ciclo).toEqual({ caseVersionId: 9, state: 'DRAFT', allowedTransitions: ['submit'] });
    });

    it('enviar a revisión: POST lifecycle con la acción y la cabecera; la respuesta ya es el ciclo', () => {
      let ciclo: unknown;
      api.transitionCase(9, { action: 'submit' }, 3).subscribe(c => (ciclo = c));
      const peticion = http.expectOne('/api/authoring/cases/9/lifecycle');
      expect(peticion.request.body).toEqual({ action: 'submit' });
      expect(peticion.request.headers.get('X-Case-Revision')).toBe('3');
      peticion.flush({ data: { versionId: 9, status: 'IN_REVIEW', caseVersionId: 9, state: 'IN_REVIEW', allowedTransitions: [] } });
      expect(ciclo).toMatchObject({ caseVersionId: 9, state: 'IN_REVIEW', allowedTransitions: [] });
    });

    it('devolver: POST lifecycle con reject, motivo y nota', () => {
      api.transitionCase(9, { action: 'reject', reason: 'FORMA', note: 'Falta algo' }, 3).subscribe();
      const peticion = http.expectOne('/api/authoring/cases/9/lifecycle');
      expect(peticion.request.body).toEqual({ action: 'reject', reason: 'FORMA', note: 'Falta algo' });
      peticion.flush({ data: { caseVersionId: 9, state: 'DRAFT', allowedTransitions: ['submit'] } });
    });

    it('aprobar publica y luego lee el ciclo de la versión', () => {
      let ciclo: unknown;
      api.transitionCase(9, { action: 'approve' }, 3).subscribe(c => (ciclo = c));
      http.expectOne('/api/authoring/cases/9/publish').flush({ data: { versionId: 9, status: 'PUBLISHED' } });
      http.expectOne('/api/authoring/cases/9/lifecycle').flush({ data: { caseVersionId: 9, state: 'PUBLISHED', allowedTransitions: ['archive'] } });
      expect(ciclo).toEqual({ caseVersionId: 9, state: 'PUBLISHED', allowedTransitions: ['archive'] });
    });

    it('caseChanges emite al aplicar una transición y ante un 409 de revisión o de estado, no ante otros errores', () => {
      const vistos: number[] = [];
      api.caseChanges.subscribe(id => vistos.push(id));
      api.transitionCase(9, { action: 'submit' }).subscribe();
      http.expectOne('/api/authoring/cases/9/lifecycle').flush({ data: { caseVersionId: 9, state: 'IN_REVIEW', allowedTransitions: [] } });
      expect(vistos).toEqual([9]);

      api.transitionCase(9, { action: 'approve' }).subscribe({ error: () => undefined });
      http.expectOne('/api/authoring/cases/9/publish').flush({ code: 'INVALID_TRANSITION' }, { status: 409, statusText: 'Conflict' });
      api.transitionCase(9, { action: 'approve' }).subscribe({ error: () => undefined });
      http.expectOne('/api/authoring/cases/9/publish').flush({ code: 'REVISION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
      expect(vistos).toEqual([9, 9, 9]);

      api.transitionCase(9, { action: 'approve' }).subscribe({ error: () => undefined });
      http.expectOne('/api/authoring/cases/9/publish').flush({ code: 'CASE_INVALID' }, { status: 400, statusText: 'Bad Request' });
      expect(vistos).toEqual([9, 9, 9]);
    });
  });

  describe('mundo y biblioteca', () => {
    it('el mundo se lee y se guarda en la misma ruta, con nodeId', () => {
      api.worldEditor(9, 3).subscribe();
      const lectura = http.expectOne('/api/authoring/cases/9/world?nodeId=3');
      expect(lectura.request.method).toBe('GET');
      lectura.flush({ data: {} });
      api.saveWorld(9, { revision: 4 } as never, 3).subscribe();
      const guardado = http.expectOne('/api/authoring/cases/9/world?nodeId=3');
      expect(guardado.request.method).toBe('PUT');
      guardado.flush({ data: {} });
    });

    it('validar el mundo devuelve la validación que trae el mundo leído', () => {
      let validacion: unknown;
      api.validateWorld(9).subscribe(v => (validacion = v));
      http.expectOne('/api/authoring/cases/9/world').flush({ data: { validation: { errors: [], warnings: [], canPublish: true } } });
      expect(validacion).toEqual({ errors: [], warnings: [], canPublish: true });
    });

    it('la biblioteca llega sin sobre y el id viaja codificado', () => {
      let lista: unknown;
      api.libraryPlaces().subscribe(l => (lista = l));
      http.expectOne('/api/biblioteca/lugares').flush({ data: [{ id: 'universidad' }] });
      expect(lista).toEqual([{ id: 'universidad' }]);
      api.libraryPlace('a/b c').subscribe();
      http.expectOne('/api/biblioteca/lugares/a%2Fb%20c').flush({ data: {} });
    });
  });

  describe('la generación de casos con IA (SIEP-244)', () => {
    it('el estado se pide al servidor y llega sin sobre', () => {
      let estado: unknown;
      api.generationStatus().subscribe(e => (estado = e));
      const peticion = http.expectOne('/api/authoring/generations/status');
      expect(peticion.request.method).toBe('GET');
      peticion.flush({ data: { enabled: true, remainingToday: 3, inProgress: null } });
      expect(estado).toEqual({ enabled: true, remainingToday: 3, inProgress: null });
    });

    it('cada etapa usa su ruta y su método, con el id codificado', () => {
      api.startGeneration({ lugarId: 'universidad', descripcion: 'x' }).subscribe();
      const crear = http.expectOne('/api/authoring/generations');
      expect([crear.request.method, crear.request.body]).toEqual(['POST', { lugarId: 'universidad', descripcion: 'x' }]);
      crear.flush({ data: {} });
      const id = 'a/b';
      const etapas: Array<[() => Observable<unknown>, string, string]> = [
        [() => api.generation(id), 'GET', '/api/authoring/generations/a%2Fb'],
        [() => api.generationSkeleton(id), 'POST', '/api/authoring/generations/a%2Fb/skeleton'],
        [() => api.generationScene(id, 'sala 1'), 'POST', '/api/authoring/generations/a%2Fb/scenes/sala%201'],
        [() => api.generationAssemble(id), 'POST', '/api/authoring/generations/a%2Fb/assemble'],
        [() => api.cancelGeneration(id), 'DELETE', '/api/authoring/generations/a%2Fb'],
      ];
      for (const [llamar, metodo, url] of etapas) {
        llamar().subscribe();
        const peticion = http.expectOne(url);
        expect(peticion.request.method).toBe(metodo);
        expect(peticion.request.params.has('repair')).toBe(false);
        peticion.flush({ data: {} });
      }
    });

    it('la reparación de una escena viaja con ?repair=1', () => {
      api.generationScene('g1', 'sala-1', true).subscribe();
      const peticion = http.expectOne(r => r.url === '/api/authoring/generations/g1/scenes/sala-1');
      expect(peticion.request.params.get('repair')).toBe('1');
      peticion.flush({ data: {} });
    });
  });

  describe('lo que aún no tiene backend', () => {
    it('el asistente se ve apagado sin pedir nada al servidor', () => {
      let estado: unknown;
      api.assistantStatus(9).subscribe(e => (estado = e));
      expect(estado).toEqual({ enabled: false, mode: 'disabled', remainingToday: 0 });
    });

    const sinBackend: Array<[string, (a: AuthoringApi) => Observable<unknown>]> = [
      ['assistantPropose', a => a.assistantPropose(9, {} as never)],
    ];
    it.each(sinBackend)('%s falla con un 404 explicado, sin red', (_n, llamar) => {
      let fallo: { status?: number } | null = null;
      llamar(api).subscribe({ error: (e: { status?: number }) => (fallo = e) });
      expect((fallo as { status?: number } | null)?.status).toBe(404);
    });
  });
});
