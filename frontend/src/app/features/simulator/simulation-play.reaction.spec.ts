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
import { DialogueState, SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { FinReaccion } from './reaction-director.component';
import type { Mock } from 'vitest';

/**
 * 4.3.3: al elegir, el personaje reacciona en su sala (sin fundido antes de responder) y la nota de supervisión llega
 * después; el mundo de destino carga detrás de ella. Se ejercita la instancia con un director y un mundo falsos.
 */

const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');
const CASE_VERSION_ID = 7;
const CONSEQUENCE = { text: 'La estudiante asiente y pregunta por su familia.', source: 'OPTION' };
const REACTION = { line: 'Gracias por quedarse.', emotion: 'triste', gesture: 'se-acerca', objectKey: 'familia-duelo' };

function makeWorld(): SimulationWorldState {
  return {
    map: { key: 'hospital-sala-escucha', title: 'Sala de escucha' },
    objects: [{ key: 'familia-duelo', type: 'PERSON', label: 'Familia en crisis', metadata: {} }],
    tools: [], inventory: [], usedToolKeys: [], inspectedObjectKeys: [], flags: {},
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
      options: [{ id: 41, text: 'Opción' }],
    },
    completionReport: null,
    ...overrides,
  } as unknown as SimulationAttemptState;
}

const RESPUESTA_CON_REACCION = {
  ...makeAttempt({ persona: { bond: 'OPEN', activation: 'CALM', label: 'se abre y está serena' } }, 'hospital-accion'),
  consequence: CONSEQUENCE, retry: null, reaction: REACTION,
} as unknown as SimulationAttemptState;

describe('SimulationPlayComponent: la reacción al elegir (4.3.3)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;
  let audio: Record<string, Mock>;
  let director: { play: Mock; cancel: Mock; terminar: (motivo?: FinReaccion) => void };
  let stage: { setPersonaState: Mock; updatePatientVisualState: Mock };

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
      chooseDecision: vi.fn(() => of(RESPUESTA_CON_REACCION)),
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
    director = {
      play: vi.fn(),
      cancel: vi.fn(),
      terminar: (motivo: FinReaccion = 'completa') => component.afterReaction(motivo),
    };
    // El mundo falso: lo que la prueba mira (`stage`) y, para el resto de llamadas de la pantalla, funciones vacías.
    const mirado: Record<string, Mock> = { setPersonaState: vi.fn(), updatePatientVisualState: vi.fn() };
    stage = mirado as typeof stage;
    const mundo = new Proxy(mirado, { get: (t, k: string) => (t[k] ??= vi.fn()) });
    (component as unknown as Record<string, unknown>)['reaction'] = director;
    (component as unknown as Record<string, unknown>)['gameWorld'] = mundo;
  });

  afterEach(() => {
    component?.ngOnDestroy();
    vi.useRealTimers();
    sessionStorage.clear();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  function montarConDialogoDeDecision() {
    component.attempt.set(makeAttempt());
    component.world.set(makeWorld());
    component.dialogue.set({
      key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [],
      choices: [{ key: 'o', text: 'O', decisionOptionId: 41, requiredToolCode: null, effect: {} }],
    } as unknown as DialogueState);
    return { component, service: sim, director };
  }

  it('al elegir no hay fundido antes de responder: la reacción ocurre en la sala actual', () => {
    const { component, service } = montarConDialogoDeDecision();
    component.executeDecision(41);
    expect(component.fadeActive()).toBe(false);
    expect(service['chooseDecision']).toHaveBeenCalledTimes(1);
  });

  it('la reacción arranca con el estado antes y después, y el nombre de quien reacciona', () => {
    montarConDialogoDeDecision();
    component.executeDecision(41);
    expect(director.play).toHaveBeenCalledTimes(1);
    const [entrada, quien] = director.play.mock.calls[0];
    expect(entrada.reaction).toMatchObject({ line: 'Gracias por quedarse.' });
    expect(entrada.personaAntes.label).toBe('se muestra cautelosa y tensa');
    expect(entrada.personaDespues.label).toBe('se abre y está serena');
    expect(quien.nombre).toBe('Familia en crisis');
  });

  it('la nota de supervisión llega después de la reacción y el mundo de destino carga al cerrarla (V7)', async () => {
    const { component, service } = montarConDialogoDeDecision();
    component.executeDecision(41);
    expect(component.reacting()).toBe(true);
    expect(component.dialogue()).toBeNull();
    expect(component.worldMotionPaused()).toBe(true);
    expect(component.inputBlocked()).toBe(false);
    director.terminar('completa');
    expect(component.reacting()).toBe(false);
    expect(component.dialogue()?.speakerName).toBe('Consecuencia');
    expect(service['getWorld']).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(service['getWorld'], 'V7: la escena no cambia mientras se lee la consecuencia').not.toHaveBeenCalled();
    component.closeDialogue();
    await vi.advanceTimersByTimeAsync(400);
    expect(service['getWorld']).toHaveBeenCalled();
  });

  // V7: orden fijo — reacción (espera) → consecuencia (espera) → aviso de cambio de lugar (espera) → cambio.
  describe('V7: nunca se cambia de lugar sin aviso', () => {
    const OTRA_SALA = () => ({ ...makeWorld(), map: { key: 'hospital-urgencias', title: 'Urgencias del hospital' } } as unknown as SimulationWorldState);

    it('si la escena siguiente es otra sala, tras la consecuencia sale «La historia continúa en…» y solo «Ir a…» la carga', async () => {
      const { component, service } = montarConDialogoDeDecision();
      service['getWorld'].mockReturnValue(of(OTRA_SALA()));
      component.executeDecision(41);
      director.terminar('completa');
      expect(component.dialogue()?.speakerName).toBe('Consecuencia');
      await vi.advanceTimersByTimeAsync(2_000);
      expect(component.cambioDeLugar(), 'nada se pisa: la tarjeta espera a que se cierre la consecuencia').toBeNull();
      component.closeDialogue();
      expect(component.cambioDeLugar()?.lugar).toBe('Urgencias del hospital');
      expect(component.inputBlocked(), 'con la tarjeta el mundo no se mueve').toBe(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(component.world()?.map.key, 'sin pulsar, la sala no cambia').toBe('hospital-sala-escucha');
      expect(component.fadeActive()).toBe(false);
      component.irAlLugar();
      expect(component.cambioDeLugar()).toBeNull();
      await vi.advanceTimersByTimeAsync(400);
      expect(component.world()?.map.key).toBe('hospital-urgencias');
      expect(service['getWorld'], 'el mundo se pide una sola vez').toHaveBeenCalledTimes(1);
    });

    it('otra escena con otra clave pero el mismo lugar (mismo nombre) no es un cambio de lugar: no hay tarjeta', () => {
      const { component, service } = montarConDialogoDeDecision();
      service['getWorld'].mockReturnValue(of({ ...makeWorld(), map: { key: 'hospital-sala-escucha-2', title: 'Sala de escucha' } }));
      component.executeDecision(41);
      director.terminar('completa');
      component.closeDialogue();
      expect(component.cambioDeLugar()).toBeNull();
      expect(component.fadeActive()).toBe(true);
    });

    it('si la escena siguiente es en la misma sala no hay tarjeta: el mundo se aplica al cerrar la consecuencia', async () => {
      const { component } = montarConDialogoDeDecision();
      component.executeDecision(41);
      director.terminar('completa');
      component.closeDialogue();
      expect(component.cambioDeLugar()).toBeNull();
      expect(component.fadeActive(), 'el fundido de siempre empieza ya').toBe(true);
    });

    it('sin consecuencia, la tarjeta sale en cuanto termina la reacción (con «Continuar»)', () => {
      const { component, service } = montarConDialogoDeDecision();
      service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION, consequence: null, retry: null }));
      service['getWorld'].mockReturnValue(of(OTRA_SALA()));
      component.executeDecision(41);
      expect(component.cambioDeLugar(), 'durante la reacción, nada').toBeNull();
      director.terminar('completa');
      expect(component.dialogue()).toBeNull();
      expect(component.cambioDeLugar()?.lugar).toBe('Urgencias del hospital');
    });

    it('«Salida segura» con la tarjeta a la vista la quita y pausa (REGLA-004); un mundo tardío ya no la trae', () => {
      const { component, service } = montarConDialogoDeDecision();
      service['getWorld'].mockReturnValue(of(OTRA_SALA()));
      component.executeDecision(41);
      director.terminar('completa');
      component.closeDialogue();
      expect(component.cambioDeLugar()).not.toBeNull();
      component.pauseFromOverlay();
      expect(component.cambioDeLugar()).toBeNull();
      expect(service['safeExit']).toHaveBeenCalledTimes(1);
    });
  });

  it('REGLA-004: con la supervisión del cierre a la vista no hay fundido encima; el mundo del cierre carga detrás', () => {
    const { component, service } = montarConDialogoDeDecision();
    service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION, status: 'COMPLETED' }));
    component.executeDecision(41);
    director.terminar('completa');
    expect(component.dialogue()?.speakerName).toBe('Consecuencia');
    expect(component.fadeActive(), 'ningún fundido tapa la supervisión ni su «Salida segura»').toBe(false);
    expect(service['getWorld']).toHaveBeenCalled();
  });

  it('el cierre sin supervisión que mostrar sigue con el fundido de siempre', () => {
    const { component, service } = montarConDialogoDeDecision();
    service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION, status: 'COMPLETED', consequence: null, retry: null }));
    component.executeDecision(41);
    director.terminar('completa');
    expect(component.dialogue()).toBeNull();
    expect(component.fadeActive()).toBe(true);
  });

  it('la última decisión retiene el resultado tras la reacción, como antes', () => {
    const { component, service } = montarConDialogoDeDecision();
    service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION, status: 'COMPLETED' }));
    component.executeDecision(41);
    director.terminar('saltada');
    expect(component.holdingOutcome()).toBe(true);
  });

  it('la segunda oportunidad también reacciona y luego avisa el reintento', () => {
    const { component, service } = montarConDialogoDeDecision();
    service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION, consequence: null, retry: { allowed: true, message: '' } }));
    component.executeDecision(41);
    director.terminar('completa');
    expect(component.dialogue()?.lines.map(l => l.text)).toContain('El caso sigue en el mismo punto. Si quieres, revisa la escena; luego vuelve a hablar con la persona para responder otra vez.');
  });

  it('pedir la salida segura durante la reacción la corta y pausa en el acto', () => {
    const { component, service } = montarConDialogoDeDecision();
    service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION }));
    component.executeDecision(41);
    component.pauseFromOverlay();
    TestBed.tick();
    expect(director.cancel).toHaveBeenCalled();
    expect(service['safeExit']).toHaveBeenCalledTimes(1);
    expect(service['safeExit']).toHaveBeenCalledWith('attempt-1', expect.any(String));
    expect(component.dialogue()?.speakerName).not.toBe('Consecuencia');
    // El cierre «cancelada» del director no reabre la secuencia.
    director.terminar('cancelada');
    expect(component.dialogue()?.speakerName).not.toBe('Consecuencia');
  });

  it('en la última decisión el resultado no se abre ni se pinta mientras dura la reacción', () => {
    const { component, service } = montarConDialogoDeDecision();
    service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION, status: 'COMPLETED', completionReport: { ending: null } }));
    component.executeDecision(41);
    expect(component.attempt()?.status).toBe('COMPLETED');
    expect(component.reacting()).toBe(true);
    expect(component.viewMode()).not.toBe('outcome');
    expect(component.reactingToLast()).toBe(true);
    expect(component.inputBlocked()).toBe(false);
    director.terminar('completa');
    expect(component.reactingToLast()).toBe(false);
    expect(component.holdingOutcome()).toBe(true);
    expect(component.viewMode()).toBe('dialogue-cinematic');
  });

  it('«Salida segura» en la reacción de la última decisión la corta y abre el resultado, sin supervisión', () => {
    const { component, service } = montarConDialogoDeDecision();
    service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION, status: 'COMPLETED', completionReport: { ending: null } }));
    component.executeDecision(41);
    component.pauseFromOverlay();
    TestBed.tick();
    expect(director.cancel).toHaveBeenCalled();
    expect(audio['playResolution']).toHaveBeenCalled();
    expect(service['getWorld']).toHaveBeenCalled();
    expect(component.busy()).toBe(false);
    expect(component.reacting()).toBe(false);
    expect(component.dialogue()).toBeNull();
    expect(component.viewMode()).toBe('outcome');
    expect(service['safeExit']).not.toHaveBeenCalled();
  });

  it('en la reacción de la última decisión «Salida segura» sigue a la vista y Esc (el manejador de teclado) corta y abre el resultado', () => {
    const { component, service } = montarConDialogoDeDecision();
    service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION, status: 'COMPLETED', completionReport: { ending: null } }));
    component.executeDecision(41);
    component.worldStarted.set(true);
    // El pie con el botón y el error de carga cuentan la salida como presente.
    expect(component.footerExit()).toBe(true);
    expect(source).toMatch(/@if \(game\.status === 'IN_PROGRESS' \|\| reactingToLast\(\)\) \{\s*<!--[^>]*-->\s*<app-safe-exit-button/);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    component.handleGlobalInteraction(esc);
    TestBed.tick();
    expect(esc.defaultPrevented).toBe(true);
    expect(director.cancel).toHaveBeenCalled();
    expect(component.reacting()).toBe(false);
    expect(component.viewMode()).toBe('outcome');
    expect(service['safeExit']).not.toHaveBeenCalled();
  });

  it('la pausa durante la reacción no anuncia que se guardará al terminar: sale en el acto', () => {
    const { component } = montarConDialogoDeDecision();
    const announce = vi.spyOn(component as unknown as { announce(m: string, p?: string): void }, 'announce');
    component.executeDecision(41);
    component.pauseFromOverlay();
    expect(announce).not.toHaveBeenCalledWith(expect.stringContaining('Se guardará'), expect.anything());
  });

  it('sin objectKey habla la persona clave de la sala', () => {
    const { component, service } = montarConDialogoDeDecision();
    component.world.set({
      ...makeWorld(),
      objects: [{ key: 'madre', type: 'PERSON', label: 'La madre', metadata: { personaClave: true } }],
    } as unknown as SimulationWorldState);
    service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION, reaction: { ...REACTION, objectKey: null } }));
    component.executeDecision(41);
    expect(director.play.mock.calls[0][1].nombre).toBe('La madre');
  });

  it('una reacción null no rompe nada: sigue a la nota de supervisión', () => {
    const { component, service } = montarConDialogoDeDecision();
    service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION, reaction: null }));
    component.executeDecision(41);
    director.terminar('completa');
    expect(component.dialogue()?.speakerName).toBe('Consecuencia');
  });

  it('una segunda elección durante la reacción no envía otra decisión', () => {
    const { component, service } = montarConDialogoDeDecision();
    component.executeDecision(41);
    component.executeDecision(41);
    expect(service['chooseDecision']).toHaveBeenCalledTimes(1);
  });

  it('durante la reacción solo Esc llega a la partida: Enter y E no abren nada', () => {
    const { component } = montarConDialogoDeDecision();
    component.executeDecision(41);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    component.handleGlobalInteraction(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(component.dialogue()).toBeNull();
  });

  it('el estado de la persona en palabras se pone sobre la persona clave fuera de la reacción', () => {
    montarConDialogoDeDecision();
    (component as unknown as { syncPersonaIcon(a: SimulationAttemptState): void }).syncPersonaIcon(RESPUESTA_CON_REACCION);
    expect(stage.setPersonaState).toHaveBeenCalledWith('se abre y está serena');
  });

  describe('la escena siguiente no se anuncia antes de tiempo', () => {
    const ESCENA_NUEVA = {
      ...RESPUESTA_CON_REACCION,
      currentNode: { id: 2, key: 'hospital-accion', title: 'Escena nueva', goal: 'Objetivo nuevo', narrative: '', terminal: false, options: [{ id: 42, text: 'Otra' }] },
    } as unknown as SimulationAttemptState;

    function montarEnEscenaAnterior() {
      const montado = montarConDialogoDeDecision();
      component.attempt.set(makeAttempt({
        currentNode: { id: 1, key: 'hospital-seguimiento', title: 'Escena anterior', goal: 'Objetivo anterior', narrative: '', terminal: false, options: [{ id: 41, text: 'Opción' }] },
      }));
      montado.service['chooseDecision'].mockReturnValue(of(ESCENA_NUEVA));
      return montado;
    }

    it('mientras reacciona, la barra y la ficha siguen en la escena anterior', () => {
      montarEnEscenaAnterior();
      component.executeDecision(41);
      TestBed.tick();
      expect(component.reacting()).toBe(true);
      expect(component.stageLabel()).toBe('Escena anterior');
      expect(component.refreshGuide().objetivo).toBe('Objetivo anterior');
    });

    it('al terminar la reacción cambian a la escena nueva', () => {
      montarEnEscenaAnterior();
      component.executeDecision(41);
      director.terminar('completa');
      TestBed.tick();
      expect(component.stageLabel()).toBe('Escena nueva');
      expect(component.refreshGuide().objetivo).toBe('Objetivo nuevo');
    });

    it('si la reacción se corta («Salida segura» o Esc), la escena nueva se muestra en el acto', () => {
      montarEnEscenaAnterior();
      component.executeDecision(41);
      component.pauseFromOverlay();
      TestBed.tick();
      expect(component.reacting()).toBe(false);
      expect(component.stageLabel()).toBe('Escena nueva');
    });

    it('si la decisión no cambia de escena, nada se retiene', () => {
      const { service } = montarEnEscenaAnterior();
      service['chooseDecision'].mockReturnValue(of({ ...ESCENA_NUEVA, currentNode: { ...ESCENA_NUEVA.currentNode, key: 'hospital-seguimiento', title: 'Escena anterior' } }));
      component.executeDecision(41);
      expect(component.stageLabel()).toBe('Escena anterior');
      director.terminar('completa');
      expect(component.stageLabel()).toBe('Escena anterior');
    });
  });

  it('en la decisión, la etiqueta nueva no se adelanta: la dice la reacción en su paso', () => {
    const { component } = montarConDialogoDeDecision();
    component.executeDecision(41);
    expect(stage.setPersonaState).not.toHaveBeenCalled();
  });
});

// Bloque I1 (aviso de K1): quien reacciona sin ser la persona clave de la sala (el hermano mayor en la entrada) también
// tiene cara: la del personaje de la sala, la misma fuente que el diálogo y la burbuja.
describe('SimulationPlayComponent - la cara de quien reacciona', () => {
  it('reactionActor cae a characterVisualOf del personaje que reacciona', () => {
    expect(source).toContain('const visual = (isKeyPerson ? this.patientVisual() : null) ?? this.gameWorld?.characterVisualOf(object.key) ?? null;');
  });
});
