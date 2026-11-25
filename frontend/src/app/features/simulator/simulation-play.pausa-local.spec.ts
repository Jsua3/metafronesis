// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta (mismo doble que el resto de specs de instancia).
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
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, NEVER, Subject, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { DialogueState, SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { DRAFT_COPY } from './draft-copy';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * Ronda V3 de robustez del juego: la salida segura saca a la persona en el acto aunque no haya red (REGLA-004), la
 * decisión en vuelo no se pierde en silencio, la retroalimentación de una decisión sobrevive a recargar y a Esc, y lo que
 * quedó pendiente (decisión, posición, conversación) se retoma al volver la conexión. Se ejercita la instancia, sin plantilla.
 */

const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');
const http = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });
const online = () => window.dispatchEvent(new Event('online'));

const DIALOGO = {
  key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [{ order: 1, text: 'a' }, { order: 2, text: 'b' }, { order: 3, text: 'c' }], choices: [],
} as unknown as DialogueState;

function makeWorld(over: Record<string, unknown> = {}): SimulationWorldState {
  return {
    map: { key: 'sala', title: 'Sala' },
    objects: [
      { key: 'abuela', type: 'PERSON', label: 'Abuela', metadata: {} },
      { key: 'carpeta', type: 'OBJECT', label: 'Carpeta', metadata: {} },
    ],
    tools: [], inventory: [], usedToolKeys: [], inspectedObjectKeys: [], flags: {}, ...over,
  } as unknown as SimulationWorldState;
}

function makeAttempt(over: Record<string, unknown> = {}, nodeId = 1): SimulationAttemptState {
  return {
    attemptId: 'attempt-1', caseVersionId: 7, caseTitle: 'Caso demo', status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { id: nodeId, key: `n${nodeId}`, title: 'Título', narrative: 'N', terminal: false, options: [{ id: 41, text: 'Opción' }, { id: 42, text: 'Otra' }] },
    completionReport: null,
    ...over,
  } as unknown as SimulationAttemptState;
}

/** La respuesta de una decisión: la escena siguiente (nodo 2, token nuevo, otra persona) con su consecuencia. */
const respuestaDeDecision = (over: Record<string, unknown> = {}) => makeAttempt({
  persona: { bond: 'OPEN', activation: 'CALM', label: 'se muestra abierta y serena' },
  consequence: { text: 'Ella respira hondo.' },
  retry: false,
  ...over,
}, 2);

describe('SimulationPlayComponent: ronda V3 de robustez', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;
  let audio: Record<string, Mock>;
  let notificaciones: NotificationService;

  const interno = () => component as unknown as Record<string, any>;
  const pausado = (over: Record<string, unknown> = {}) => makeAttempt({ status: 'PAUSED', ...over });
  const avisos = () => { let v: Array<{ text: string }> = []; notificaciones.messages$.subscribe(m => (v = m)).unsubscribe(); return v.map(m => m.text); };
  const llamadasDeSafeExit = () => sim['safeExit'].mock.calls.length;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    sessionStorage.clear();
    sim = {
      getActiveAttempt: vi.fn(() => EMPTY),
      safeExit: vi.fn(() => EMPTY),
      updateWorldState: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => NEVER),
      getProgressMap: vi.fn(() => EMPTY),
      getScenarioConfig: vi.fn(() => of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] })),
      chooseDecision: vi.fn(() => EMPTY),
      startAttempt: vi.fn(() => EMPTY),
      openInteraction: vi.fn(() => EMPTY),
      recordNpcInteraction: vi.fn(() => EMPTY),
      useTool: vi.fn(() => NEVER),
      resumeAttempt: vi.fn(() => of(makeAttempt())),
      getAttempt: vi.fn(() => EMPTY),
    };
    audio = {
      init: vi.fn(), dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(), playResolution: vi.fn(),
      setScene: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
    };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        { provide: CONSENT_RECORDER, useValue: new SessionConsentRecorder() },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: '7' }) } } },
      ],
    });
    notificaciones = TestBed.inject(NotificationService);
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
    component.attempt.set(makeAttempt());
    component.world.set(makeWorld());
    interno()['gameWorld'] = new Proxy({ isKeyPerson: vi.fn(() => false), peopleNear: vi.fn(() => []) } as Record<string, Mock>, { get: (t, k: string) => (t[k] ??= vi.fn()) });
  });

  afterEach(() => {
    component?.ngOnDestroy();
    vi.useRealTimers();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('B1: «Salida segura» saca a la persona en el acto, con o sin red (REGLA-004)', () => {
    it('sin red: queda en pausa al instante (intento PAUSED, superposiciones cerradas, ui_cancel) y la pantalla lo dice sin error', () => {
      sim['safeExit'].mockReturnValue(throwError(() => http(0)));
      component.dialogue.set(DIALOGO);
      component.journalOpen.set(true);

      component.pauseFromOverlay();

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.dialogue()).toBeNull();
      expect(component.journalOpen()).toBe(false);
      expect(audio['playSfx']).toHaveBeenCalledWith('ui_cancel');
      expect(component.pauseNote()).toBe(DRAFT_COPY.pauseNotRegistered.text);
      expect(component.actionError()).toBe('');
    });

    it('no espera a ninguna petición: con la respuesta colgada informa que está guardando', () => {
      sim['safeExit'].mockReturnValue(NEVER);

      component.pauseFromOverlay();

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.pauseNote()).toBe('Guardando la pausa…');
      expect(component.busy()).toBe(false);
    });

    it('la plantilla pasa la nota a la pantalla de pausa', () => {
      expect(source).toMatch(/<app-attempt-outcome[^>]*\[pauseNote\]="pauseNote\(\)"/);
    });

    it('reintenta con espera creciente (2, 4 y 8 s) y nunca saca a la persona de la pausa', () => {
      sim['safeExit'].mockReturnValue(throwError(() => http(0)));
      component.pauseFromOverlay();
      expect(llamadasDeSafeExit()).toBe(1);
      vi.advanceTimersByTime(1_999);
      expect(llamadasDeSafeExit()).toBe(1);
      vi.advanceTimersByTime(1);
      expect(llamadasDeSafeExit()).toBe(2);
      vi.advanceTimersByTime(4_000);
      expect(llamadasDeSafeExit()).toBe(3);
      vi.advanceTimersByTime(8_000);
      expect(llamadasDeSafeExit()).toBe(4);
      expect(component.attempt()?.status).toBe('PAUSED');
    });

    it('un plazo vencido o un 5xx también dejan la pausa pendiente y se reintenta', () => {
      sim['safeExit'].mockReturnValueOnce(NEVER).mockReturnValueOnce(throwError(() => http(503))).mockReturnValue(NEVER);
      component.pauseFromOverlay();
      vi.advanceTimersByTime(15_000);
      expect(component.pauseNote()).not.toBeNull();
      vi.advanceTimersByTime(2_000);
      expect(llamadasDeSafeExit()).toBe(2);
      vi.advanceTimersByTime(4_000);
      expect(llamadasDeSafeExit()).toBe(3);
    });

    it('al llegar «online» reintenta en el acto y, al registrarse, adopta el estado del servidor y recarga el mundo', () => {
      sim['safeExit'].mockReturnValueOnce(throwError(() => http(0))).mockReturnValue(of(pausado({ caseTitle: 'Caso del servidor 9' })));
      component.pauseFromOverlay();
      expect(sim['getWorld']).not.toHaveBeenCalled();

      online();

      expect(llamadasDeSafeExit()).toBe(2);
      expect(component.attempt()?.caseTitle).toBe('Caso del servidor 9');
      expect(component.pauseNote()).toBeNull();
      expect(component.pausing()).toBe(false);
      expect(sim['getWorld']).toHaveBeenCalledTimes(1);
      expect(component.busy()).toBe(true);   // el mundo se recarga como siempre
      vi.advanceTimersByTime(60_000);
      expect(llamadasDeSafeExit()).toBe(2);
    });

    it('un 4xx consulta el intento: si sigue en curso reintenta una vez', () => {
      sim['safeExit'].mockReturnValueOnce(throwError(() => http(400))).mockReturnValue(NEVER);
      sim['getAttempt'].mockReturnValue(of(makeAttempt()));

      component.pauseFromOverlay();

      expect(sim['getAttempt']).toHaveBeenCalledWith('attempt-1');
      expect(llamadasDeSafeExit()).toBe(2);
    });

    it('un 4xx consulta el intento: si el servidor ya lo tiene en pausa se adopta sin reenviar', () => {
      sim['safeExit'].mockReturnValue(throwError(() => http(409)));
      sim['getAttempt'].mockReturnValue(of(pausado({ caseTitle: 'Caso del servidor 7' })));

      component.pauseFromOverlay();

      expect(llamadasDeSafeExit()).toBe(1);
      expect(component.attempt()?.caseTitle).toBe('Caso del servidor 7');
      expect(component.pauseNote()).toBeNull();
      expect(sim['getWorld']).toHaveBeenCalledTimes(1);
    });

    describe('«Reanudar» con la pausa aún sin registrar', () => {
      it('sin red: lo intenta en ese momento, avisa que reanudará al volver la conexión y NO reanuda un intento que el servidor no vio', () => {
        sim['safeExit'].mockReturnValue(throwError(() => http(0)));
        component.pauseFromOverlay();

        component.resumeCurrentAttempt();

        expect(llamadasDeSafeExit()).toBe(2);
        expect(sim['resumeAttempt']).not.toHaveBeenCalled();
        expect(component.actionError()).toBe(DRAFT_COPY.pauseResumeOffline.text);
        expect(component.attempt()?.status).toBe('PAUSED');

        sim['safeExit'].mockReturnValue(of(pausado()));
        sim['getWorld'].mockReturnValue(of(makeWorld()));
        online();

        expect(sim['resumeAttempt']).toHaveBeenCalledTimes(1);
        expect(component.attempt()?.status).toBe('IN_PROGRESS');
      });

      it('con red: registra la pausa y reanuda al terminar de recargar el mundo, una sola vez', () => {
        sim['safeExit'].mockReturnValueOnce(throwError(() => http(0))).mockReturnValue(of(pausado()));
        sim['getWorld'].mockReturnValue(of(makeWorld()));
        component.pauseFromOverlay();

        component.resumeCurrentAttempt();
        component.resumeCurrentAttempt();

        expect(llamadasDeSafeExit()).toBe(2);
        expect(sim['resumeAttempt']).toHaveBeenCalledTimes(1);
        expect(component.attempt()?.status).toBe('IN_PROGRESS');
      });
    });

    it('un intento nuevo cancela el temporizador y el oyente de «online»', () => {
      sim['safeExit'].mockReturnValue(throwError(() => http(0)));
      component.pauseFromOverlay();

      component.startNewAttempt();
      vi.advanceTimersByTime(60_000);
      online();

      expect(llamadasDeSafeExit()).toBe(1);
    });

    it('al destruir el componente se cancelan el temporizador y el oyente', () => {
      sim['safeExit'].mockReturnValue(throwError(() => http(0)));
      component.pauseFromOverlay();

      component.ngOnDestroy();   // lanza UN último safeExit (I-2) y nada más
      const tras = llamadasDeSafeExit();
      vi.advanceTimersByTime(60_000);
      online();

      expect(tras).toBe(2);
      expect(llamadasDeSafeExit()).toBe(2);
    });

    it('en ensayo, si el ensayo ya no existe dice «ya no existe» y deja de reintentar', () => {
      (component as any).rehearsalApi = { read: vi.fn(() => throwError(() => http(404, { code: 'REHEARSAL_GONE' }))), start: vi.fn(() => EMPTY) };
      component.mode.set('rehearsal');
      sim['safeExit'].mockReturnValue(throwError(() => http(404, { code: 'REHEARSAL_GONE' })));
      sim['getAttempt'].mockReturnValue(throwError(() => http(404, { code: 'REHEARSAL_GONE' })));

      component.pauseFromOverlay();
      vi.advanceTimersByTime(60_000);
      online();

      expect(component.rehearsalGone()).toBe(true);
      expect(llamadasDeSafeExit()).toBe(1);
    });

    it('bajo el aviso de contenido y bajo la tarjeta de reanudar no hace nada', () => {
      component.showContentWarning.set(true);
      component.pauseFromOverlay();
      component.showContentWarning.set(false);
      component.showResumePrompt.set(true);
      component.pauseFromOverlay();
      expect(llamadasDeSafeExit()).toBe(0);
      expect(component.attempt()?.status).toBe('IN_PROGRESS');
    });
  });

  describe('A2: Esc con una decisión en vuelo', () => {
    it('la persona sale ya; el envío de la pausa espera la respuesta de la decisión y el servidor ve la decisión primero', () => {
      const decision$ = new Subject<SimulationAttemptState>();
      sim['chooseDecision'].mockReturnValue(decision$);
      sim['safeExit'].mockReturnValue(of(pausado(), ));
      component.dialogue.set(DIALOGO);
      component.executeDecision(41);

      component.pauseFromOverlay();

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.dialogue()).toBeNull();
      expect(llamadasDeSafeExit()).toBe(0);

      decision$.next(respuestaDeDecision());

      expect(llamadasDeSafeExit()).toBe(1);
      expect(sim['safeExit']).toHaveBeenCalledWith('attempt-1', 'Salida segura solicitada');
      expect(sim['chooseDecision'].mock.invocationCallOrder[0]).toBeLessThan(sim['safeExit'].mock.invocationCallOrder[0]);
    });

    it('la respuesta que llega con la pausa local adopta nodo, persona y token SIN dejar de estar en pausa, borra la intención y no reproduce la reacción', () => {
      const decision$ = new Subject<SimulationAttemptState>();
      const reaccion = { play: vi.fn(), cancel: vi.fn() };
      interno()['reaction'] = reaccion;
      sim['chooseDecision'].mockReturnValue(decision$);
      sim['safeExit'].mockReturnValue(NEVER);
      component.executeDecision(41);
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).not.toBeNull();
      component.pauseFromOverlay();

      decision$.next(respuestaDeDecision({ reaction: { line: 'Hola' } }));

      const intento = component.attempt()!;
      expect(intento.status).toBe('PAUSED');
      expect(intento.currentNode.id).toBe(2);
      expect(intento.persona.label).toBe('se muestra abierta y serena');
      expect(component.reacting()).toBe(false);
      expect(reaccion.play).not.toHaveBeenCalled();
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).toBeNull();
      expect(interno()['pendingDecisionRequest']).toBeNull();
      expect(component.busy()).toBe(false);
    });

    it('al reanudar se muestra la consecuencia que no se alcanzó a leer', () => {
      const decision$ = new Subject<SimulationAttemptState>();
      sim['chooseDecision'].mockReturnValue(decision$);
      sim['safeExit'].mockReturnValue(of(pausado()));
      sim['getWorld'].mockReturnValue(of(makeWorld()));
      sim['resumeAttempt'].mockReturnValue(of(respuestaDeDecision({ consequence: undefined })));
      component.executeDecision(41);
      component.pauseFromOverlay();
      decision$.next(respuestaDeDecision());

      component.resumeCurrentAttempt();

      expect(component.attempt()?.status).toBe('IN_PROGRESS');
      expect(component.dialogue()?.lines.map(l => l.text)).toContain('Ella respira hondo.');
    });

    it('si la decisión falla con la pausa local puesta: la persona sigue fuera, sin aviso ni conversación, y al reanudar se le dice que puede volver a elegir', () => {
      const decision$ = new Subject<SimulationAttemptState>();
      sim['chooseDecision'].mockReturnValue(decision$);
      sim['safeExit'].mockReturnValue(of(pausado()));
      sim['getWorld'].mockReturnValue(of(makeWorld()));
      component.dialogue.set(DIALOGO);
      component.executeDecision(41);
      component.pauseFromOverlay();

      decision$.error(http(500));

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.dialogue()).toBeNull();
      expect(component.actionError()).toBe('');
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).not.toBeNull();
      expect(llamadasDeSafeExit()).toBe(1);

      component.resumeCurrentAttempt();

      expect(avisos()).toContain(DRAFT_COPY.choiceNotSaved.text);
    });

    it('si la decisión cerró el caso se adopta su resultado y la pausa ya no se pide', () => {
      const decision$ = new Subject<SimulationAttemptState>();
      sim['chooseDecision'].mockReturnValue(decision$);
      component.executeDecision(41);
      component.pauseFromOverlay();

      decision$.next(respuestaDeDecision({ status: 'COMPLETED' }));

      expect(component.attempt()?.status).toBe('COMPLETED');
      expect(llamadasDeSafeExit()).toBe(0);
      expect(component.pausing()).toBe(false);
    });

    it('sin decisión en vuelo la pausa se envía en el acto', () => {
      component.pauseFromOverlay();
      expect(llamadasDeSafeExit()).toBe(1);
    });

    it('ya no queda el código de la pausa rechazada por token ni el nombre «cola»', () => {
      expect(source).not.toContain('pauseAwaitsDecision');
      expect(source).not.toContain('repeatPauseAfterDecision');
      expect(source).not.toContain('startQueuedPause');
    });
  });

  describe('A3: la retroalimentación de la decisión no se pierde', () => {
    describe('(a) recargar con una intención cuyo nodo ya avanzó', () => {
      const guardarIntencion = () => sessionStorage.setItem('siep_decision_pendiente_attempt-1', JSON.stringify({ attemptId: 'attempt-1', nodeId: 1, decisionOptionId: 41, requestId: 'req-guardado' }));

      it('se reenvía con el MISMO requestId y su consecuencia se muestra sobre la escena', () => {
        guardarIntencion();
        const avanzado = respuestaDeDecision();
        component.attempt.set(avanzado);
        sim['chooseDecision'].mockReturnValue(of(avanzado));

        interno()['restorePendingDecision'](avanzado);
        interno()['applyLoadedWorld'](makeWorld());

        expect(sim['chooseDecision']).toHaveBeenCalledWith('attempt-1', 41, 'req-guardado');
        expect(component.dialogue()?.lines.map(l => l.text)).toContain('Ella respira hondo.');
        expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).toBeNull();
        expect(interno()['pendingDecisionRequest']).toBeNull();
      });

      it('si el reenvío falla por red, no hay diálogo y la intención NO se borra (M-6): se reintentará en la próxima carga', () => {
        guardarIntencion();
        const avanzado = respuestaDeDecision();
        component.attempt.set(avanzado);
        sim['chooseDecision'].mockReturnValue(throwError(() => http(0)));

        interno()['restorePendingDecision'](avanzado);
        interno()['applyLoadedWorld'](makeWorld());

        expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).not.toBeNull();
        expect(component.dialogue()).toBeNull();
      });
    });

    it('(a) con la consulta que dice «sí se aplicó» se reenvía con el mismo requestId y sigue el camino normal (consecuencia incluida)', () => {
      sim['chooseDecision'].mockReturnValueOnce(throwError(() => http(409))).mockReturnValueOnce(of(respuestaDeDecision()));
      sim['getAttempt'].mockReturnValue(of(respuestaDeDecision()));

      component.executeDecision(41);

      expect(sim['chooseDecision']).toHaveBeenCalledTimes(2);
      expect(sim['chooseDecision'].mock.calls[1][2]).toBe(sim['chooseDecision'].mock.calls[0][2]);
      expect(component.attempt()?.currentNode.id).toBe(2);
      expect(component.dialogue()?.lines.map(l => l.text)).toContain('Ella respira hondo.');
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).toBeNull();
    });

    it('(a) Esc mientras se concilia: la pausa espera a la consulta y a su reenvío y sale después, sin devolver a la persona al caso', () => {
      const consulta$ = new Subject<SimulationAttemptState>();
      sim['chooseDecision'].mockReturnValueOnce(throwError(() => http(409))).mockReturnValueOnce(throwError(() => http(0)));
      sim['getAttempt'].mockReturnValue(consulta$);
      sim['safeExit'].mockReturnValue(NEVER);
      component.executeDecision(41);

      component.pauseFromOverlay();
      expect(component.attempt()?.status).toBe('PAUSED');
      expect(llamadasDeSafeExit()).toBe(0);

      consulta$.next(respuestaDeDecision());   // sí se aplicó, pero el reenvío falla: se adopta el servidor SIN dejar la pausa

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.busy()).toBe(false);
      expect(llamadasDeSafeExit()).toBe(1);
    });

    it('(a) una decisión que el servidor NO aplicó, con la pausa puesta, conserva la intención para decirlo al reanudar', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(400)));
      const consulta$ = new Subject<SimulationAttemptState>();
      sim['getAttempt'].mockReturnValue(consulta$);
      component.executeDecision(41);
      component.pauseFromOverlay();

      consulta$.next(makeAttempt());

      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).not.toBeNull();
      expect(component.actionError()).toBe('');
    });

    describe('(b) Esc durante la reacción de una decisión no final', () => {
      it('la respuesta se guarda y al reanudar se abre su consecuencia sobre la escena', () => {
        const reaccion = { play: vi.fn(), cancel: vi.fn() };
        interno()['reaction'] = reaccion;
        sim['chooseDecision'].mockReturnValue(of(respuestaDeDecision()));
        sim['safeExit'].mockReturnValue(of(pausado()));
        sim['getWorld'].mockReturnValue(of(makeWorld()));
        sim['resumeAttempt'].mockReturnValue(of(respuestaDeDecision({ consequence: undefined })));
        component.executeDecision(41);
        expect(component.reacting()).toBe(true);

        component.pauseFromOverlay();
        expect(component.reacting()).toBe(false);
        expect(component.attempt()?.status).toBe('PAUSED');
        component.resumeCurrentAttempt();

        expect(component.attempt()?.status).toBe('IN_PROGRESS');
        expect(component.dialogue()?.lines.map(l => l.text)).toContain('Ella respira hondo.');
      });
    });

    describe('el punto de lectura de una escena anterior no se reabre en la nueva', () => {
      it('con otro nodo se descarta sin abrir nada', () => {
        sessionStorage.setItem('siep_punto_lectura_attempt-1', JSON.stringify({ attemptId: 'attempt-1', nodeId: 1, objectKey: 'carpeta', dialogueKey: 'd', line: 1 }));
        component.attempt.set(respuestaDeDecision());

        interno()['restoreReadingPoint'](makeWorld());

        expect(sim['openInteraction']).not.toHaveBeenCalled();
        expect(sessionStorage.getItem('siep_punto_lectura_attempt-1')).toBeNull();
      });

      it('con el mismo nodo se reabre como antes', () => {
        sessionStorage.setItem('siep_punto_lectura_attempt-1', JSON.stringify({ attemptId: 'attempt-1', nodeId: 1, objectKey: 'carpeta', dialogueKey: 'd', line: 1 }));
        sim['openInteraction'].mockReturnValue(of({ world: makeWorld(), interaction: makeWorld().objects[1], dialogue: DIALOGO }));

        interno()['restoreReadingPoint'](makeWorld());

        expect(sim['openInteraction']).toHaveBeenCalledWith('attempt-1', 'carpeta');
      });

      it('al guardar se anota el nodo en que iba', () => {
        interno()['saveReadingPoint']({ key: 'abuela', type: 'PERSON' }, DIALOGO, 2);
        expect(JSON.parse(sessionStorage.getItem('siep_punto_lectura_attempt-1')!)).toEqual({ attemptId: 'attempt-1', nodeId: 1, objectKey: 'abuela', dialogueKey: 'd', line: 2 });
      });
    });
  });

  describe('M1: una decisión que falla por red', () => {
    it('reabre la conversación en las opciones (su última línea), no en la primera', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(0)));
      component.dialogue.set(DIALOGO);

      component.executeDecision(41);

      expect(component.dialogue()?.key).toBe('d');
      expect(component.dialogueStart()).toEqual({ key: 'd', line: 2 });
    });

    describe('al llegar «online» con la intención pendiente', () => {
      beforeEach(() => {
        sim['chooseDecision'].mockReturnValueOnce(throwError(() => http(0))).mockReturnValue(of(respuestaDeDecision()));
        component.dialogue.set(DIALOGO);
        component.executeDecision(41);
      });

      it('la reenvía sola con el mismo requestId y avisa con un aviso breve', () => {
        online();

        expect(sim['chooseDecision']).toHaveBeenCalledTimes(2);
        expect(sim['chooseDecision'].mock.calls[1][2]).toBe(sim['chooseDecision'].mock.calls[0][2]);
        expect(component.softNotice()).toBe(`${DRAFT_COPY.decisionResentOnline.text} Tu decisión se guardó.`);
        expect(component.attempt()?.currentNode.id).toBe(2);
      });

      it('no la reenvía si hay otra petición en curso', () => {
        component.busy.set(true);
        online();
        expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
      });

      it('si había otra petición en curso, lo vuelve a intentar a los 2 s en vez de olvidarla', () => {
        component.busy.set(true);
        online();
        component.busy.set(false);
        vi.advanceTimersByTime(2_000);
        expect(sim['chooseDecision']).toHaveBeenCalledTimes(2);
      });

      it('no la reenvía si el intento ya está en otro nodo', () => {
        component.attempt.set(makeAttempt({}, 2));
        online();
        expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
      });

      it('no la reenvía si la persona ya la confirmó eligiendo otra vez', () => {
        component.executeDecision(41);
        expect(sim['chooseDecision']).toHaveBeenCalledTimes(2);
        online();
        expect(sim['chooseDecision']).toHaveBeenCalledTimes(2);
      });

      it('al destruir el componente el oyente se cancela', () => {
        component.ngOnDestroy();
        online();
        expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('M2: la posición caminada sin red se guarda al volver', () => {
    const guardar = () => {
      interno()['lastPosition'] = { x: 10, y: 20 };
      interno()['persistPosition']();
    };
    const ack = { attemptId: 'attempt-1', status: 'IN_PROGRESS', map: { key: 'sala' }, player: { x: 10, y: 20 } };

    it('al rendirse marca la posición como pendiente: sigue reintentando con espera creciente y avisa una sola vez', () => {
      sim['updateWorldState'].mockReturnValue(throwError(() => http(0)));
      guardar();
      vi.advanceTimersByTime(4_200);
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(4);
      expect(component.actionError()).toContain('posición');
      interno()['dismissActionError']();

      vi.advanceTimersByTime(2_000);
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(5);
      vi.advanceTimersByTime(60_000);
      expect(sim['updateWorldState'].mock.calls.length).toBeGreaterThan(8);
      expect(component.actionError()).toBe('');
    });

    it('al llegar «online» reintenta en el acto y, al lograrlo, deja de reintentar', () => {
      sim['updateWorldState'].mockReturnValue(throwError(() => http(0)));
      guardar();
      vi.advanceTimersByTime(4_200);
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(4);

      sim['updateWorldState'].mockReturnValue(of(ack));
      online();

      expect(sim['updateWorldState']).toHaveBeenCalledTimes(5);
      expect(interno()['lastSyncedPosition']).toEqual({ x: 10, y: 20 });
      vi.advanceTimersByTime(120_000);
      online();
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(5);
    });

    it('al destruir el componente el reintento pendiente se cancela', () => {
      sim['updateWorldState'].mockReturnValue(throwError(() => http(0)));
      guardar();
      vi.advanceTimersByTime(4_200);
      component.ngOnDestroy();
      vi.advanceTimersByTime(120_000);
      online();
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(4);
    });
  });

  describe('M3: recargar a mitad de una conversación con un personaje (npc-<clave>)', () => {
    const npc = { key: 'vecino', displayName: 'Vecino', dialogue: { lines: [{ text: 'uno' }, { text: 'dos' }, { text: 'tres' }] } };
    const conVecino = () => component.scenarioConfig.set({ scenarioKey: 'x', startRoomKey: 'x', rooms: [{ key: 'sala', npcs: [npc] }] } as never);
    const guardarPunto = (over: Record<string, unknown> = {}) => sessionStorage.setItem('siep_punto_lectura_attempt-1',
      JSON.stringify({ attemptId: 'attempt-1', nodeId: 1, objectKey: 'npc-vecino', dialogueKey: 'npc-vecino', line: 2, ...over }));

    it('al guardar, la conversación de un personaje también deja su punto (sin selección de objeto)', () => {
      interno()['saveReadingPoint'](null, { key: 'npc-vecino', lines: [{ order: 1 }, { order: 2 }] }, 1);
      expect(JSON.parse(sessionStorage.getItem('siep_punto_lectura_attempt-1')!)).toEqual({ attemptId: 'attempt-1', nodeId: 1, objectKey: 'npc-vecino', dialogueKey: 'npc-vecino', line: 1 });
    });

    it('al recargar reabre la del mismo personaje en la línea en que iba, sin volver a registrar la interacción', () => {
      conVecino();
      guardarPunto();

      interno()['restoreReadingPoint'](makeWorld());

      expect(component.dialogue()?.key).toBe('npc-vecino');
      expect(component.dialogueStart()).toEqual({ key: 'npc-vecino', line: 2 });
      expect(sim['recordNpcInteraction']).not.toHaveBeenCalled();
      expect(sim['openInteraction']).not.toHaveBeenCalled();
    });

    it('si el personaje ya no está en la sala, el punto se descarta', () => {
      component.scenarioConfig.set({ scenarioKey: 'x', startRoomKey: 'x', rooms: [{ key: 'sala', npcs: [] }] } as never);
      guardarPunto();
      interno()['restoreReadingPoint'](makeWorld());
      expect(component.dialogue()).toBeNull();
      expect(sessionStorage.getItem('siep_punto_lectura_attempt-1')).toBeNull();
    });

    it('si el ambiente de la sala no lo nombra, el punto se descarta', () => {
      conVecino();
      guardarPunto();
      interno()['restoreReadingPoint'](makeWorld({ map: { key: 'sala', title: 'Sala', ambient: { ambientNpcs: [{ key: 'otro' }] } } }));
      expect(component.dialogue()).toBeNull();
      expect(sessionStorage.getItem('siep_punto_lectura_attempt-1')).toBeNull();
    });

    it('si el nodo cambió, el punto se descarta', () => {
      conVecino();
      guardarPunto({ nodeId: 9 });
      interno()['restoreReadingPoint'](makeWorld());
      expect(component.dialogue()).toBeNull();
      expect(sessionStorage.getItem('siep_punto_lectura_attempt-1')).toBeNull();
    });
  });

  describe('Ronda de arreglos 1', () => {
    const marca = () => sessionStorage.getItem('siep_pausa_pendiente_attempt-1');

    describe('I-1: nada se arma ni dispara tras destruir el componente o cambiar de intento', () => {
      it('una decisión que falla DESPUÉS de destruir no arma el reenvío: al volver la red no se envía', () => {
        const decision$ = new Subject<SimulationAttemptState>();
        sim['chooseDecision'].mockReturnValue(decision$);
        component.dialogue.set(DIALOGO);
        component.executeDecision(41);
        component.ngOnDestroy();
        decision$.error(http(0));
        online();
        vi.advanceTimersByTime(60_000);
        expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
      });

      it('una posición que falla DESPUÉS de destruir no arma reintentos', () => {
        const pos$ = new Subject<unknown>();
        sim['updateWorldState'].mockReturnValue(pos$);
        interno()['lastPosition'] = { x: 1, y: 2 };
        interno()['persistPosition']();
        component.ngOnDestroy();
        pos$.error(http(0));
        online();
        vi.advanceTimersByTime(120_000);
        expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
      });

      it('una posición que falla DESPUÉS de empezar otro intento no reintenta con el intento viejo', () => {
        const pos$ = new Subject<unknown>();
        sim['updateWorldState'].mockReturnValue(pos$);
        interno()['lastPosition'] = { x: 1, y: 2 };
        interno()['persistPosition']();
        component.attempt.set(makeAttempt({ attemptId: 'attempt-2' }));
        pos$.error(http(0));
        online();
        vi.advanceTimersByTime(120_000);
        expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
      });

      it('una pausa en vuelo que falla DESPUÉS de destruir no se rearma', () => {
        const pausa$ = new Subject<SimulationAttemptState>();
        sim['safeExit'].mockReturnValue(pausa$);
        component.pauseFromOverlay();
        component.ngOnDestroy();
        const llamadas = llamadasDeSafeExit();
        pausa$.error(http(0));
        online();
        vi.advanceTimersByTime(120_000);
        expect(llamadasDeSafeExit()).toBe(llamadas);
      });
    });

    describe('I-2: la pausa sin registrar no se pierde', () => {
      it('al pedirla se guarda la marca (sin token) y al registrarse se borra', () => {
        sim['safeExit'].mockReturnValueOnce(throwError(() => http(0))).mockReturnValue(of(pausado()));
        sim['getWorld'].mockReturnValue(of(makeWorld()));
        component.pauseFromOverlay();
        expect(marca()).not.toBeNull();
        expect(marca()).not.toMatch(/token/i);
        online();
        expect(marca()).toBeNull();
      });

      it('al destruir con la pausa pendiente lanza un último safeExit con el intento y, si llega, borra la marca', () => {
        sim['safeExit'].mockReturnValueOnce(throwError(() => http(0))).mockReturnValue(of(pausado()));
        component.pauseFromOverlay();
        expect(llamadasDeSafeExit()).toBe(1);
        component.ngOnDestroy();
        expect(llamadasDeSafeExit()).toBe(2);
        expect(sim['safeExit']).toHaveBeenLastCalledWith('attempt-1', 'Salida segura solicitada');
        expect(marca()).toBeNull();
      });

      it('sin pausa pendiente no hay envío final', () => {
        component.ngOnDestroy();
        expect(llamadasDeSafeExit()).toBe(0);
      });

      describe('al volver a abrir el intento', () => {
        const abrir = () => { interno()['ngOnInit'](); };
        beforeEach(() => { component.attempt.set(null); });

        it('con la marca y el intento aún en curso: registra la pausa ANTES de mostrar la tarjeta, que ya ve el intento en pausa', () => {
          sessionStorage.setItem('siep_pausa_pendiente_attempt-1', JSON.stringify({ attemptId: 'attempt-1' }));
          sim['getActiveAttempt'].mockReturnValue(of(makeAttempt()));
          sim['safeExit'].mockReturnValue(of(pausado()));
          abrir();
          expect(sim['safeExit']).toHaveBeenCalledWith('attempt-1', 'Salida segura solicitada');
          expect(component.pendingActiveAttempt()?.status).toBe('PAUSED');
          expect(component.showResumePrompt()).toBe(true);
          expect(marca()).toBeNull();
        });

        it('si no se puede registrar, la tarjeta sale igual y la marca se conserva', () => {
          sessionStorage.setItem('siep_pausa_pendiente_attempt-1', JSON.stringify({ attemptId: 'attempt-1' }));
          sim['getActiveAttempt'].mockReturnValue(of(makeAttempt()));
          sim['safeExit'].mockReturnValue(throwError(() => http(0)));
          abrir();
          expect(component.pendingActiveAttempt()?.status).toBe('IN_PROGRESS');
          expect(component.showResumePrompt()).toBe(true);
          expect(marca()).not.toBeNull();
        });

        it('sin marca no se pide ninguna pausa', () => {
          sim['getActiveAttempt'].mockReturnValue(of(makeAttempt()));
          abrir();
          expect(sim['safeExit']).not.toHaveBeenCalled();
          expect(component.showResumePrompt()).toBe(true);
        });
      });
    });

    it('I-3: «Salida segura» desde el plano completo lo cierra', () => {
      component.planOpen.set(true);
      component.pauseFromOverlay();
      expect(component.planOpen()).toBe(false);
    });

    describe('I-4: el reenvío al volver la red solo ocurre con la conversación de esa elección abierta', () => {
      beforeEach(() => {
        sim['chooseDecision'].mockReturnValueOnce(throwError(() => http(0))).mockReturnValue(of(respuestaDeDecision()));
        component.dialogue.set(DIALOGO);
        component.executeDecision(41);
      });

      it('si la persona cerró la conversación, no se reenvía y la intención queda', () => {
        component.closeDialogue();
        online();
        expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).not.toBeNull();
      });

      it('si abrió otra conversación, no se la cierra ni se envía', () => {
        component.dialogue.set({ ...DIALOGO, key: 'otra' } as DialogueState);
        online();
        expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
        expect(component.dialogue()?.key).toBe('otra');
      });

      it('si abrió la bitácora, tampoco', () => {
        component.journalOpen.set(true);
        online();
        expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
      });
    });

    describe('menores', () => {
      it('M-1: «Pausando el caso…» solo se pinta mientras el intento sigue en curso (con la pausa local ya no hay nada que acusar)', () => {
        expect(source).toMatch(/@if \(pausing\(\) && attempt\(\)\?\.status === 'IN_PROGRESS'\)/);
      });

      it('M-2: el aviso de etapa y el de sala no salen sobre la pausa cuando esta se registra tarde', () => {
        interno()['pendingStage'] = 'Etapa 2';
        component.attempt.set(pausado());
        interno()['applyLoadedWorld'](makeWorld({ map: { key: 'otra', title: 'Otra' } }));
        expect(component.roomBanner()).toBe('');
        expect(component.transitionNote()).toBe('');
      });

      it('M-3: un error tardío de herramienta, de personaje o de posición no sale sobre la pausa', () => {
        const tool$ = new Subject<unknown>();
        const npc$ = new Subject<unknown>();
        const pos$ = new Subject<unknown>();
        sim['useTool'].mockReturnValue(tool$);
        sim['recordNpcInteraction'].mockReturnValue(npc$);
        sim['updateWorldState'].mockReturnValue(pos$);
        interno()['doUseTool']('t', null);
        interno()['recordNpcInteraction']({ key: 'v', displayName: 'V', dialogue: { lines: [{ text: 'x' }] } });
        interno()['lastPosition'] = { x: 1, y: 2 };
        interno()['persistPosition']();
        component.pauseFromOverlay();
        tool$.error(http(500, 'No pudimos usar la herramienta.'));
        npc$.error(http(500, 'Falló la conversación.'));
        pos$.error(http(0));
        vi.advanceTimersByTime(60_000);
        expect(component.actionError()).toBe('');
        expect(component.attempt()?.status).toBe('PAUSED');
        // Desde V4 la posición pendiente viaja con la pausa: solo ella la reenvía (la misma posición), nunca un guardado suelto.
        expect(sim['updateWorldState'].mock.calls.every((call: unknown[]) => call[1] === 1 && call[2] === 2)).toBe(true);
      });

      describe('M-4: un 4xx permanente al registrar la pausa', () => {
        it('tras consultar el intento deja de reintentar y lo dice con un texto honesto en la nota', () => {
          sim['safeExit'].mockReturnValue(throwError(() => http(403)));
          sim['getAttempt'].mockReturnValue(of(makeAttempt()));
          component.pauseFromOverlay();
          expect(component.pauseNote()).toBe(DRAFT_COPY.pausePermanentFail.text);
          vi.advanceTimersByTime(120_000);
          online();
          expect(llamadasDeSafeExit()).toBe(2);
          expect(component.attempt()?.status).toBe('PAUSED');
        });

        it('«Reanudar» no dice «Todavía no hay conexión» cuando lo que falla no es la red', () => {
          sim['safeExit'].mockReturnValueOnce(throwError(() => http(0))).mockReturnValue(throwError(() => http(403)));
          sim['getAttempt'].mockReturnValue(of(makeAttempt()));
          component.pauseFromOverlay();
          component.resumeCurrentAttempt();
          expect(component.actionError()).not.toBe(DRAFT_COPY.pauseResumeOffline.text);
        });
      });

      it('M-6: el reenvío de una decisión ya aplicada NO borra la intención ante un error de red o plazo, solo ante un 4xx', () => {
        const guardar = () => sessionStorage.setItem('siep_decision_pendiente_attempt-1', JSON.stringify({ attemptId: 'attempt-1', nodeId: 1, decisionOptionId: 41, requestId: 'r' }));
        const avanzado = respuestaDeDecision();
        component.attempt.set(avanzado);
        for (const [error, queda] of [[http(0), true], [new Error('x'), true], [http(409), false]] as const) {
          guardar();
          sim['chooseDecision'].mockReturnValue(throwError(() => error));
          interno()['restorePendingDecision'](avanzado);
          interno()['replayAppliedDecision']();
          expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1') !== null).toBe(queda);
        }
      });

      it('M-9: en ensayo, ajustar el panel no saca de la pausa local a la autora', () => {
        component.mode.set('rehearsal');
        component.attempt.set(pausado());
        sim['getAttempt'].mockReturnValue(of(makeAttempt()));
        component.reloadRehearsal({} as never);
        expect(component.attempt()?.status).toBe('PAUSED');
      });

      it('M-10: al reanudar se reinicia el contador de posiciones rendidas', () => {
        interno()['positionGiveUps'] = 3;
        component.attempt.set(pausado());
        component.resumeCurrentAttempt();
        expect(interno()['positionGiveUps']).toBe(0);
      });

      describe('M-11: Esc durante el fundido no pierde la consecuencia', () => {
        beforeEach(() => { sim['chooseDecision'].mockReturnValue(of(respuestaDeDecision())); sim['getWorld'].mockReturnValue(of(makeWorld())); });

        it('con la consecuencia a la vista, pausar y reanudar la devuelve', () => {
          component.executeDecision(41);
          expect(component.dialogue()?.lines.map(l => l.text)).toContain('Ella respira hondo.');
          sim['safeExit'].mockReturnValue(of(pausado()));
          component.pauseFromOverlay();
          expect(component.dialogue()).toBeNull();
          sim['resumeAttempt'].mockReturnValue(of(respuestaDeDecision({ consequence: undefined })));
          component.resumeCurrentAttempt();
          expect(component.dialogue()?.lines.map(l => l.text)).toContain('Ella respira hondo.');
        });

        it('si la persona ya la cerró, no vuelve', () => {
          component.executeDecision(41);
          component.closeDialogue();
          sim['safeExit'].mockReturnValue(of(pausado()));
          component.pauseFromOverlay();
          sim['resumeAttempt'].mockReturnValue(of(respuestaDeDecision({ consequence: undefined })));
          component.resumeCurrentAttempt();
          expect(component.dialogue()).toBeNull();
        });
      });

      it('M-8: la reapertura de un personaje busca solo en la sala actual', () => {
        const npc = { key: 'vecino', displayName: 'Vecino', dialogue: { lines: [{ text: 'uno' }, { text: 'dos' }] } };
        component.scenarioConfig.set({ scenarioKey: 'x', startRoomKey: 'x', rooms: [{ key: 'otra', npcs: [npc] }, { key: 'sala', npcs: [] }] } as never);
        sessionStorage.setItem('siep_punto_lectura_attempt-1', JSON.stringify({ attemptId: 'attempt-1', nodeId: 1, objectKey: 'npc-vecino', dialogueKey: 'npc-vecino', line: 1 }));
        interno()['restoreReadingPoint'](makeWorld());
        expect(component.dialogue()).toBeNull();
        expect(sessionStorage.getItem('siep_punto_lectura_attempt-1')).toBeNull();
      });
    });
  });

  describe('Re-revisión de la ronda 1', () => {
    const marca = () => sessionStorage.getItem('siep_pausa_pendiente_attempt-1');

    it('R-1: reanudar con éxito tras un rechazo permanente borra la marca y la nota (al recargar no sale una salida segura que nadie pidió)', () => {
      sim['safeExit'].mockReturnValue(throwError(() => http(403)));
      sim['getAttempt'].mockReturnValue(of(makeAttempt()));
      component.pauseFromOverlay();
      expect(component.pauseNote()).toBe(DRAFT_COPY.pausePermanentFail.text);
      expect(marca()).not.toBeNull();
      component.resumeCurrentAttempt();
      expect(component.attempt()?.status).toBe('IN_PROGRESS');
      expect(marca()).toBeNull();
      expect(component.pauseNote()).toBeNull();
    });

    it('R-1: continuar desde la tarjeta un intento en curso cuya pausa no se pudo registrar borra la marca', () => {
      component.attempt.set(null);
      sessionStorage.setItem('siep_pausa_pendiente_attempt-1', JSON.stringify({ attemptId: 'attempt-1' }));
      sim['getActiveAttempt'].mockReturnValue(of(makeAttempt()));
      sim['safeExit'].mockReturnValue(throwError(() => http(403)));
      interno()['ngOnInit']();
      expect(component.showResumePrompt()).toBe(true);
      expect(marca()).not.toBeNull();
      component.resumeAttempt();
      expect(marca()).toBeNull();
    });

    it('el aviso de sala incompleta no sale sobre la pausa (sí con el intento en curso)', () => {
      component.attempt.set(pausado());
      component.onSalaIncompleta();
      expect(avisos()).toEqual([]);
      component.attempt.set(makeAttempt());
      component.onSalaIncompleta();
      expect(avisos()).toHaveLength(1);
    });

    it('el rechazo tardío de una puerta (400) no deja su aviso sobre la pausa (sí con el intento en curso)', () => {
      component.attempt.set(pausado());
      interno()['onDoorFailed']('attempt-1', http(400));
      expect(avisos()).toEqual([]);
      expect(component.busy()).toBe(false);
      component.attempt.set(makeAttempt());
      interno()['onDoorFailed']('attempt-1', http(400));
      expect(avisos()).toHaveLength(1);
    });
  });
});
