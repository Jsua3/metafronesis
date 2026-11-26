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
import { EMPTY, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { DialogueState, SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { ORIENTATION_COPY } from './orientation.config';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * A-03b: cuánto dura cada aviso, espera y fundido de la pantalla de juego.
 *
 * Cada prueba comprueba el instante exacto: un milisegundo antes todo sigue como estaba y en el instante
 * indicado ya cambió. Los números van escritos a propósito en la prueba (no se importan del componente): son
 * el contrato observable, y así un cambio accidental de una constante del componente falla aquí.
 */

const CASE_VERSION_ID = 7;

function makeWorld(mapKey = 'hospital-sala-escucha', title = 'Sala de escucha'): SimulationWorldState {
  return {
    map: { key: mapKey, title },
    objects: [], tools: [], inventory: [], usedToolKeys: [], inspectedObjectKeys: [], flags: {},
  } as unknown as SimulationWorldState;
}

function makeAttempt(overrides: Record<string, unknown> = {}, nodeKey = 'hospital-seguimiento'): SimulationAttemptState {
  return {
    attemptId: 'attempt-1',
    caseVersionId: CASE_VERSION_ID,
    caseTitle: 'Caso demo',
    status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: {
      id: 1, key: nodeKey, title: 'Título del nodo', narrative: 'Primera frase.', terminal: false,
      options: [{ id: 101, text: 'Opción' }],
    },
    completionReport: null,
    ...overrides,
  } as unknown as SimulationAttemptState;
}

describe('SimulationPlayComponent: tiempos de la pantalla de juego (A-03b)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;
  let audio: Record<string, Mock>;
  // El componente se ejercita por dentro (métodos privados): mismo recurso que usan los demás specs de instancia.
  const internals = () => component as any;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    sessionStorage.clear();
    localStorage.clear();
    sim = {
      getActiveAttempt: vi.fn(() => of(null)),
      startAttempt: vi.fn(() => of(makeAttempt())),
      getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => of(makeWorld())),
      getScenarioConfig: vi.fn(() => throwError(() => new Error('sin escenario'))),
      safeExit: vi.fn(() => EMPTY),
      enterRoom: vi.fn(() => EMPTY),
      recordNpcInteraction: vi.fn(() => EMPTY),
      updateWorldState: vi.fn(() => EMPTY),
      openInteraction: vi.fn(() => EMPTY),
      chooseDecision: vi.fn(() => EMPTY),
      useTool: vi.fn(() => EMPTY),
    };
    audio = {
      init: vi.fn(), setScene: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
      dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
      toggleMusicMuted: vi.fn(() => false), playResolution: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: String(CASE_VERSION_ID) }) } },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
  });

  afterEach(() => {
    component?.ngOnDestroy(); // cancela los temporizadores pendientes antes de que se desmonte el entorno
    vi.useRealTimers();
    sessionStorage.clear();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  const advance = (ms: number) => { vi.advanceTimersByTime(ms); };

  describe('avisos que se apagan solos', () => {
    it('«no hay nada cerca» se apaga a los 4500 ms (la frase es larga: tiempo para leerla)', () => {
      component.showNothingNearby();
      expect(component.nothingNearbyNote()).toBe(ORIENTATION_COPY.now.nothingNearby);

      advance(4499);
      expect(component.nothingNearbyNote()).toBe(ORIENTATION_COPY.now.nothingNearby);
      advance(1);
      expect(component.nothingNearbyNote()).toBe('');
    });

    it('un aviso suave se apaga a los 4200 ms', () => {
      internals().showSoftNotice('Aviso no esencial');
      expect(component.softNotice()).toBe('Aviso no esencial');

      advance(4199);
      expect(component.softNotice()).toBe('Aviso no esencial');
      advance(1);
      expect(component.softNotice()).toBe('');
    });

    // VD-29 (H-23, WCAG 2.2.1): un error informa algo accionable y ya no se apaga solo; se cierra con «Cerrar» del aviso
    // del sistema que lo pinta (`ui-toast-host`).
    it('el error de una acción NO se apaga solo (permanece hasta cerrarse)', () => {
      internals().showActionError('No pudimos completar la acción.');
      expect(component.actionError()).toBe('No pudimos completar la acción.');

      advance(60_000);
      expect(component.actionError()).toBe('No pudimos completar la acción.');
      internals().dismissActionError();
      expect(component.actionError()).toBe('');
    });

    it('el nombre de la sala se muestra 2200 ms', () => {
      internals().announceRoomChange(makeWorld('hospital-urgencias', 'Urgencias'));
      expect(component.roomBanner()).toBe('Urgencias');

      advance(2199);
      expect(component.roomBanner()).toBe('Urgencias');
      advance(1);
      expect(component.roomBanner()).toBe('');
    });

    it('el banner de etapa nueva se muestra 3000 ms', () => {
      internals().announceNewStage('Seguimiento');
      const banner = 'Seguimiento';
      expect(component.roomBanner()).toBe(banner);

      advance(2999);
      expect(component.roomBanner()).toBe(banner);
      advance(1);
      expect(component.roomBanner()).toBe('');
    });

    it('la nota de transición del mapa dura 4200 ms', () => {
      const world = makeWorld('hospital-seguimiento', 'Seguimiento');
      (world.map as unknown as { ambient: unknown }).ambient = { transitionText: 'Pasaron tres horas.' };

      internals().announceRoomChange(world);
      expect(component.transitionNote()).toBe('Pasaron tres horas.');

      advance(4199);
      expect(component.transitionNote()).toBe('Pasaron tres horas.');
      advance(1);
      expect(component.transitionNote()).toBe('');
    });
  });

  describe('esperas entre un paso y el siguiente', () => {
    it('el fundido de escena espera 340 ms antes de continuar', () => {
      const next = vi.fn();

      internals().triggerFade(next);
      expect(component.fadeActive()).toBe(true);

      advance(339);
      expect(next).not.toHaveBeenCalled();
      advance(1);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('con el mundo cargado el fundido se retira a los 80 ms y los efectos de cámara llegan 320 ms después', () => {
      // Doble mínimo de la escena: aplicar un mundo también pide recalcular la escala (otro temporizador, de 0 ms).
      const gameWorld = {
        playRevealEffects: vi.fn(), refreshScale: vi.fn(), updatePatientVisualState: vi.fn(), setPersonaState: vi.fn(), places: vi.fn(() => []),
        setCameraOptions: vi.fn(), setCameraMoment: vi.fn(), setCameraFrozen: vi.fn(),
      };
      internals().gameWorld = gameWorld;
      component.attempt.set(makeAttempt());
      component.fadeActive.set(true);

      internals().applyLoadedWorld(makeWorld());
      expect(component.fadeActive()).toBe(true);

      advance(79);
      expect(component.fadeActive()).toBe(true);
      advance(1);
      expect(component.fadeActive()).toBe(false);

      expect(gameWorld.playRevealEffects).not.toHaveBeenCalled();
      advance(319);
      expect(gameWorld.playRevealEffects).not.toHaveBeenCalled();
      advance(1);
      expect(gameWorld.playRevealEffects).toHaveBeenCalledTimes(1);
    });

    it('si el componente se destruye antes de los 80 ms, el fundido no se retira ni se piden efectos de cámara', () => {
      // El retiro del fundido toca `window` al dispararse: en las pruebas, un temporizador de un componente
      // que nadie destruyó se disparaba con el entorno ya desmontado («window is not defined», intermitente en CI).
      const gameWorld = {
        playRevealEffects: vi.fn(), refreshScale: vi.fn(), updatePatientVisualState: vi.fn(), setPersonaState: vi.fn(), places: vi.fn(() => []),
        setCameraOptions: vi.fn(), setCameraMoment: vi.fn(), setCameraFrozen: vi.fn(),
      };
      internals().gameWorld = gameWorld;
      component.attempt.set(makeAttempt());
      component.fadeActive.set(true);
      internals().applyLoadedWorld(makeWorld());

      component.ngOnDestroy();
      advance(1000);

      expect(component.fadeActive()).toBe(true);
      expect(gameWorld.playRevealEffects).not.toHaveBeenCalled();
    });

    it('la supervisión de una decisión que no es la última se abre al terminar la reacción, sin la espera de 400 ms', () => {
      component.attempt.set(makeAttempt());
      component.world.set(makeWorld());
      sim['chooseDecision'].mockReturnValue(of({
        ...makeAttempt({}, 'hospital-accion'),
        consequence: { text: 'La estudiante asiente.', source: 'OPTION' },
        retry: null,
      }));
      component.dialogue.set({
        key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [],
        choices: [{ key: 'o', text: 'O', decisionOptionId: 101, requiredToolCode: null, effect: {} }],
      } as unknown as DialogueState);

      component.executeDecision(101);
      // Sin director montado (no hay franja que esperar), la nota llega ya, antes del fundido de salida.
      expect(component.dialogue()?.speakerName).toBe('Consecuencia');
      // V7: el mundo de destino no carga mientras se lee la nota: se pide al cerrarla.
      expect(sim['getWorld']).not.toHaveBeenCalled();
      advance(340);
      expect(sim['getWorld']).not.toHaveBeenCalled();
      component.closeDialogue();
      expect(sim['getWorld']).toHaveBeenCalled();
    });
  });

  describe('guardado de la posición y anuncio accesible', () => {
    beforeEach(() => {
      component.attempt.set(makeAttempt());
      component.world.set(makeWorld());
    });

    it('la posición se guarda 550 ms después del último movimiento', () => {
      component.rememberPosition(120, 340);

      advance(549);
      expect(sim['updateWorldState']).not.toHaveBeenCalled();
      advance(1);
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
      expect(sim['updateWorldState']).toHaveBeenCalledWith('attempt-1', 120, 340, 'hospital-sala-escucha');
    });

    it('un movimiento nuevo antes de los 550 ms reinicia la espera y se guarda solo la última posición', () => {
      component.rememberPosition(120, 340);
      advance(300);
      component.rememberPosition(180, 360);

      advance(549);
      expect(sim['updateWorldState']).not.toHaveBeenCalled();
      advance(1);
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
      expect(sim['updateWorldState']).toHaveBeenCalledWith('attempt-1', 180, 360, 'hospital-sala-escucha');
    });

    // F6-12: el juego anuncia por las regiones vivas persistentes de la app (LiveRegionAnnouncer), no por una propia.
    it('el anuncio para lector de pantalla se emite 50 ms después de vaciar la región de cortesía', () => {
      const polite = () => document.querySelector<HTMLElement>('[data-live-region="polite"]')!;
      polite().textContent = 'Mensaje anterior';

      internals().announce('Introducción completada.');
      expect(polite().textContent).toBe('');

      advance(49);
      expect(polite().textContent).toBe('');
      advance(1);
      expect(polite().textContent).toBe('Introducción completada.');
    });
  });
});
