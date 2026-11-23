import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { RehearsalBlock } from '../models/simulation.model';
import { RehearsalApi } from './rehearsal.api';

const BLOQUE: RehearsalBlock = {
  sceneId: 33,
  options: [{ id: 1, text: 'Decir algo', offered: false, missing: [{ kind: 'talked', key: 'abuela', label: 'Abuela' }], retainedBy: 'facts' }],
  comments: [{ index: 0, personaje: 'abuela', line: 'Hola', due: false, retainedBy: 'condition', missing: [] }],
  warnings: [],
  persona: { bond: 'GUARDED', activation: 'CALM', label: 'Cautelosa' },
  milestones: ['contuvo'],
  path: [{ nodeId: 33, title: 'Entrada' }],
  explored: { talked: [], inspected: [], has: [], used: [] },
  explorable: [{ kind: 'talked', key: 'abuela', label: 'Abuela' }],
  scenes: [{ id: 33, key: 'entrada', title: 'Entrada', start: true, terminal: false }],
};

// req: SIEP-RF-04
describe('RehearsalApi', () => {
  let api: RehearsalApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(RehearsalApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('start abre el ensayo en la escena pedida', () => {
    api.start(9, 33).subscribe();
    const req = http.expectOne('/api/authoring/cases/9/rehearsal');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ desde: 33 });
  });

  it('start sin escena no manda desde', () => {
    api.start(9, null).subscribe();
    expect(http.expectOne('/api/authoring/cases/9/rehearsal').request.body).toEqual({});
  });

  it('start devuelve el estado del juego con el bloque', () => {
    let out: { rehearsal: RehearsalBlock } | undefined;
    api.start(9, null).subscribe(s => (out = s as never));
    http.expectOne('/api/authoring/cases/9/rehearsal').flush({ success: true, data: { attemptId: 'a1', rehearsal: BLOQUE } });
    expect(out!.rehearsal).toEqual(BLOQUE);
  });

  it('adjust y read devuelven el bloque', () => {
    let block: RehearsalBlock | undefined;
    api.adjust(9, 'a1', { hitos: ['contuvo'] }).subscribe(b => (block = b));
    const req = http.expectOne('/api/authoring/cases/9/rehearsal/a1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ hitos: ['contuvo'] });
    req.flush({ success: true, data: { rehearsal: BLOQUE } });
    expect(block).toEqual(BLOQUE);

    block = undefined;
    api.read(9, 'a1').subscribe(b => (block = b));
    const get = http.expectOne('/api/authoring/cases/9/rehearsal/a1');
    expect(get.request.method).toBe('GET');
    get.flush({ success: true, data: { rehearsal: BLOQUE } });
    expect(block).toEqual(BLOQUE);
  });
});
