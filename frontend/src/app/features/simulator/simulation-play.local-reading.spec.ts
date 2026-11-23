// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta (mismo doble que el resto
// de specs de instancia del juego): solo se evalúa `extends Phaser.Scene` al cargar el módulo.
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
import { MapObjectState, SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * Notas y recursos de un caso creado desde un lugar: «Revisar» muestra lo que el docente escribió en «Al revisar»
 * (`interactionText`) como diálogo local. El servidor no interviene: el texto ya viaja en el mundo.
 */

const CASE_VERSION_ID = 7;

function makeAttempt(): SimulationAttemptState {
  return {
    attemptId: 'attempt-1',
    caseVersionId: CASE_VERSION_ID,
    caseTitle: 'Caso demo',
    status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { key: 'nodo-sin-evidencia', title: 'Etapa', options: [{ id: 11, text: 'Opción de esta etapa' }] },
    completionReport: null,
  } as unknown as SimulationAttemptState;
}

function objeto(type: MapObjectState['type'], overrides: Partial<MapObjectState> = {}): MapObjectState {
  return {
    key: 'cartel-155', label: 'Cartel de la Línea 155', type, x: 200, y: 200, width: 32, height: 32, color: '#4fa3a5',
    icon: 'x', shortCode: '', collision: false, interactionPrompt: 'Leer',
    interactionText: 'Línea 155: orientación a mujeres víctimas de violencia. Gratuita, las 24 horas.',
    decisionOptionId: null, toolCode: null, dialogue: null, ...overrides,
  };
}

describe('SimulationPlayComponent: lectura local de notas y recursos', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    sessionStorage.clear();
    sim = {
      getActiveAttempt: vi.fn(() => of(null)),
      startAttempt: vi.fn(() => EMPTY),
      getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => EMPTY),
      getScenarioConfig: vi.fn(() => EMPTY),
      safeExit: vi.fn(() => EMPTY),
      enterRoom: vi.fn(() => EMPTY),
      recordNpcInteraction: vi.fn(() => EMPTY),
      updateWorldState: vi.fn(() => EMPTY),
      openInteraction: vi.fn(() => EMPTY),
      chooseDecision: vi.fn(() => EMPTY),
      useTool: vi.fn(() => EMPTY),
    };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        {
          provide: AudioDirectorService,
          useValue: {
            init: vi.fn(), setScene: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
            dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
            toggleMusicMuted: vi.fn(() => false),
          },
        },
        { provide: AuthService, useValue: {} },
        { provide: CONSENT_RECORDER, useValue: new SessionConsentRecorder() },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: String(CASE_VERSION_ID) }) } },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
    component.attempt.set(makeAttempt());
    component.world.set({
      map: { key: 'sala-demo' }, objects: [], tools: [], inventory: [],
      usedToolKeys: [], inspectedObjectKeys: [], flags: {},
    } as unknown as SimulationWorldState);
  });

  afterEach(() => {
    component?.ngOnDestroy();
    vi.useRealTimers();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('NOTE muestra su texto sin llamar al servidor', () => {
    const nota = objeto('NOTE');

    component.openInteraction(nota);

    expect(sim['openInteraction']).not.toHaveBeenCalled();
    const dialogue = component.dialogue();
    expect(dialogue?.lines.map(line => line.text)).toEqual([nota.interactionText]);
    expect(dialogue?.speakerName).toBe('Cartel de la Línea 155');
    expect(dialogue?.choices).toEqual([]);
    expect(component.selectedInteraction()).toBe(nota);
  });

  it('RESOURCE también se lee aquí mismo', () => {
    const recurso = objeto('RESOURCE', { key: 'botiquin', label: 'Botiquín', interactionText: 'Si alguien se siente mal, avísale a la enfermera.' });

    component.openInteraction(recurso);

    expect(sim['openInteraction']).not.toHaveBeenCalled();
    expect(component.dialogue()?.lines[0].text).toBe('Si alguien se siente mal, avísale a la enfermera.');
  });

  it('sin texto escrito muestra el nombre, nunca un diálogo vacío', () => {
    component.openInteraction(objeto('NOTE', { interactionText: '   ' }));

    expect(component.dialogue()?.lines[0].text).toBe('Cartel de la Línea 155');
  });

  it('una nota con una decisión propia sigue el camino de siempre (no se queda sin salida)', () => {
    component.openInteraction(objeto('NOTE', { decisionOptionId: 11 }));

    expect(sim['openInteraction']).toHaveBeenCalledWith('attempt-1', 'cartel-155');
  });

  it('un objeto de otro tipo sigue preguntándole al servidor', () => {
    component.openInteraction(objeto('OBJECT'));

    expect(sim['openInteraction']).toHaveBeenCalledTimes(1);
  });
});
