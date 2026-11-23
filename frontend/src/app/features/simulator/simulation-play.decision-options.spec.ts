vi.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Math: { Clamp: (value: number) => value },
    Input: { Keyboard: { JustDown: () => false } },
  },
}));

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { EMPTY, of } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { NpcConfig, SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * El servidor oculta las opciones cuyo requisito de exploración no se cumple y, en cada respuesta de mundo,
 * manda `decisionOptions` con las ofrecidas en ese momento: esa lista reemplaza `currentNode.options`.
 */

function makeAttempt(status = 'IN_PROGRESS'): SimulationAttemptState {
  return {
    attemptId: 'attempt-1', caseVersionId: 7, caseTitle: 'Caso demo', status,
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'x' },
    currentNode: { key: 'nodo', title: 'Etapa', options: [{ id: 11, text: 'Opción A' }] },
    completionReport: null,
  } as unknown as SimulationAttemptState;
}

function worldWith(extra: Record<string, unknown>): SimulationWorldState {
  return {
    map: { key: 'hospital-urgencias' }, objects: [], tools: [], inventory: [],
    usedToolKeys: [], inspectedObjectKeys: [], flags: {}, ...extra,
  } as unknown as SimulationWorldState;
}

describe('SimulationPlayComponent: opciones que el servidor desbloquea al explorar', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    sessionStorage.clear();
    sim = {
      getActiveAttempt: vi.fn(() => of(null)),
      getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => EMPTY),
      getScenarioConfig: vi.fn(() => EMPTY),
      recordNpcInteraction: vi.fn(() => EMPTY),
      updateWorldState: vi.fn(() => EMPTY),
      useTool: vi.fn(() => EMPTY),
    };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: {
          init: vi.fn(), setScene: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
          dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
          toggleMusicMuted: vi.fn(() => false),
        } },
        { provide: AuthService, useValue: {} },
        { provide: CONSENT_RECORDER, useValue: new SessionConsentRecorder() },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: '7' }) } } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
    component.attempt.set(makeAttempt());
    component.world.set(worldWith({}));
  });

  afterEach(() => {
    component?.ngOnDestroy();
    vi.useRealTimers();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  const useTool = () => (component as unknown as { doUseTool(code: string, target: string | null): void })
    .doUseTool('PAP', null);
  const recordNpc = () => (component as unknown as { recordNpcInteraction(npc: NpcConfig): void })
    .recordNpcInteraction({ key: 'enfermera' } as NpcConfig);
  const options = () => component.attempt()?.currentNode.options;

  it('usar una herramienta con decisionOptions agrega la opción desbloqueada', () => {
    const before = component.attempt();
    sim['useTool'].mockReturnValue(of({
      world: worldWith({ decisionOptions: [{ id: 11, text: 'Opción A' }, { id: 12, text: 'Aplicar PAP' }] }),
    }));
    useTool();
    expect(options()).toEqual([{ id: 11, text: 'Opción A' }, { id: 12, text: 'Aplicar PAP' }]);
    expect(component.attempt()).not.toBe(before); // inmutable
    expect(before?.currentNode.options).toEqual([{ id: 11, text: 'Opción A' }]);
  });

  it('hablar con una persona con decisionOptions reemplaza las opciones', () => {
    sim['recordNpcInteraction'].mockReturnValue(of(worldWith({ decisionOptions: [{ id: 12, text: 'Aplicar PAP' }] })));
    recordNpc();
    expect(options()).toEqual([{ id: 12, text: 'Aplicar PAP' }]);
  });

  it('una respuesta sin la clave no cambia las opciones', () => {
    const before = component.attempt();
    sim['useTool'].mockReturnValue(of({ world: worldWith({}) }));
    useTool();
    expect(component.attempt()).toBe(before);
    expect(options()).toEqual([{ id: 11, text: 'Opción A' }]);
  });

  it('fuera de juego no toca las opciones', () => {
    component.attempt.set(makeAttempt('COMPLETED'));
    sim['useTool'].mockReturnValue(of({ world: worldWith({ decisionOptions: [{ id: 12, text: 'X' }] }) }));
    useTool();
    expect(options()).toEqual([{ id: 11, text: 'Opción A' }]);
  });
});
