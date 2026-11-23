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
import { SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * Bloque P2 (contrato x-siep 2.2): un mapa con `structure` es una sala por piezas, armada con lo que manda el servidor.
 * El ScenarioConfig de los recursos (`/assets/game/scenarios/<mapa>.json`, salas de imagen fija del legado) no se pide
 * para ella: si el mapa comparte clave con uno del legado, ese config dibujaría otra sala encima de la del caso.
 */

const CASE_VERSION_ID = 7;

function makeWorld(structure?: unknown): SimulationWorldState {
  return {
    map: { key: 'hospital-urgencias', title: 'Entrada de urgencias', ...(structure === undefined ? {} : { structure }) },
    objects: [], tools: [], inventory: [], usedToolKeys: [], inspectedObjectKeys: [], flags: {},
  } as unknown as SimulationWorldState;
}

function makeAttempt(): SimulationAttemptState {
  return {
    attemptId: 'attempt-1',
    caseVersionId: CASE_VERSION_ID,
    caseTitle: 'Caso demo',
    status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { id: 1, key: 'hospital-seguimiento', title: 'Título', narrative: '.', terminal: false, options: [] },
    completionReport: null,
  } as unknown as SimulationAttemptState;
}

const consentKey = (attempt: SimulationAttemptState) => `siep_case_consent_${attempt.caseVersionId}_${attempt.attemptId}`;

describe('SimulationPlayComponent: sala por piezas (P2)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;

  function setup(world: SimulationWorldState) {
    sessionStorage.clear();
    sessionStorage.setItem(consentKey(makeAttempt()), 'given');
    sim = {
      getActiveAttempt: vi.fn(() => of(null)),
      startAttempt: vi.fn(() => of(makeAttempt())),
      getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => of(world)),
      getScenarioConfig: vi.fn(() => of({ startRoomKey: 'legado', rooms: [] })),
      resumeAttempt: vi.fn(() => of(makeAttempt())),
      safeExit: vi.fn(() => EMPTY),
    };
    const audio = {
      init: vi.fn(), setScene: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
      dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        { provide: CONSENT_RECORDER, useValue: new SessionConsentRecorder() },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: String(CASE_VERSION_ID) }) } } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
  }

  afterEach(() => {
    component?.ngOnDestroy();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('un mapa con `structure` no pide el ScenarioConfig del legado y se pinta con lo que mandó el servidor', () => {
    setup(makeWorld({ ancho: 960, acabados: { piso: 'vinilo-gris', muro: 'pintura-clinica', paleta: 'hospital' }, piezas: [] }));
    component.ngOnInit();

    expect(sim['getScenarioConfig']).not.toHaveBeenCalled();
    expect(component.scenarioConfig()).toBeNull();
    expect(component.world()?.map.key).toBe('hospital-urgencias');
  });

  it('un mapa sin `structure` sigue pidiendo su ScenarioConfig como hoy', () => {
    setup(makeWorld());
    component.ngOnInit();

    expect(sim['getScenarioConfig']).toHaveBeenCalledWith('hospital-urgencias');
    expect(component.scenarioConfig()).not.toBeNull();
  });

  it('una `structure` que no se entiende es una sala de imagen fija: también sigue como hoy', () => {
    setup(makeWorld({ ancho: 777, acabados: { piso: 'vinilo-gris', muro: 'pintura-clinica', paleta: 'hospital' } }));
    component.ngOnInit();

    expect(sim['getScenarioConfig']).toHaveBeenCalledWith('hospital-urgencias');
  });
});
