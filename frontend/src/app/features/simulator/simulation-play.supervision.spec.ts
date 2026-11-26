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

import { readFileSync } from 'fs';
import { join } from 'path';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { EMPTY, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { DialogueState, SimulationAttemptState, SimulationDecisionResult, SimulationWorldState, TutorDelCaso } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * DLG-05 acotado a la última decisión: tras la sexta decisión el intento ya figura como COMPLETED, pero la
 * «Supervisión clínica» se lee primero sobre la escena y el resultado se abre al cerrarla (sin la decisión en
 * dos tiempos completa, T9.12). Se ejercita la instancia, como el resto de specs de instancia del juego.
 */

const CASE_VERSION_ID = 7;
const LAST_NODE = 'hospital-cierre';

/** La consecuencia narrativa de la decisión (C2): qué pasa en el caso, nunca si estuvo bien o mal. */
const CONSEQUENCE = { text: 'La estudiante asiente y pregunta por su familia.', source: 'OPTION' };

function makeWorld(): SimulationWorldState {
  return {
    map: { key: 'hospital-sala-escucha', title: 'Sala de escucha' },
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

/** La respuesta de decidir (C2) con la forma normalizada por el servicio: el estado más consecuencia y reintento. */
const decided = (state: SimulationAttemptState, extra: Record<string, unknown> = {}) =>
  ({ ...state, consequence: CONSEQUENCE, retry: null, ...extra }) as unknown as SimulationAttemptState;

const completed = (extra: Record<string, unknown> = {}, decisionExtra: Record<string, unknown> = {}) =>
  decided(makeAttempt({ status: 'COMPLETED', completionReport: { ending: null }, ...extra }, LAST_NODE), decisionExtra);

describe('SimulationPlayComponent: supervisión de la última decisión (DLG-05)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;
  let audio: Record<string, Mock>;

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
      chooseDecision: vi.fn(() => of(completed())),
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
        { provide: CONSENT_RECORDER, useValue: new SessionConsentRecorder() },
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

  const tick = (ms = 0) => { vi.advanceTimersByTime(ms); TestBed.tick(); };

  /** Decide por última vez: el servidor responde con el intento ya COMPLETED. */
  function decideLast(response: SimulationAttemptState = completed()): void {
    component.attempt.set(makeAttempt());
    component.world.set(makeWorld());
    sim['chooseDecision'].mockReturnValue(of(response));
    component.dialogue.set({
      key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [],
      choices: [{ key: 'o', text: 'O', decisionOptionId: 101, requiredToolCode: null, effect: {} }],
    } as unknown as DialogueState);
    component.executeDecision(101);
    // Sin evidencia pendiente en este nodo: solo el fundido y la respuesta del servidor.
    tick(340);
    tick(100);
  }

  const keydown = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    component.handleGlobalInteraction(event);
    TestBed.tick();
    return event;
  };

  it('la voz compacta usa el tutor de la sala y, al reanudar sin tutor local, el del mapa inicial', () => {
    const preparar = (local?: TutorDelCaso, inicial?: SimulationWorldState['tutorInicial']) => {
      const mundo = makeWorld();
      component.world.set({ ...mundo, map: { ...mundo.map, ambient: { tutor: local } }, tutorInicial: inicial });
      return (component as unknown as {
        buildConsequenceDialogue(d: SimulationDecisionResult): DialogueState | null;
      }).buildConsequenceDialogue({ consequence: CONSEQUENCE } as SimulationDecisionResult);
    };
    const inicial = { nombre: 'Profesor', rol: 'Tutor del caso', recipeId: 'supervisor-clinico' };
    const local = { nombre: 'Sara', rol: 'Docente', recipeId: 'psicologa-hospitalaria', lineas: ['Hola'] };
    expect(preparar(local, inicial)).toMatchObject({
      speakerName: 'Sara', tutor: { rol: 'Docente' }, recipeId: 'psicologa-hospitalaria', hidePortrait: false,
    });
    expect(preparar(undefined, inicial)).toMatchObject({
      speakerName: 'Profesor', tutor: { rol: 'Tutor del caso' }, recipeId: 'supervisor-clinico', hidePortrait: false,
    });
    expect(preparar()).toMatchObject({ speakerName: 'Consecuencia', hidePortrait: true });
  });

  it('sincroniza la última posición antes de navegar a la ficha y conserva el intento abierto', () => {
    const navegar = vi.mocked(TestBed.inject(Router).navigate).mockResolvedValue(true);
    component.attempt.set(makeAttempt());
    const mundo = { ...makeWorld(), attemptId: 'attempt-1' };
    component.world.set(mundo);
    sim['updateWorldState'].mockReturnValue(of(mundo));
    component.rememberPosition(102, 111);
    component.verFichaDelCaso();
    expect(sim['updateWorldState']).toHaveBeenCalledWith('attempt-1', 102, 111, mundo.map.key);
    expect(navegar).toHaveBeenCalledWith(['/portal/simulador', CASE_VERSION_ID, 'ficha']);
    expect(sim['updateWorldState'].mock.invocationCallOrder[0]).toBeLessThan(navegar.mock.invocationCallOrder[0]);
    expect(sim['safeExit']).not.toHaveBeenCalled();
    expect(component.attempt()?.attemptId).toBe('attempt-1');
  });

  describe('la supervisión se lee antes del resultado', () => {
    it('tras la última decisión el intento está COMPLETED y la supervisión queda a la vista, no el resultado', () => {
      decideLast();

      expect(component.attempt()?.status).toBe('COMPLETED');
      expect(component.holdingOutcome()).toBe(true);
      expect(component.viewMode()).toBe('dialogue-cinematic');
      expect(component.dialogue()?.speakerName).toBe('Consecuencia');
      expect(component.dialogue()?.key).toMatch(/^consequence-/);
      expect(component.dialogue()?.choices).toEqual([]);
    });

    it('la supervisión de la última decisión no depende de la espera de 400 ms de las demás', () => {
      decideLast();

      // Sin avanzar más el reloj: ya está, no hay un instante con el resultado destapado.
      expect(component.dialogue()).not.toBeNull();
      expect(component.viewMode()).not.toBe('outcome');
    });

    it('no suena el cierre del caso mientras se lee la supervisión', () => {
      decideLast();

      expect(audio['playResolution']).not.toHaveBeenCalled();
      expect(audio['playSfx']).not.toHaveBeenCalledWith('session_complete');
    });

    it('una decisión que no es la última sigue en curso y la supervisión llega al terminar la reacción, sin espera de 400 ms', () => {
      component.attempt.set(makeAttempt());
      component.world.set(makeWorld());
      sim['chooseDecision'].mockReturnValue(of(decided(makeAttempt({}, 'hospital-accion'))));
      component.dialogue.set({
        key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [],
        choices: [{ key: 'o', text: 'O', decisionOptionId: 101, requiredToolCode: null, effect: {} }],
      } as unknown as DialogueState);

      component.executeDecision(101);
      tick(340);
      tick(100);

      expect(component.holdingOutcome()).toBe(false);
      expect(component.dialogue()?.speakerName).toBe('Consecuencia');
      expect(component.viewMode()).toBe('dialogue-cinematic');
      expect(audio['playResolution']).not.toHaveBeenCalled();
    });
  });

  describe('cerrar la supervisión abre el resultado, sin callejones', () => {
    it('«Continuar» y «Volver al mapa» (closeDialogue) abren el resultado y suena su cierre', () => {
      decideLast();

      component.closeDialogue();
      TestBed.tick();

      expect(component.holdingOutcome()).toBe(false);
      expect(component.dialogue()).toBeNull();
      expect(component.viewMode()).toBe('outcome');
      expect(audio['playResolution']).toHaveBeenCalledTimes(1);
      expect(audio['playSfx']).toHaveBeenCalledWith('session_complete');
    });

    it('«Salida segura» del panel lleva al resultado igual que «Continuar» y no pide una pausa al servidor', () => {
      decideLast();

      component.pauseFromOverlay();
      TestBed.tick();

      expect(sim['safeExit']).not.toHaveBeenCalled();
      expect(component.viewMode()).toBe('outcome');
      expect(component.attempt()?.status).toBe('COMPLETED');
      expect(component.pausing()).toBe(false);
    });

    it('Esc cierra la supervisión y muestra el resultado, una sola vez', () => {
      decideLast();

      const event = keydown('Escape');

      expect(event.defaultPrevented).toBe(true);
      expect(component.viewMode()).toBe('outcome');
      keydown('Escape');
      expect(component.viewMode()).toBe('outcome');
      expect(audio['playResolution']).toHaveBeenCalledTimes(1);
    });

    it('el resultado no se esconde de nuevo: la retención no reaparece al reabrir nada', () => {
      decideLast();
      component.closeDialogue();
      TestBed.tick();

      component.dialogue.set({
        key: 'otro', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: [],
      } as unknown as DialogueState);

      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
    });

    it('si el diálogo desaparece por otro camino el resultado se abre igual', () => {
      decideLast();

      component.dialogue.set(null);
      TestBed.tick();

      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
      expect(audio['playResolution']).toHaveBeenCalledTimes(1);
    });

    it('con movimiento reducido es igual (no hay animación de la que depender)', () => {
      component.reduceMotion.set(true);
      decideLast();
      expect(component.viewMode()).toBe('dialogue-cinematic');

      component.pauseFromOverlay();
      TestBed.tick();

      expect(component.viewMode()).toBe('outcome');
    });

    it('con una petición en curso Esc igualmente cierra la supervisión (no queda en cola)', () => {
      decideLast();
      component.busy.set(true);

      keydown('Escape');

      expect(component.viewMode()).toBe('outcome');
    });
  });

  describe('el resultado se abre siempre', () => {
    it('sin consecuencia ni reintento no hay nada que leer: resultado directo y su sonido de cierre', () => {
      decideLast(completed({}, { consequence: null, retry: null }));

      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
      expect(component.dialogue()).toBeNull();
      expect(audio['playResolution']).toHaveBeenCalledTimes(1);
    });

    it('si el diálogo de consecuencia no se puede armar, el resultado se abre igual', () => {
      const original = (component as any).buildConsequenceDialogue;
      (component as any).buildConsequenceDialogue = () => { throw new Error('consecuencia malformada'); };

      decideLast();

      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
      expect(audio['playResolution']).toHaveBeenCalledTimes(1);
      (component as any).buildConsequenceDialogue = original;
    });

    it('si el mapa no carga tras la última decisión, la supervisión no retiene el resultado', () => {
      sim['getWorld'].mockReturnValue(throwError(() => new Error('sin mapa')));

      decideLast();

      expect(component.error()).toBe('No pudimos cargar el mapa del caso.');
      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
    });

    it('una pausa nunca se esconde tras la supervisión (REGLA-004)', () => {
      decideLast();

      component.attempt.set(completed({ status: 'PAUSED' }));

      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
    });

    it('un intento nuevo empieza sin retención ni diálogo', () => {
      decideLast();
      sim['startAttempt'].mockReturnValue(of(makeAttempt()));

      component.startNewAttempt();
      TestBed.tick();

      expect(component.holdingOutcome()).toBe(false);
      expect(component.dialogue()).toBeNull();
      expect(component.viewMode()).toBe('explore');
      expect(audio['playResolution']).not.toHaveBeenCalled();
    });

    it('al recargar con el intento ya completado no hay supervisión retenida: se ve el resultado', () => {
      component.attempt.set(completed());

      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
    });
  });
});

describe('SimulationPlayComponent: lo que se muestra al decidir (RN-08, C2)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;

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
      chooseDecision: vi.fn(() => of(decided(makeAttempt()))),
      useTool: vi.fn(() => EMPTY),
    };
    const audio = {
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
    component?.ngOnDestroy();
    vi.useRealTimers();
    sessionStorage.clear();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  const tick = (ms = 0) => { vi.advanceTimersByTime(ms); TestBed.tick(); };
  const choices = [
    { key: 'o', text: 'O', decisionOptionId: 101, requiredToolCode: null, effect: {} },
    { key: 'p', text: 'P', decisionOptionId: 102, requiredToolCode: null, effect: {} },
  ];
  const withChoices = () => component.dialogue.set({
    key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices,
  } as unknown as DialogueState);

  /** Decide una escena que no es la última y deja pasar el fundido, la respuesta y los 400 ms de la lectura. */
  function decideMiddle(response: SimulationAttemptState, optionId = 101): void {
    component.attempt.set(makeAttempt());
    component.world.set(makeWorld());
    sim['chooseDecision'].mockReturnValue(of(response));
    withChoices();
    component.executeDecision(optionId);
    tick(340);
    tick(100);
    tick(400);
  }

  /** Todo lo que el diálogo a la vista dice, en una sola cadena. */
  const shownText = () => (component.dialogue()?.lines ?? []).map(line => line.text).join(' | ');

  it('la consecuencia narrativa va en el diálogo «Consecuencia», con emoción neutral y sin clasificación', () => {
    decideMiddle(decided(makeAttempt({}, 'hospital-accion')));

    expect(component.dialogue()?.speakerName).toBe('Consecuencia');
    expect(component.dialogue()?.emotion).toBe('neutral');
    expect(shownText()).toContain(CONSEQUENCE.text);
    expect(shownText()).not.toMatch(/adecuad|riesgo|inadecuad|prohib|alerta/i);
  });

  it('un reintento muestra el aviso neutro del juego y no el mensaje evaluativo del servidor', () => {
    decideMiddle(decided(makeAttempt({}, 'hospital-accion'),
      { consequence: null, retry: { allowed: true, message: 'Decisión con riesgo: revisa las implicaciones.' } }));

    expect(shownText()).toContain('El caso sigue en el mismo punto');
    expect(shownText()).not.toContain('Decisión con riesgo');
    expect(shownText()).not.toContain(CONSEQUENCE.text);
  });

  it('el efecto de cámara de la decisión no recibe clasificación: el mundo solo recibe la orden de revelar', () => {
    const gameWorld = { playRevealEffects: vi.fn() };
    (component as any).gameWorld = gameWorld;

    (component as any).playRevealEffects();

    expect(gameWorld.playRevealEffects).toHaveBeenCalledWith();
  });

  it('reenviar la misma elección tras un fallo usa el mismo requestId; otra opción recibe uno nuevo', () => {
    component.attempt.set(makeAttempt());
    component.world.set(makeWorld());
    sim['chooseDecision']
      .mockReturnValueOnce(throwError(() => new Error('red caída')))
      .mockReturnValueOnce(of(decided(makeAttempt({}, 'hospital-accion'))))
      .mockReturnValueOnce(of(decided(makeAttempt({}, 'hospital-accion'))));

    withChoices();
    component.executeDecision(101);
    tick(340);
    tick(100);

    withChoices();
    component.executeDecision(101);
    tick(340);
    tick(100);
    tick(400);

    withChoices();
    component.executeDecision(102);
    tick(340);
    tick(100);

    const ids = sim['chooseDecision'].mock.calls.map(call => call[2]);
    expect(ids[0]).toEqual(expect.any(String));
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
  });
});

describe('simulation-play: contrato de la supervisión retenida', () => {
  const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

  it('el modo de vista recibe la retención y el resultado solo se pinta cuando no hay retención', () => {
    expect(source).toMatch(/resolveViewMode\(\{[^}]*holdOutcome: this\.holdingOutcome\(\),\s*\}\)/);
    expect(source).toMatch(/@if \(!holdingOutcome\(\) && !reactingToLast\(\)\) \{\s*<app-attempt-outcome/);
  });

  it('la retención solo vale con el intento COMPLETED y con el diálogo a la vista', () => {
    expect(source).toMatch(
      /readonly holdingOutcome = computed\(\(\) =>\s*this\.supervisionHold\(\) && this\.dialogue\(\) !== null && this\.attempt\(\)\?\.status === 'COMPLETED'\);/,
    );
  });

  it('«Salida segura» con la supervisión retenida cierra el diálogo antes de mirar si hay algo que pausar', () => {
    expect(source).toMatch(
      /pauseFromOverlay\(\): void \{[^}]*if \(this\.holdingOutcome\(\)\) \{\s*this\.closeDialogue\(\);\s*return;\s*\}\s*(?:\/\/[^\n]*\n\s*if \(this\.reactingToLast\(\)\) \{[^}]*\}\s*)?const game = this\.attempt\(\);/,
    );
  });

  // F6-6 (H-05): el foco inicial lo toma el propio resultado, en su título (attempt-outcome.component.spec.ts lo fija
  // sobre el DOM); esta pantalla ya no enfoca nada y nunca un botón (Enter mantenida no reintenta el caso).
  it('la pantalla de juego no enfoca el resultado ni sus botones: lo hace el componente, en su título', () => {
    expect(source).not.toContain('app-attempt-outcome .outcome');
    expect(source).not.toMatch(/querySelector[^)]*oc-btn[^)]*\)\??\.focus/);
    expect(source).toMatch(/private releaseHeldOutcome\(\): void \{[^}]*this\.announce\('Se abre el resultado del caso\.'\);/);
  });
});
