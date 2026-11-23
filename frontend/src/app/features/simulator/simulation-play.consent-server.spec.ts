// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta (mismo doble que el resto de specs de
// instancia del juego): solo se evalúa `extends Phaser.Scene` al cargar el módulo.
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

import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EMPTY, of, throwError } from 'rxjs';
import type { Mock } from 'vitest';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  MapObjectState, NpcConfig, SimulationAttemptState, SimulationWorldState,
} from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import {
  CONSENT_RECORDER, CONTENT_NOTICE_VERSION, ConsentNoticeStaleError, ConsentRecorder, consentStorageKey,
} from './consent-recorder';
import { DRAFT_COPY } from './draft-copy';
import { SimulationPlayComponent } from './simulation-play.component';

/**
 * S3-2b · El consentimiento del cliente usa el servidor (F10-8†; ETH-01, SIEP-RF-05).
 *
 * 1. Precarga: antes de decidir si se pide el aviso se pregunta al servidor si la persona ya lo aceptó (otro navegador,
 *    otra sesión), con un tiempo máximo corto y sin mostrar jamás un error de pantalla si la lectura falla.
 * 2. 403 `CONSENT_REQUIRED`: si una orden de juego o la carga del mundo lo recibe (consentimiento retirado en otra
 *    pestaña, o aviso de otra versión), la pantalla vuelve al aviso previo sin perder el intento ni mostrar un error
 *    genérico. La pausa y la salida segura NUNCA dependen de esto (REGLA-004).
 */
// req: ETH-01, SIEP-RF-05
const CASE_VERSION_ID = 7;

function makeAttempt(overrides: Record<string, unknown> = {}): SimulationAttemptState {
  return {
    attemptId: 'attempt-1',
    caseVersionId: CASE_VERSION_ID,
    caseTitle: 'Caso demo',
    status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { id: 1, key: 'nodo-sin-evidencia', title: 'Nodo', options: [{ id: 11 }] },
    completionReport: null,
    ...overrides,
  } as unknown as SimulationAttemptState;
}

const KEY = consentStorageKey(CASE_VERSION_ID, 'attempt-1');
const WORLD = { map: { key: 'hospital-urgencias', title: 'Urgencias' }, objects: [], tools: [], flags: {} } as unknown as SimulationWorldState;

const consentRequired = (noticeVersion = 'aviso-vigente') => new HttpErrorResponse({
  status: 403,
  error: { success: false, code: 'CONSENT_REQUIRED', message: 'Para continuar necesitas leer y aceptar el aviso.', noticeVersion },
});
const forbidden = (code = 'FORBIDDEN') => new HttpErrorResponse({ status: 403, error: { success: false, code, message: 'Sin permiso.' } });

/** El «servidor» de prueba: lo que sabe del consentimiento y lo que se le pregunta. */
function makeRecorder(initiallyGiven = false) {
  let given = initiallyGiven;
  const recorder = {
    isGiven: vi.fn((_key: string) => given),
    record: vi.fn((_key: string) => { given = true; return Promise.resolve(); }),
    prime: vi.fn((_caseVersionId: number) => Promise.resolve()),
    forget: vi.fn((_key: string) => { given = false; }),
    setGiven: (value: boolean) => { given = value; },
  };
  return recorder;
}

describe('SimulationPlayComponent: el consentimiento usa el servidor (S3-2b)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;
  let audio: Record<string, Mock>;
  let recorder: ReturnType<typeof makeRecorder>;

  function setup(options: { recorder?: ConsentRecorder | null; active?: SimulationAttemptState | null } = {}) {
    sessionStorage.clear();
    recorder = makeRecorder();
    sim = {
      getActiveAttempt: vi.fn(() => of(options.active ?? null)),
      startAttempt: vi.fn(() => of(makeAttempt())),
      getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => EMPTY),
      getScenarioConfig: vi.fn(() => EMPTY),
      safeExit: vi.fn(() => EMPTY),
      resumeAttempt: vi.fn(() => of(makeAttempt())),
      enterRoom: vi.fn(() => EMPTY),
      openInteraction: vi.fn(() => EMPTY),
      recordNpcInteraction: vi.fn(() => EMPTY),
      useTool: vi.fn(() => EMPTY),
      chooseDecision: vi.fn(() => EMPTY),
      saveReflection: vi.fn(() => EMPTY),
      updateWorldState: vi.fn(() => EMPTY),
    };
    audio = {
      init: vi.fn(), setScene: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
      dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
    };
    const providers: unknown[] = [
      { provide: SimulationService, useValue: sim },
      { provide: AudioDirectorService, useValue: audio },
      { provide: AuthService, useValue: {} },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: String(CASE_VERSION_ID) }) } } },
    ];
    if (options.recorder !== null) providers.push({ provide: CONSENT_RECORDER, useValue: options.recorder ?? recorder });
    TestBed.configureTestingModule({ imports: [SimulationPlayComponent], providers: providers as never[] });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
  }

  /** La partida en marcha: intento en curso, mundo cargado, consentimiento vigente en el servidor. */
  function playing(): void {
    recorder.setGiven(true);
    component.attempt.set(makeAttempt());
    component.world.set(WORLD);
    component.worldStarted.set(true);
    component.loading.set(false);
  }

  /** Lo que tiene que pasar en CUALQUIER 403 CONSENT_REQUIRED: de vuelta al aviso, sin perder el intento ni error genérico. */
  function expectBackAtNotice(): void {
    expect(component.showContentWarning()).toBe(true);
    expect(component.consentState()).toBe('idle');
    expect(recorder.forget).toHaveBeenCalledWith(KEY);
    expect(recorder.isGiven(KEY)).toBe(false);
    expect(component.worldStarted()).toBe(false);
    expect(audio['dispose']).toHaveBeenCalled(); // sin consentimiento no hay audio
    expect(component.attempt()?.attemptId).toBe('attempt-1'); // el intento no se pierde
    expect(component.attempt()?.status).toBe('IN_PROGRESS');
    expect(component.actionError()).toBe(''); // ni un error de acción…
    expect(component.error()).toBe(''); // …ni la pantalla de error de arranque
    expect(component.loading()).toBe(false);
    expect(component.busy()).toBe(false);
    expect(sim['safeExit']).not.toHaveBeenCalled(); // volver al aviso no es una pausa
  }

  afterEach(() => {
    component?.ngOnDestroy();
    vi.useRealTimers();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('precarga: se pregunta al servidor ANTES de pedir el aviso', () => {
    // Control negativo (mutación: arrancar sin esperar la precarga): la persona que ya aceptó vería el aviso de nuevo.
    it('espera la respuesta del servidor y, si ya aceptó, arranca el mundo sin mostrar el aviso', async () => {
      setup();
      let answer!: () => void;
      recorder.prime.mockImplementation(() => new Promise<void>(resolve => { answer = () => { recorder.setGiven(true); resolve(); }; }));

      component.ngOnInit();

      expect(recorder.prime).toHaveBeenCalledWith(CASE_VERSION_ID);
      // Mientras el servidor no responde: ni aviso ni mundo (solo el indicador de carga).
      expect(component.showContentWarning()).toBe(false);
      expect(component.worldStarted()).toBe(false);
      expect(sim['getWorld']).not.toHaveBeenCalled();
      expect(component.loading()).toBe(true);

      answer();
      await Promise.resolve();
      await Promise.resolve();

      expect(component.showContentWarning()).toBe(false);
      expect(component.worldStarted()).toBe(true);
      expect(sim['getWorld']).toHaveBeenCalledTimes(1);
      expect(audio['init']).toHaveBeenCalledTimes(1);
      expect(recorder.record).not.toHaveBeenCalled(); // no se vuelve a registrar lo ya aceptado
    });

    it('lo pregunta antes de decidir si hay consentimiento (isGiven)', async () => {
      setup();

      component.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();

      expect(recorder.prime.mock.invocationCallOrder[0]).toBeLessThan(recorder.isGiven.mock.invocationCallOrder[0]);
    });

    it('si el servidor dice que no ha aceptado, se muestra el aviso y el mundo no se pide', async () => {
      setup();

      component.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();

      expect(component.showContentWarning()).toBe(true);
      expect(component.worldStarted()).toBe(false);
      expect(component.attempt()?.attemptId).toBe('attempt-1');
      expect(sim['getWorld']).not.toHaveBeenCalled();
      expect(audio['init']).not.toHaveBeenCalled();
    });

    // Control negativo (mutación: sin plazo): un servidor que no contesta dejaría a la persona mirando la carga para siempre.
    it('con un tiempo máximo de 3 s: si el servidor no contesta, se pide el aviso', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      setup();
      recorder.prime.mockImplementation(() => new Promise<void>(() => undefined)); // nunca contesta

      component.ngOnInit();
      await vi.advanceTimersByTimeAsync(2999);
      expect(component.showContentWarning()).toBe(false);
      expect(component.loading()).toBe(true);

      await vi.advanceTimersByTimeAsync(1);

      expect(component.showContentWarning()).toBe(true);
      expect(component.worldStarted()).toBe(false);
      expect(component.loading()).toBe(false);
      expect(component.error()).toBe('');
      expect(sim['getWorld']).not.toHaveBeenCalled();
    });

    it('una respuesta que llega después del plazo no arranca nada por segunda vez', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      setup();
      let answer!: () => void;
      recorder.prime.mockImplementation(() => new Promise<void>(resolve => { answer = () => { recorder.setGiven(true); resolve(); }; }));

      component.ngOnInit();
      await vi.advanceTimersByTimeAsync(3000);
      expect(component.showContentWarning()).toBe(true);

      answer();
      await vi.advanceTimersByTimeAsync(0);

      expect(sim['getWorld']).not.toHaveBeenCalled(); // la decisión ya se tomó: pedir el aviso
      expect(component.showContentWarning()).toBe(true);
    });

    it('la respuesta a tiempo cancela el plazo: no se decide dos veces', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      setup();
      recorder.prime.mockImplementation(() => { recorder.setGiven(true); return Promise.resolve(); });

      component.ngOnInit();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(5000);

      expect(sim['getWorld']).toHaveBeenCalledTimes(1);
      expect(audio['init']).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['la precarga se rechaza', () => Promise.reject(new Error('sin red'))],
      ['la precarga lanza antes de pedir nada', () => { throw new Error('sin red'); }],
    ])('si %s: se pide el aviso y NO se muestra ningún error', async (_name, prime) => {
      setup();
      recorder.prime.mockImplementation(prime as never);

      component.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();

      expect(component.showContentWarning()).toBe(true);
      expect(component.error()).toBe('');
      expect(component.actionError()).toBe('');
      expect(component.loading()).toBe(false);
    });

    it('un registro sin `prime` (los dobles de antes) arranca igual y sin esperar', () => {
      setup({ recorder: { isGiven: () => false, record: () => Promise.resolve() } });

      component.ngOnInit();

      expect(component.showContentWarning()).toBe(true); // síncrono, como siempre
      expect(component.attempt()?.attemptId).toBe('attempt-1');
    });

    it('no pregunta por un intento que no está en curso: no hay aviso que decidir', async () => {
      setup();
      sim['startAttempt'].mockReturnValue(of(makeAttempt({ status: 'PAUSED' })));

      component.ngOnInit();
      await Promise.resolve();

      expect(recorder.prime).not.toHaveBeenCalled();
      expect(component.worldStarted()).toBe(true);
    });

    it('al reanudar un intento en pausa también se pregunta antes de pedir el aviso', async () => {
      setup({ active: makeAttempt({ status: 'PAUSED' }) });
      recorder.prime.mockImplementation(() => { recorder.setGiven(true); return Promise.resolve(); });

      component.ngOnInit();
      component.resumeAttempt();
      await Promise.resolve();
      await Promise.resolve();

      expect(sim['resumeAttempt']).toHaveBeenCalledWith('attempt-1');
      expect(recorder.prime).toHaveBeenCalledWith(CASE_VERSION_ID);
      expect(component.showContentWarning()).toBe(false);
      expect(component.worldStarted()).toBe(true);
    });

    it('al empezar un intento nuevo del mismo caso también se pregunta (el consentimiento es de la persona y del caso)', async () => {
      setup({ active: makeAttempt() });
      recorder.prime.mockImplementation(() => { recorder.setGiven(true); return Promise.resolve(); });

      component.ngOnInit();
      component.startNewAttempt();
      await Promise.resolve();
      await Promise.resolve();

      expect(recorder.prime).toHaveBeenCalledWith(CASE_VERSION_ID);
      expect(component.showContentWarning()).toBe(false);
      expect(component.worldStarted()).toBe(true);
    });

    it('si se sale de la pantalla mientras se pregunta, al llegar la respuesta no arranca audio ni mundo', async () => {
      setup();
      let answer!: () => void;
      recorder.prime.mockImplementation(() => new Promise<void>(resolve => { answer = () => { recorder.setGiven(true); resolve(); }; }));

      component.ngOnInit();
      component.ngOnDestroy();
      answer();
      await Promise.resolve();
      await Promise.resolve();

      expect(audio['init']).not.toHaveBeenCalled();
      expect(sim['getWorld']).not.toHaveBeenCalled();
    });

    it('Esc durante la precarga no pausa nada: todavía no hay intento a la vista ni aviso que decidir', async () => {
      setup();
      recorder.prime.mockImplementation(() => new Promise<void>(() => undefined));

      component.ngOnInit();
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      component.handleGlobalInteraction(event);

      expect(sim['safeExit']).not.toHaveBeenCalled();
      expect(component.pausing()).toBe(false);
    });
  });

  describe('403 CONSENT_REQUIRED en una orden de juego: de vuelta al aviso', () => {
    beforeEach(() => {
      setup();
      playing();
    });

    // Control negativo (mutación: quitar el caso de `reportApiError`): la orden mostraría el error de siempre o nada.
    it('usar una herramienta', () => {
      sim['useTool'].mockReturnValue(throwError(() => consentRequired()));

      component.useTool('PAP');

      expect(sim['useTool']).toHaveBeenCalledTimes(1);
      expectBackAtNotice();
    });

    it('hablar con una persona del mundo', () => {
      sim['recordNpcInteraction'].mockReturnValue(throwError(() => consentRequired()));

      component.openNpcDialogue({ key: 'enfermera', displayName: 'Enfermera', dialogue: { lines: [{ text: 'Hola.' }] } } as unknown as NpcConfig);

      expect(sim['recordNpcInteraction']).toHaveBeenCalledTimes(1);
      expectBackAtNotice();
      expect(component.dialogue()).toBeNull();
    });

    it('abrir una interacción', () => {
      sim['openInteraction'].mockReturnValue(throwError(() => consentRequired()));

      (component as unknown as { doOpenBackendInteraction(o: MapObjectState): void })
        .doOpenBackendInteraction({ key: 'familia-crisis', type: 'PERSON' } as unknown as MapObjectState);

      expect(sim['openInteraction']).toHaveBeenCalledTimes(1);
      expectBackAtNotice();
      expect(component.selectedInteraction()).toBeNull();
    });

    it('decidir (el diálogo que se devuelve para reintentar no queda por detrás del aviso)', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      sim['chooseDecision'].mockReturnValue(throwError(() => consentRequired()));
      component.dialogue.set({
        key: 'dialogo', lines: [],
        choices: [{ key: 'opt-1', text: 'Opción', decisionOptionId: 11, requiredToolCode: null, effect: {} }],
      } as never);

      component.executeDecision(11);
      vi.advanceTimersByTime(400);

      expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
      expectBackAtNotice();
      expect(component.dialogue()).toBeNull();
      expect(component.fadeActive()).toBe(false);
    });

    it('guardar la bitácora', () => {
      sim['saveReflection'].mockReturnValue(throwError(() => consentRequired()));
      component.journalOpen.set(true);

      component.saveReflection('Lo que viví');

      expect(sim['saveReflection']).toHaveBeenCalledTimes(1);
      expectBackAtNotice();
      expect(component.journalOpen()).toBe(false);
      expect(component.journalMessage()).toBe(''); // no se dice «no pudimos guardar»: no es un fallo de guardado
      expect(component.journalSaveState()).not.toBe('error');
    });

    it('guardar la posición mientras se camina (en silencio, pero no ignora el consentimiento)', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      sim['updateWorldState'].mockReturnValue(throwError(() => consentRequired()));

      component.rememberPosition(120, 340);
      vi.advanceTimersByTime(600);

      expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
      expectBackAtNotice();
    });

    // Las pistas las pide el panel de diálogo (otro componente): cuando el servidor las rechaza por el consentimiento, el
    // panel avisa a la pantalla de juego (`(consentRequired)`), que vuelve al aviso como con cualquier otra orden.
    it('las pistas del panel de diálogo (la pantalla de juego recibe el aviso del panel)', () => {
      component.dialogue.set({ key: 'dialogo', lines: [], choices: [] } as never);

      component.requireConsentAgain();

      expectBackAtNotice();
      expect(component.dialogue()).toBeNull();
    });

    it('los dos paneles de diálogo (lateral y cinematográfico) escuchan ese aviso del panel', () => {
      const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');
      const panels = source.match(/<app-dialogue-panel[\s\S]*?\/>/g) ?? [];

      expect(panels).toHaveLength(2);
      for (const panel of panels) expect(panel).toContain('(consentRequired)="requireConsentAgain()"');
    });

    it('pedir el mapa de progreso', () => {
      sim['getProgressMap'].mockReturnValue(throwError(() => consentRequired()));

      (component as unknown as { loadProgressMap(a: SimulationAttemptState): void }).loadProgressMap(makeAttempt());

      expect(component.progressMap()).toBeNull();
      expectBackAtNotice();
    });

    it('un 403 que no es del consentimiento NO manda al aviso (sigue su camino: lo explica el interceptor)', () => {
      for (const error of [forbidden(), forbidden('DATA_TREATMENT_CONSENT_REQUIRED'), forbidden('PASSWORD_CHANGE_REQUIRED')]) {
        sim['useTool'].mockReturnValue(throwError(() => error));
        component.useTool('PAP');
      }

      expect(sim['useTool']).toHaveBeenCalledTimes(3);
      expect(component.showContentWarning()).toBe(false);
      expect(component.worldStarted()).toBe(true);
      expect(recorder.forget).not.toHaveBeenCalled();
    });

    it('otros fallos de la orden siguen mostrando su error de siempre', () => {
      sim['useTool'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Se cayó el servidor.' } })));

      component.useTool('PAP');

      expect(component.actionError()).toBe('Se cayó el servidor.');
      expect(component.showContentWarning()).toBe(false);
      expect(recorder.forget).not.toHaveBeenCalled();
    });

    it('el mismo 403 con otro estado no es el consentimiento', () => {
      sim['useTool'].mockReturnValue(throwError(() => new HttpErrorResponse({
        status: 409, error: { success: false, code: 'CONSENT_REQUIRED', message: 'Conflicto.' },
      })));

      component.useTool('PAP');

      expect(component.showContentWarning()).toBe(false);
    });

    it('dos respuestas 403 seguidas (mundo y mapa de progreso) dejan UN solo aviso, sin romper nada', () => {
      sim['getProgressMap'].mockReturnValue(throwError(() => consentRequired()));
      sim['getWorld'].mockReturnValue(throwError(() => consentRequired()));
      const load = component as unknown as { loadProgressMap(a: SimulationAttemptState): void; loadWorld(a: SimulationAttemptState): void };

      load.loadProgressMap(makeAttempt());
      load.loadWorld(makeAttempt());

      expectBackAtNotice();
      expect(audio['dispose']).toHaveBeenCalledTimes(1);
    });

    it('al aceptar de nuevo el aviso el mundo se pide otra vez y el juego sigue', async () => {
      sim['useTool'].mockReturnValue(throwError(() => consentRequired()));
      component.useTool('PAP');
      expectBackAtNotice();
      sim['getWorld'].mockClear();

      component.acceptContentWarning();
      await Promise.resolve();
      await Promise.resolve();

      expect(recorder.record).toHaveBeenCalledWith(KEY);
      expect(component.showContentWarning()).toBe(false);
      expect(component.worldStarted()).toBe(true);
      expect(sim['getWorld']).toHaveBeenCalledTimes(1);
      expect(audio['init']).toHaveBeenCalledTimes(1);
      expect(component.attempt()?.attemptId).toBe('attempt-1');
    });
  });

  describe('403 CONSENT_REQUIRED al cargar el mundo', () => {
    // Control negativo (mutación: dejar el caso en `fail`): saldría «No pudimos cargar el mapa del caso» con «Reintentar».
    it('no es un fallo de carga: vuelve el aviso y, al aceptar, el mundo se pide de nuevo', async () => {
      setup();
      recorder.setGiven(true);
      sim['getWorld'].mockReturnValueOnce(throwError(() => consentRequired())).mockReturnValue(EMPTY);

      component.ngOnInit(); // el consentimiento estaba vigente en la memoria, pero el servidor ya no lo tiene
      await Promise.resolve();
      await Promise.resolve();

      expect(sim['getWorld']).toHaveBeenCalledTimes(1);
      expectBackAtNotice();
      expect(component.canRetry()).toBe(false); // no hay «Reintentar» de un error que no es

      component.acceptContentWarning();
      await Promise.resolve();
      await Promise.resolve();

      expect(sim['getWorld']).toHaveBeenCalledTimes(2);
      expect(component.worldStarted()).toBe(true);
      expect(component.showContentWarning()).toBe(false);
    });

    it('limpia lo que esperaba la recarga del mundo (no queda «Reanudar» encolado ni el fundido)', () => {
      setup();
      playing();
      (component as unknown as { worldReloadPending: boolean; resumeQueued: boolean }).worldReloadPending = true;
      (component as unknown as { resumeQueued: boolean }).resumeQueued = true;
      component.fadeActive.set(true);
      component.busy.set(true);
      sim['getWorld'].mockReturnValue(throwError(() => consentRequired()));

      (component as unknown as { loadWorld(a: SimulationAttemptState): void }).loadWorld(makeAttempt());

      expectBackAtNotice();
      expect((component as unknown as { worldReloadPending: boolean }).worldReloadPending).toBe(false);
      expect((component as unknown as { resumeQueued: boolean }).resumeQueued).toBe(false);
      expect(component.fadeActive()).toBe(false);
    });

    it('otros fallos del mundo siguen siendo el error de carga con su «Reintentar»', async () => {
      setup();
      recorder.setGiven(true);
      sim['getWorld'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

      component.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();

      expect(component.error()).toBe('No pudimos cargar el mapa del caso.');
      expect(component.canRetry()).toBe(true);
      expect(component.showContentWarning()).toBe(false);
      expect(recorder.forget).not.toHaveBeenCalled();
    });
  });

  describe('la pausa y la salida segura NUNCA dependen del consentimiento (REGLA-004)', () => {
    beforeEach(() => {
      setup();
      playing();
    });

    it('un 403 CONSENT_REQUIRED en la salida segura (el servidor no lo envía) se trata como cualquier fallo de la pausa, no como el aviso: la persona sale igual y se reintenta', () => {
      sim['safeExit'].mockReturnValue(throwError(() => consentRequired()));
      sim['getAttempt'] = vi.fn(() => throwError(() => consentRequired()));

      component.pauseFromOverlay();

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
      expect(component.showContentWarning()).toBe(false);
      expect(component.attempt()?.status).toBe('PAUSED'); // la persona ya salió
      expect(component.pauseNote()).toBe(DRAFT_COPY.pausePermanentFail.text); // un 4xx que se repite tras consultar: no hay bucle y se dice
      expect(component.actionError()).toBe('');
      expect(recorder.forget).not.toHaveBeenCalled();
      expect(component.pausing()).toBe(false); // se dejó de reintentar
    });

    it('la pausa sale aunque el servidor ya no tenga el consentimiento: la persona queda pausada y luego vuelve el aviso', () => {
      sim['safeExit'].mockReturnValue(of(makeAttempt({ status: 'PAUSED' })));
      sim['getWorld'].mockReturnValue(throwError(() => consentRequired())); // tras pausar se recarga el mundo

      component.pauseFromOverlay();

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
      expect(component.attempt()?.status).toBe('PAUSED'); // la pausa quedó registrada
      expect(component.showContentWarning()).toBe(true);
      expect(component.error()).toBe('');
    });

    it('con el aviso a la vista Esc sigue sin pausar (decisión de ETH-01), y el aviso no tiene que ver con el servidor', () => {
      component.showContentWarning.set(true);
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });

      component.handleGlobalInteraction(event);

      expect(event.defaultPrevented).toBe(true);
      expect(sim['safeExit']).not.toHaveBeenCalled();
    });

    it('reanudar un intento en pausa no pasa por el consentimiento', () => {
      component.attempt.set(makeAttempt({ status: 'PAUSED' }));
      sim['resumeAttempt'].mockReturnValue(of(makeAttempt()));

      component.resumeCurrentAttempt();

      expect(sim['resumeAttempt']).toHaveBeenCalledWith('attempt-1');
      expect(component.showContentWarning()).toBe(false);
      expect(recorder.prime).not.toHaveBeenCalled();
    });
  });

  describe('aceptar el aviso: qué se dice si no se pudo registrar', () => {
    function showNotice(): void {
      component.attempt.set(makeAttempt());
      component.loading.set(false);
      component.showContentWarning.set(true);
    }

    it('un aviso de otra versión dice que hay una versión nueva y que se recargue; no se arranca nada', async () => {
      setup();
      showNotice();
      recorder.record.mockImplementation(() => Promise.reject(new ConsentNoticeStaleError('aviso-vigente')));

      component.acceptContentWarning();
      await Promise.resolve();
      await Promise.resolve();

      expect(component.consentState()).toBe('error');
      expect(component.consentErrorText()).toBe(DRAFT_COPY.consentNoticeStale.text);
      expect(component.showContentWarning()).toBe(true);
      expect(component.worldStarted()).toBe(false);
      expect(audio['init']).not.toHaveBeenCalled();
    });

    it('cualquier otro fallo conserva el texto de siempre, y un reintento exitoso arranca el mundo', async () => {
      setup();
      showNotice();
      recorder.record
        .mockImplementationOnce(() => Promise.reject(new ConsentNoticeStaleError(null)))
        .mockImplementationOnce(() => Promise.reject(new Error('sin red')))
        .mockImplementation(() => { recorder.setGiven(true); return Promise.resolve(); });

      component.acceptContentWarning();
      await Promise.resolve();
      await Promise.resolve();
      expect(component.consentErrorText()).toBe(DRAFT_COPY.consentNoticeStale.text);

      component.acceptContentWarning(); // «Reintentar»
      await Promise.resolve();
      await Promise.resolve();
      expect(component.consentState()).toBe('error');
      expect(component.consentErrorText()).toBe(DRAFT_COPY.consentStorageError.text);

      component.acceptContentWarning();
      await Promise.resolve();
      await Promise.resolve();
      expect(component.consentState()).toBe('idle');
      expect(component.showContentWarning()).toBe(false);
      expect(component.worldStarted()).toBe(true);
    });
  });

  describe('con el registro en servidor de verdad (sin doble del registro)', () => {
    const consentState = (accepted: boolean) => of({
      required: true, noticeVersion: CONTENT_NOTICE_VERSION, accepted, acceptedAt: accepted ? '2026-10-18T10:00:00' : null,
    });

    it('quien ya aceptó en otro navegador entra sin ver el aviso, y sin sessionStorage', async () => {
      setup({ recorder: null });
      sim['getConsent'] = vi.fn(() => consentState(true));

      component.ngOnInit();
      await vi.waitFor(() => expect(component.worldStarted()).toBe(true));

      expect(sim['getConsent']).toHaveBeenCalledWith(CASE_VERSION_ID);
      expect(component.showContentWarning()).toBe(false);
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('quien no ha aceptado ve el aviso; al aceptar se registra en el servidor con la versión del aviso y recién entonces entra', async () => {
      setup({ recorder: null });
      sim['getConsent'] = vi.fn(() => consentState(false));
      sim['acceptConsent'] = vi.fn(() => of({ caseVersionId: CASE_VERSION_ID, acceptedAt: '2026-10-18T10:00:00', noticeVersion: CONTENT_NOTICE_VERSION }));

      component.ngOnInit();
      await vi.waitFor(() => expect(component.showContentWarning()).toBe(true));
      expect(component.worldStarted()).toBe(false);

      component.acceptContentWarning();
      await vi.waitFor(() => expect(component.worldStarted()).toBe(true));

      expect(sim['acceptConsent']).toHaveBeenCalledWith(CASE_VERSION_ID, CONTENT_NOTICE_VERSION);
      expect(component.showContentWarning()).toBe(false);
      expect(sessionStorage.getItem(KEY)).toBe('given');
    });

    it('si el GET falla se pide el aviso (sin error en pantalla); si el servidor rechaza aceptar, no se arranca', async () => {
      setup({ recorder: null });
      sim['getConsent'] = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 0 })));
      sim['acceptConsent'] = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 })));

      component.ngOnInit();
      await vi.waitFor(() => expect(component.showContentWarning()).toBe(true));
      expect(component.error()).toBe('');

      component.acceptContentWarning();
      await vi.waitFor(() => expect(component.consentState()).toBe('error'));

      expect(component.consentErrorText()).toBe(DRAFT_COPY.consentStorageError.text);
      expect(component.worldStarted()).toBe(false);
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('un 409 NOTICE_VERSION_STALE al aceptar dice que hay una versión nueva del aviso', async () => {
      setup({ recorder: null });
      sim['getConsent'] = vi.fn(() => consentState(false));
      sim['acceptConsent'] = vi.fn(() => throwError(() => new HttpErrorResponse({
        status: 409, error: { success: false, code: 'NOTICE_VERSION_STALE', message: 'x', noticeVersion: 'aviso-vigente-otro' },
      })));

      component.ngOnInit();
      await vi.waitFor(() => expect(component.showContentWarning()).toBe(true));
      component.acceptContentWarning();
      await vi.waitFor(() => expect(component.consentState()).toBe('error'));

      expect(component.consentErrorText()).toBe(DRAFT_COPY.consentNoticeStale.text);
      expect(component.worldStarted()).toBe(false);
    });

    it('un 403 CONSENT_REQUIRED a mitad de partida vuelve al aviso y lo que la memoria creía deja de valer', async () => {
      setup({ recorder: null });
      sim['getConsent'] = vi.fn(() => consentState(true));
      sim['useTool'].mockReturnValue(throwError(() => consentRequired()));
      component.ngOnInit();
      await vi.waitFor(() => expect(component.worldStarted()).toBe(true));
      component.world.set(WORLD);

      component.useTool('PAP');

      expect(component.showContentWarning()).toBe(true);
      expect(component.worldStarted()).toBe(false);
      expect(component.actionError()).toBe('');
      expect(component.attempt()?.attemptId).toBe('attempt-1');
    });
  });
});
