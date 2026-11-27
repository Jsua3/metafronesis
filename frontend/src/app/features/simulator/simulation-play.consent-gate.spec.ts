// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta.
// Solo se evalúa `extends Phaser.Scene` al cargar el módulo; el resto vive en
// métodos que estos tests nunca ejecutan (no se renderiza template).
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
import { readFileSync } from 'fs';
import { join } from 'path';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { EMPTY, of, Subject, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { DialogueState, MapObjectState, NpcConfig, SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { ShortcutSettings } from '../../core/a11y/shortcut-settings.service';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, ConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * ETH-01 — puerta de consentimiento a nivel de bootstrap.
 *
 * Igual que los demás specs del simulador: ts-jest puro no renderiza
 * templates, así que se ejercita la instancia (TestBed solo aporta el
 * contexto de inyección). El contrato observable: nada de audio, mundo,
 * HUD ni media se inicializa antes de aceptar la advertencia.
 */

const CASE_VERSION_ID = 7;

function makeAttempt(overrides: Record<string, unknown> = {}): SimulationAttemptState {
  return {
    attemptId: 'attempt-1',
    caseVersionId: CASE_VERSION_ID,
    caseTitle: 'Caso demo',
    status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { key: 'hospital-urgencias', title: 'Urgencias' },
    completionReport: null,
    ...overrides,
  } as unknown as SimulationAttemptState;
}

function consentKey(attempt: SimulationAttemptState): string {
  return `siep_case_consent_${attempt.caseVersionId}_${attempt.attemptId}`;
}

/**
 * Registro de prueba que guarda de verdad en `sessionStorage` y se cumple en el acto: este archivo lleva `vi.mock` y
 * se mantiene síncrono. Los estados guardando / error del registro real viven en `simulation-play.entries.spec.ts`.
 */
const storedConsent: ConsentRecorder = {
  isGiven: key => sessionStorage.getItem(key) === 'given',
  record: key => {
    sessionStorage.setItem(key, 'given');
    return { then: (onFulfilled?: (() => unknown) | null) => { onFulfilled?.(); return undefined as never; } };
  },
};

describe('SimulationPlayComponent — puerta de consentimiento (ETH-01)', () => {
  let component: SimulationPlayComponent;
  let sim: {
    getActiveAttempt: Mock;
    startAttempt: Mock;
    getProgressMap: Mock;
    getWorld: Mock;
    getScenarioConfig: Mock;
    safeExit: Mock;
    enterRoom: Mock;
    recordNpcInteraction: Mock;
    updateWorldState: Mock;
    resumeAttempt: Mock;
  };
  let audio: {
    init: Mock;
    setScene: Mock;
    isMusicMuted: Mock;
    isSfxMuted: Mock;
    dispose: Mock;
    stopIntroLament: Mock;
    playIntroLament: Mock;
    playSfx: Mock;
    toggleMusicMuted: Mock;
  };
  let router: { navigate: Mock };

  function setup(activeAttempt: SimulationAttemptState | null) {
    sessionStorage.clear();
    sim = {
      getActiveAttempt: vi.fn(() => of(activeAttempt)),
      startAttempt: vi.fn(() => of(makeAttempt())),
      getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => EMPTY),
      getScenarioConfig: vi.fn(() => EMPTY),
      safeExit: vi.fn(() => EMPTY),
      enterRoom: vi.fn(() => EMPTY),
      recordNpcInteraction: vi.fn(() => EMPTY),
      updateWorldState: vi.fn(() => EMPTY),
      resumeAttempt: vi.fn(() => of(makeAttempt())),
    };
    audio = {
      init: vi.fn(),
      setScene: vi.fn(),
      isMusicMuted: vi.fn(() => false),
      isSfxMuted: vi.fn(() => false),
      dispose: vi.fn(),
      stopIntroLament: vi.fn(),
      playIntroLament: vi.fn(),
      playSfx: vi.fn(),
      toggleMusicMuted: vi.fn(() => false),
    };
    router = { navigate: vi.fn() };

    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        { provide: Router, useValue: router },
        { provide: CONSENT_RECORDER, useValue: storedConsent },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: String(CASE_VERSION_ID) }) } },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
  }

  afterEach(() => {
    component?.ngOnDestroy(); // cancela los temporizadores pendientes antes de que se desmonte el entorno
    sessionStorage.clear();
    localStorage.removeItem('siep.atajos.v1'); // el ajuste «Atajos de una tecla» no se filtra entre pruebas
    TestBed.resetTestingModule();
  });

  it('al reanudar sin consentimiento muestra la advertencia y NO inicializa audio ni mundo', () => {
    setup(makeAttempt());
    component.ngOnInit();
    component.resumeAttempt();

    expect(component.showContentWarning()).toBe(true);
    expect(component.worldStarted()).toBe(false);
    expect(audio.init).not.toHaveBeenCalled();
    expect(audio.setScene).not.toHaveBeenCalled();
    expect(sim.getWorld).not.toHaveBeenCalled();
    expect(sim.getProgressMap).not.toHaveBeenCalled();
  });

  it('aceptar registra el consentimiento e inicializa audio y mundo UNA sola vez', () => {
    setup(makeAttempt());
    component.ngOnInit();
    component.resumeAttempt();

    component.acceptContentWarning();
    component.acceptContentWarning(); // doble clic / señal repetida

    expect(sessionStorage.getItem(consentKey(makeAttempt()))).toBe('given');
    expect(component.showContentWarning()).toBe(false);
    expect(component.worldStarted()).toBe(true);
    expect(audio.init).toHaveBeenCalledTimes(1);
    expect(sim.getWorld).toHaveBeenCalledTimes(1);
    expect(sim.getProgressMap).toHaveBeenCalledTimes(1);
    expect(audio.setScene).toHaveBeenCalledTimes(1);
  });

  it('rechazar vuelve al catálogo sin inicializar nada y sin llamar safe-exit', () => {
    setup(makeAttempt());
    component.ngOnInit();
    component.resumeAttempt();

    component.declineContentWarning();

    expect(router.navigate).toHaveBeenCalledWith(['/portal/simulador']);
    expect(audio.init).not.toHaveBeenCalled();
    expect(sim.getWorld).not.toHaveBeenCalled();
    expect(sim.safeExit).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(consentKey(makeAttempt()))).toBeNull();
  });

  it('con consentimiento ya registrado en la sesión arranca directo (una vez) sin advertencia', () => {
    const attempt = makeAttempt();
    setup(attempt);
    sessionStorage.setItem(consentKey(attempt), 'given');

    component.ngOnInit();
    component.resumeAttempt();

    expect(component.showContentWarning()).toBe(false);
    expect(component.worldStarted()).toBe(true);
    expect(audio.init).toHaveBeenCalledTimes(1);
    expect(sim.getWorld).toHaveBeenCalledTimes(1);
  });

  it('Escape bajo la advertencia no dispara la salida segura', () => {
    setup(makeAttempt());
    component.ngOnInit();
    component.resumeAttempt();

    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    component.handleGlobalInteraction(event);

    expect(event.defaultPrevented).toBe(true);
    expect(sim.safeExit).not.toHaveBeenCalled();
    expect(component.showContentWarning()).toBe(true);
  });

  it('Enter/Espacio bajo la advertencia no activan controles del fondo ni avanzan el flujo', () => {
    setup(makeAttempt());
    component.ngOnInit();
    component.resumeAttempt();

    component.handleGlobalInteraction(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    component.handleGlobalInteraction(new KeyboardEvent('keydown', { key: ' ', cancelable: true }));

    expect(component.showContentWarning()).toBe(true);
    expect(component.showCaseIntro()).toBe(false);
    expect(component.worldStarted()).toBe(false);
    expect(audio.init).not.toHaveBeenCalled();
    expect(sim.getWorld).not.toHaveBeenCalled();
  });

  it('reanudar un intento PAUSED pasa por el endpoint de resume y vuelve a pedir consentimiento', () => {
    setup(makeAttempt({ status: 'PAUSED' }));
    component.ngOnInit();
    expect(component.showResumePrompt()).toBe(true);

    component.resumeAttempt();

    expect(sim.resumeAttempt).toHaveBeenCalledWith('attempt-1');
    // El backend devolvió IN_PROGRESS (mismo attemptId); sin consentimiento
    // registrado, el gate ETH-01 vuelve a mostrarse antes de cargar nada.
    expect(component.attempt()?.status).toBe('IN_PROGRESS');
    expect(component.showContentWarning()).toBe(true);
    expect(sim.getWorld).not.toHaveBeenCalled();
  });

  it('un intento nuevo (otro attemptId) vuelve a pedir consentimiento', () => {
    const previous = makeAttempt();
    setup(previous);
    sessionStorage.setItem(consentKey(previous), 'given');
    sim.startAttempt = vi.fn(() => of(makeAttempt({ attemptId: 'attempt-2' })));

    component.ngOnInit();
    component.startNewAttempt();

    expect(component.showContentWarning()).toBe(true);
    expect(component.worldStarted()).toBe(false);
    expect(sim.getWorld).not.toHaveBeenCalled();
  });

  it('deriva un único bloqueo de input para consentimiento, diálogo y bitácora', () => {
    setup(makeAttempt());

    component.showContentWarning.set(true);
    expect(component.inputBlocked()).toBe(true);

    component.showContentWarning.set(false);
    component.dialogue.set({ key: 'dialogue-test', lines: [], choices: [] } as unknown as DialogueState);
    expect(component.inputBlocked()).toBe(true);

    component.dialogue.set(null);
    component.journalOpen.set(true);
    expect(component.inputBlocked()).toBe(true);
  });

  it('no abre una interacción cercana con E mientras un overlay bloquea el mundo', () => {
    setup(makeAttempt());
    component.nearbyInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as unknown as MapObjectState);
    component.dialogue.set({ key: 'dialogue-test', lines: [], choices: [] } as unknown as DialogueState);
    const open = vi.spyOn(component, 'openInteraction');

    component.handleGlobalInteraction(new KeyboardEvent('keydown', { key: 'e', cancelable: true }));

    expect(open).not.toHaveBeenCalled();
  });

  it('no cancela Enter sobre un botón nativo cuando un diálogo bloquea el mundo', () => {
    setup(makeAttempt());
    component.dialogue.set({ key: 'dialogue-test', lines: [], choices: [] } as unknown as DialogueState);
    const button = document.createElement('button');
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    Object.defineProperty(event, 'target', { value: button });

    component.handleGlobalInteraction(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('Enter sobre un botón de la tarjeta del caso lo activa en vez de saltar la tarjeta', () => {
    setup(makeAttempt());
    component.showCaseIntro.set(true);
    const button = document.createElement('button');
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    Object.defineProperty(event, 'target', { value: button });

    component.handleGlobalInteraction(event);

    expect(event.defaultPrevented).toBe(false);
    expect(component.showCaseIntro()).toBe(true);
  });

  it('activar la música durante la intro vuelve a su tema, no a la música del mapa', () => {
    setup(makeAttempt());
    component.showCaseIntro.set(true);

    component.toggleMusicMute();

    expect(audio.playIntroLament).toHaveBeenCalled();
    expect(audio.setScene).not.toHaveBeenCalled();
  });

  describe('activación por teclado de los botones de las tarjetas de la intro', () => {
    function keydownOn(button: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
      Object.defineProperty(event, 'target', { value: button });
      return event;
    }

    beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }));
    afterEach(() => vi.useRealTimers());

    it('si Phaser cancela Enter o Espacio en window, el botón de la tarjeta se activa a mano', () => {
      setup(makeAttempt());
      component.showCaseIntro.set(true);
      const button = document.createElement('button');
      const click = vi.spyOn(button, 'click');

      for (const key of ['Enter', ' ']) {
        const event = keydownOn(button, key);
        component.handleGlobalInteraction(event);
        expect(event.defaultPrevented).toBe(false); // el manejador no cancela: lo hace Phaser después
        event.preventDefault(); // Phaser captura estas teclas y cancela la activación nativa
        vi.runAllTimers();
      }

      expect(click).toHaveBeenCalledTimes(2);
      expect(component.showCaseIntro()).toBe(true);
    });

    it('si nadie cancela la tecla, el botón se activa solo (sin doble activación)', () => {
      setup(makeAttempt());
      component.showCaseIntro.set(true);
      const button = document.createElement('button');
      const click = vi.spyOn(button, 'click');

      component.handleGlobalInteraction(keydownOn(button, 'Enter'));
      vi.runAllTimers();

      expect(click).not.toHaveBeenCalled();
    });

    it('mantener la tecla pulsada no repite la activación', () => {
      setup(makeAttempt());
      component.showCaseIntro.set(true);
      const button = document.createElement('button');
      const click = vi.spyOn(button, 'click');

      const event = keydownOn(button, ' ', { repeat: true });
      component.handleGlobalInteraction(event);
      event.preventDefault();
      vi.runAllTimers();

      expect(click).not.toHaveBeenCalled();
    });
  });

  describe('atajos de una tecla (F6-10, WCAG 2.1.4)', () => {
    // req: BLOQUE-H (H-07), RNF-04
    function keyOn(target: Element | null, key: string): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key, cancelable: true });
      Object.defineProperty(event, 'target', { value: target });
      return event;
    }

    it('activos, la J abre la bitácora con el foco en el juego (cuerpo) y la cierra', () => {
      setup(makeAttempt());
      const event = keyOn(document.body, 'j');
      component.handleGlobalInteraction(event);
      expect(event.defaultPrevented).toBe(true);
      expect(component.journalOpen()).toBe(true);
    });

    // req: BLOQUE-H (H-07), RNF-04 (revisión de F6)
    it('con el foco en un botón de la interfaz la J sigue abriendo la bitácora: ninguna letra lo activa', () => {
      setup(makeAttempt());
      const event = keyOn(document.createElement('button'), 'j');
      component.handleGlobalInteraction(event);
      expect(event.defaultPrevented).toBe(true);
      expect(component.journalOpen()).toBe(true);
    });

    it('con el foco en un botón DENTRO de un diálogo la J no hace nada: el atajo no actúa por detrás de un control', () => {
      setup(makeAttempt());
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      const button = document.createElement('button');
      dialog.appendChild(button);
      const event = keyOn(button, 'j');
      component.handleGlobalInteraction(event);
      expect(event.defaultPrevented).toBe(false);
      expect(component.journalOpen()).toBe(false);
    });

    it('un keydown cuyo destino es el documento (no un elemento) no lanza y cuenta como el juego', () => {
      setup(makeAttempt());
      const event = keyOn(document as unknown as Element, 'j');
      expect(() => component.handleGlobalInteraction(event)).not.toThrow();
      expect(component.journalOpen()).toBe(true);
    });

    it('con el foco en un campo de texto la J y la E no hacen nada', () => {
      setup(makeAttempt());
      component.nearbyInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as unknown as MapObjectState);
      const open = vi.spyOn(component, 'openInteraction');
      const field = document.createElement('textarea');
      for (const key of ['j', 'e']) component.handleGlobalInteraction(keyOn(field, key));
      expect(component.journalOpen()).toBe(false);
      expect(open).not.toHaveBeenCalled();
    });

    it('apagados, ni la J ni la E actúan aunque el foco esté en el juego', () => {
      setup(makeAttempt());
      TestBed.inject(ShortcutSettings).set(false);
      component.nearbyInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as unknown as MapObjectState);
      const open = vi.spyOn(component, 'openInteraction');
      const journal = keyOn(document.body, 'j');
      const interact = keyOn(document.body, 'e');
      component.handleGlobalInteraction(journal);
      component.handleGlobalInteraction(interact);
      expect(journal.defaultPrevented).toBe(false);
      expect(interact.defaultPrevented).toBe(false);
      expect(component.journalOpen()).toBe(false);
      expect(open).not.toHaveBeenCalled();
    });

    it('apagados, Enter sigue interactuando y Esc sigue su cadena (cierra la bitácora)', () => {
      setup(makeAttempt());
      TestBed.inject(ShortcutSettings).set(false);
      component.nearbyInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as unknown as MapObjectState);
      const open = vi.spyOn(component, 'openInteraction');
      component.handleGlobalInteraction(keyOn(document.body, 'Enter'));
      expect(open).toHaveBeenCalledTimes(1);

      component.journalOpen.set(true);
      const escape = keyOn(document.body, 'Escape');
      component.handleGlobalInteraction(escape);
      expect(escape.defaultPrevented).toBe(true);
      expect(component.journalOpen()).toBe(false);
    });

    it('la barra en reposo ya no promete teclas (ni con los atajos apagados ni con ellos activos): están en la ayuda', () => {
      const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');
      expect(source).not.toContain('Flechas mover');
      expect(source).not.toContain('WASD mover');
    });
  });

  it('no autocierra un feedback de herramienta antes de que el usuario lea sus líneas', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      setup(makeAttempt());
      const subject = component as unknown as {
        showToolFeedback(result: {
          toolCode: string;
          pertinent: boolean;
          feedbackMessage: string;
        }): void;
      };

      subject.showToolFeedback({
        toolCode: 'PAP',
        pertinent: true,
        feedbackMessage: 'Una explicación clínica extensa que debe avanzar manualmente.',
      });
      vi.advanceTimersByTime(5_000);

      expect(component.dialogue()?.lines).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('no acredita NPC con un diálogo abierto, y la salida segura sigue disponible desde la superposición', () => {
    setup(makeAttempt());
    component.attempt.set(makeAttempt());
    component.dialogue.set({ key: 'dialogue-test', lines: [], choices: [] } as unknown as DialogueState);

    component.openNpcDialogue({ key: 'enfermera-urgencias', dialogue: { lines: [] } } as unknown as NpcConfig);
    component.pauseFromOverlay();

    expect(sim.recordNpcInteraction).not.toHaveBeenCalled();
    expect(sim.safeExit).toHaveBeenCalledTimes(1);
  });

  it('acredita y abre el diálogo del NPC solo después del 2xx autoritativo', () => {
    setup(makeAttempt());
    component.attempt.set(makeAttempt());
    const response$ = new Subject<SimulationWorldState>();
    sim.recordNpcInteraction.mockReturnValue(response$);
    const npc = {
      key: 'enfermera-urgencias',
      displayName: 'Enfermera',
      dialogue: { lines: [{ text: 'Acércate.' }] },
    } as unknown as NpcConfig;

    component.openNpcDialogue(npc);

    expect((component as any).viewedNpcKeys().has(npc.key)).toBe(false);
    expect(component.dialogue()).toBeNull();

    response$.next({ flags: { viewedNpcKeys: [npc.key] } } as unknown as SimulationWorldState);

    expect((component as any).viewedNpcKeys().has(npc.key)).toBe(true);
    expect(component.dialogue()?.key).toBe(`npc-${npc.key}`);
  });

  it('sincroniza la posición pendiente antes de acreditar un NPC', () => {
    setup(makeAttempt());
    component.attempt.set(makeAttempt());
    const world = {
      map: { key: 'hospital-urgencias' },
      player: { x: 250, y: 430 },
      flags: {},
    } as unknown as SimulationWorldState;
    component.world.set(world);
    (component as any).lastPosition = { x: 560, y: 380 };
    const sync$ = new Subject<unknown>();
    sim.updateWorldState.mockReturnValue(sync$);
    sim.recordNpcInteraction.mockReturnValue(EMPTY);
    const npc = {
      key: 'enfermera-urgencias',
      displayName: 'Enfermera',
      dialogue: { lines: [{ text: 'Acércate.' }] },
    } as unknown as NpcConfig;

    component.openNpcDialogue(npc);

    expect(sim.updateWorldState).toHaveBeenCalledWith(
      'attempt-1', 560, 380, 'hospital-urgencias',
    );
    expect(sim.recordNpcInteraction).not.toHaveBeenCalled();

    sync$.next({ attemptId: 'attempt-1', status: 'IN_PROGRESS', map: { key: 'hospital-urgencias' }, player: { x: 560, y: 380 } });

    expect(sim.recordNpcInteraction).toHaveBeenCalledWith(
      'attempt-1', 'enfermera-urgencias',
    );
  });

  it('la salida segura no espera a la red: la pausa se ve en el acto y la posición pendiente sale antes que la pausa (REGLA-004, V4)', () => {
    setup(makeAttempt());
    component.attempt.set(makeAttempt());
    const world = {
      map: { key: 'hospital-sala-escucha' },
      player: { x: 320, y: 440 },
      flags: {},
    } as unknown as SimulationWorldState;
    component.world.set(world);
    (component as any).lastPosition = { x: 612, y: 444 };
    const sync$ = new Subject<SimulationWorldState>();
    sim.updateWorldState.mockReturnValue(sync$);
    sim.safeExit.mockReturnValue(EMPTY);

    component.pauseFromOverlay();

    expect(component.attempt()?.status).toBe('PAUSED');
    expect(sim.updateWorldState).toHaveBeenCalledWith('attempt-1', 612, 444, 'hospital-sala-escucha', true);
    expect(sim.safeExit).not.toHaveBeenCalled();
    sync$.next({ attemptId: 'attempt-1', status: 'IN_PROGRESS', map: { key: 'hospital-sala-escucha' }, player: { x: 612, y: 444 } } as never);
    expect(sim.safeExit).toHaveBeenCalledWith(
      'attempt-1', 'Salida segura solicitada',
    );
  });

  describe('posición viva antes de una acción validada', () => {
    const world = {
      map: { key: 'hospital-urgencias' },
      player: { x: 250, y: 430 },
      flags: {},
    } as unknown as SimulationWorldState;
    const npc = {
      key: 'enfermera-urgencias',
      displayName: 'Enfermera',
      dialogue: { lines: [{ text: 'Acércate.' }] },
    } as unknown as NpcConfig;

    beforeEach(() => {
      setup(makeAttempt());
      component.attempt.set(makeAttempt());
      component.world.set(world);
      sim.updateWorldState.mockReturnValue(EMPTY);
      sim.recordNpcInteraction.mockReturnValue(EMPTY);
    });

    it('persiste la posición de la escena, no la última que llegó a Angular (hasta 125 ms atrás)', () => {
      (component as any).lastPosition = { x: 560, y: 380 };
      (component as any).gameWorld = { playerPosition: vi.fn(() => ({ x: 579, y: 384 })) };

      component.openNpcDialogue(npc);

      expect(sim.updateWorldState).toHaveBeenCalledTimes(1);
      expect(sim.updateWorldState).toHaveBeenCalledWith(
        'attempt-1', 579, 384, 'hospital-urgencias',
      );
      expect((component as any).lastPosition).toEqual({ x: 579, y: 384 });
    });

    it('sin gameWorld usa lastPosition', () => {
      (component as any).lastPosition = { x: 560, y: 380 };
      (component as any).gameWorld = undefined;

      component.openNpcDialogue(npc);

      expect(sim.updateWorldState).toHaveBeenCalledWith(
        'attempt-1', 560, 380, 'hospital-urgencias',
      );
    });

    it('si la escena aún no tiene jugador (null) usa lastPosition', () => {
      (component as any).lastPosition = { x: 560, y: 380 };
      (component as any).gameWorld = { playerPosition: vi.fn(() => null) };

      component.openNpcDialogue(npc);

      expect(sim.updateWorldState).toHaveBeenCalledWith(
        'attempt-1', 560, 380, 'hospital-urgencias',
      );
    });

    it('si la posición viva ya está sincronizada no repite la persistencia', () => {
      (component as any).lastPosition = { x: 560, y: 380 };
      (component as any).lastSyncedPosition = { x: 579, y: 384 };
      (component as any).gameWorld = { playerPosition: vi.fn(() => ({ x: 579, y: 384 })) };

      component.openNpcDialogue(npc);

      expect(sim.updateWorldState).not.toHaveBeenCalled();
      expect(sim.recordNpcInteraction).toHaveBeenCalledWith('attempt-1', 'enfermera-urgencias');
    });

    it('la salida segura toma la posición viva del mundo y la deja guardada antes de la pausa (V4)', () => {
      (component as any).lastPosition = { x: 612, y: 444 };
      (component as any).gameWorld = { playerPosition: vi.fn(() => ({ x: 640, y: 450 })) };
      sim.updateWorldState.mockReturnValue(of({ attemptId: 'attempt-1', status: 'IN_PROGRESS', map: { key: 'hospital-urgencias' }, player: { x: 640, y: 450 } }));
      sim.safeExit.mockReturnValue(EMPTY);

      component.pauseFromOverlay();

      expect(sim.updateWorldState).toHaveBeenCalledTimes(1);
      expect(sim.updateWorldState.mock.calls[0].slice(1, 3)).toEqual([640, 450]);
      expect(sim.safeExit).toHaveBeenCalledTimes(1);
    });
  });

  it('conserva la configuración autorada mientras carga la del mundo siguiente', () => {
    setup(makeAttempt());
    const previousConfig = {
      scenarioKey: 'hospital-urgencias',
      startRoomKey: 'hospital-urgencias',
      rooms: [],
    };
    const nextConfig = {
      scenarioKey: 'hospital-sala-escucha',
      startRoomKey: 'hospital-sala-escucha',
      rooms: [],
    };
    const nextWorld = {
      map: { key: 'hospital-sala-escucha' },
      player: { x: 160, y: 452 },
      flags: {},
    } as unknown as SimulationWorldState;
    const config$ = new Subject<typeof nextConfig>();
    component.scenarioConfig.set(previousConfig as any);
    sim.getScenarioConfig.mockReturnValue(config$);

    (component as any).applyWorldWithScenario(nextWorld);

    expect(component.scenarioConfig()).toBe(previousConfig);
    expect(component.world()).toBeNull();

    config$.next(nextConfig);

    expect(component.scenarioConfig()).toBe(nextConfig);
    expect(component.world()).toBe(nextWorld);
  });

  it('bloquea la puerta de retorno hasta alejarse del punto de entrada', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      setup(makeAttempt({ currentNode: { key: 'hospital-urgencias', title: 'Urgencias' } }));
      component.attempt.set(makeAttempt());
      const returnDoor = {
        key: 'puerta-urgencias',
        type: 'EXIT',
        x: 122,
        y: 460,
        metadata: { targetNodeKey: 'hospital-urgencias', entryX: 786, entryY: 440 },
      } as unknown as MapObjectState;
      component.world.set({
        map: { key: 'hospital-sala-escucha' },
        player: { x: 160, y: 447 },
        objects: [returnDoor],
        flags: {},
      } as unknown as SimulationWorldState);

      component.openInteraction(returnDoor);
      vi.advanceTimersByTime(400);

      expect(sim.enterRoom).not.toHaveBeenCalled();
      // P8: ya no es un aviso modal del sistema sino uno no bloqueante que dice cuánto falta y hacia dónde.
      expect(component.doorNotice()).toBe('');
      expect(component.stepsNotice()).toMatch(/da unos pasos lejos de la puerta/i);

      component.rememberPosition(340, 450);
      component.rememberPosition(145, 455);
      (component as any).lastSyncedPosition = { x: 145, y: 455 };
      component.openInteraction(returnDoor);
      vi.advanceTimersByTime(400);

      expect(sim.enterRoom).toHaveBeenCalledWith(
        'attempt-1', 'hospital-urgencias', 'puerta-urgencias',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('al cargar el mundo la persona del intento llega al icono del mundo', () => {
    setup(makeAttempt());
    const persona = { bond: 'OPEN', activation: 'CALM', label: 'se muestra abierta y serena' };
    const updatePatientVisualState = vi.fn();
    (component as any).gameWorld = { updatePatientVisualState, setPersonaState: vi.fn(), places: vi.fn(() => []) };
    component.attempt.set(makeAttempt({ persona }));

    (component as any).applyLoadedWorld({
      map: { key: 'hospital-urgencias' },
      flags: {},
    } as unknown as SimulationWorldState);

    expect(updatePatientVisualState).toHaveBeenCalledWith(persona);
  });

  it('expone un control de interacción únicamente para el objeto cercano sin overlay', () => {
    setup(makeAttempt());
    component.attempt.set(makeAttempt());
    const nearby = { key: 'familia-crisis', type: 'PERSON' } as unknown as MapObjectState;
    component.nearbyInteraction.set(nearby);

    expect(component.contextualInteraction()).toBe(nearby);

    component.dialogue.set({ key: 'dialogue-test', lines: [], choices: [] } as unknown as DialogueState);
    expect(component.contextualInteraction()).toBeNull();
  });

  /**
   * REGLA-004 / ETH-02 (F§7.8): la salida segura debe poder alcanzarse desde cada superposición.
   * El camino de las superposiciones y del pie es `pauseFromOverlay()` (ya no existe un `safeExit()` aparte): pausa en el
   * cliente en el acto y sincroniza con el servidor a través de la pausa pendiente (`pausa`).
   */
  describe('salida segura desde las superposiciones (pauseFromOverlay)', () => {
    const optionsDialogue = {
      key: 'dialogue-opciones',
      lines: [{ order: 1, speakerName: 'Familia', text: 'Ayúdanos.', emotion: 'concerned' }],
      choices: [{ key: 'opt-1', text: 'Opción', decisionOptionId: 11, requiredToolCode: null, effect: {} }],
    } as unknown as DialogueState;

    function escapeOn(target?: HTMLElement): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      if (target) Object.defineProperty(event, 'target', { value: target });
      return event;
    }

    beforeEach(() => {
      setup(makeAttempt());
      component.attempt.set(makeAttempt());
    });

    it('con un diálogo con opciones abierto pausa y llama UNA sola vez a sim.safeExit', () => {
      component.dialogue.set(optionsDialogue);

      component.pauseFromOverlay();
      component.pauseFromOverlay(); // segundo toque mientras la pausa sigue en curso

      expect(sim.safeExit).toHaveBeenCalledTimes(1);
      expect(sim.safeExit).toHaveBeenCalledWith('attempt-1', 'Salida segura solicitada');
      expect(audio.playSfx).toHaveBeenCalledWith('ui_cancel');
    });

    it('pausar desde la introducción limpia la tarjeta y las demás superposiciones y detiene el tema', () => {
      component.showCaseIntro.set(true);
      component.journalOpen.set(true);
      component.dialogue.set(optionsDialogue);
      component.selectedInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as unknown as MapObjectState);
      sim.safeExit.mockReturnValue(of(makeAttempt({ status: 'PAUSED' })));

      component.pauseFromOverlay();

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.showCaseIntro()).toBe(false);
      expect(component.journalOpen()).toBe(false);
      expect(component.helpOpen()).toBe(false);
      expect(component.dialogue()).toBeNull();
      expect(component.selectedInteraction()).toBeNull();
      expect(audio.stopIntroLament).toHaveBeenCalled();
      expect(component.pausing()).toBe(false);
    });

    it('descarta la restricción pendiente al pausar', () => {
      (component as any).pendingRestrictedInteraction.set({ key: 'objeto-riesgoso' } as unknown as MapObjectState);
      sim.safeExit.mockReturnValue(of(makeAttempt({ status: 'PAUSED' })));

      component.pauseFromOverlay();

      expect((component as any).pendingRestrictedInteraction()).toBeNull();
    });

    it('pausa en el acto y una sola vez; la posición pendiente sale una vez, antes de la única pausa (V4)', () => {
      component.world.set({ map: { key: 'hospital-urgencias' }, flags: {} } as unknown as SimulationWorldState);
      (component as any).lastPosition = { x: 612, y: 444 };
      const sync$ = new Subject<SimulationWorldState>();
      sim.updateWorldState.mockReturnValue(sync$);
      component.showCaseIntro.set(true);

      component.pauseFromOverlay();
      component.pauseFromOverlay();

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.showCaseIntro()).toBe(false);
      expect(sim.updateWorldState).toHaveBeenCalledTimes(1);
      expect(sim.safeExit).not.toHaveBeenCalled();
      sync$.next({ attemptId: 'attempt-1', status: 'IN_PROGRESS', map: { key: 'hospital-urgencias' }, player: { x: 612, y: 444 } } as never);
      expect(sim.safeExit).toHaveBeenCalledTimes(1);
    });

    it('si el servidor falla la persona sale igual (V3, REGLA-004): la superposición se cierra, el intento queda PAUSED y la pausa se reintenta sola', () => {
      component.showCaseIntro.set(true);
      sim.safeExit.mockReturnValueOnce(throwError(() => new Error('sin red')));

      component.pauseFromOverlay();

      expect(component.showCaseIntro()).toBe(false);
      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.busy()).toBe(false);
      expect(component.pauseNote()).not.toBeNull();
      expect(component.actionError()).toBe('');

      sim.safeExit.mockReturnValue(of(makeAttempt({ status: 'PAUSED' })));
      window.dispatchEvent(new Event('online'));   // al volver la conexión reintenta en el acto

      expect(sim.safeExit).toHaveBeenCalledTimes(2);
      expect(component.pauseNote()).toBeNull();
      expect(component.pausing()).toBe(false);
    });

    it('no actúa bajo el aviso de contenido (ETH-01) ni bajo el aviso de reanudar', () => {
      component.showContentWarning.set(true);
      component.pauseFromOverlay();
      component.showContentWarning.set(false);

      component.showResumePrompt.set(true);
      component.pauseFromOverlay();

      expect(sim.safeExit).not.toHaveBeenCalled();
      expect(component.pausing()).toBe(false);
    });

    it('no actúa sin un intento en progreso', () => {
      component.attempt.set(makeAttempt({ status: 'PAUSED' }));
      component.pauseFromOverlay();
      component.attempt.set(null);
      component.pauseFromOverlay();

      expect(sim.safeExit).not.toHaveBeenCalled();
    });

    describe('con una petición en curso (H-04)', () => {
      it('sale en el acto aunque la petición siga en vuelo: no espera a que se suelte busy', () => {
        component.busy.set(true);

        component.pauseFromOverlay();

        expect(component.pausing()).toBe(true);
        expect(sim.safeExit).toHaveBeenCalledTimes(1);

        component.busy.set(false);
        TestBed.tick();

        expect(sim.safeExit).toHaveBeenCalledTimes(1);
      });

      it('varios toques mientras espera no producen más de una pausa', () => {
        component.busy.set(true);

        component.pauseFromOverlay();
        component.pauseFromOverlay();
        component.pauseFromOverlay();
        component.busy.set(false);
        TestBed.tick();
        TestBed.tick();

        expect(sim.safeExit).toHaveBeenCalledTimes(1);
      });

      it('si el intento ya terminó no se pausa ni se llama al servidor', () => {
        component.busy.set(true);
        component.attempt.set(makeAttempt({ status: 'COMPLETED' }));

        component.pauseFromOverlay();
        TestBed.tick();

        expect(sim.safeExit).not.toHaveBeenCalled();
        expect(component.pausing()).toBe(false);
      });
    });

    describe('Esc', () => {
      it('en la introducción pausa aunque el foco esté en un botón', () => {
        component.showCaseIntro.set(true);
        const event = escapeOn(document.createElement('button'));

        component.handleGlobalInteraction(event);

        expect(event.defaultPrevented).toBe(true);
        expect(sim.safeExit).toHaveBeenCalledTimes(1);
      });

      it('si otro manejador ya consumió Esc no se pausa por segunda vez', () => {
        component.showCaseIntro.set(true);
        const event = escapeOn();
        event.preventDefault();

        component.handleGlobalInteraction(event);

        expect(sim.safeExit).not.toHaveBeenCalled();
      });

      it('bajo el aviso de contenido sigue sin pausar', () => {
        component.showContentWarning.set(true);
        const event = escapeOn(document.createElement('button'));

        component.handleGlobalInteraction(event);

        expect(event.defaultPrevented).toBe(true);
        expect(sim.safeExit).not.toHaveBeenCalled();
      });

      it('con el mundo activo cierra primero la ayuda, luego la bitácora, luego el diálogo y al final pausa', () => {
        component.helpOpen.set(true);
        component.journalOpen.set(true);
        component.dialogue.set(optionsDialogue);

        component.handleGlobalInteraction(escapeOn());
        expect(component.helpOpen()).toBe(false);
        expect(component.journalOpen()).toBe(true);
        expect(component.dialogue()).not.toBeNull();

        component.handleGlobalInteraction(escapeOn());
        expect(component.journalOpen()).toBe(false);
        expect(component.dialogue()).not.toBeNull();

        component.handleGlobalInteraction(escapeOn());
        expect(component.dialogue()).toBeNull();
        expect(sim.safeExit).not.toHaveBeenCalled();

        component.handleGlobalInteraction(escapeOn());
        expect(sim.safeExit).toHaveBeenCalledTimes(1);
      });

      it('con una petición en curso pausa en el acto en vez de ignorar la tecla', () => {
        component.busy.set(true);
        const event = escapeOn();

        component.handleGlobalInteraction(event);

        expect(event.defaultPrevented).toBe(true);
        expect(component.pausing()).toBe(true);
        expect(sim.safeExit).toHaveBeenCalledTimes(1);
      });
    });

    describe('al reanudar', () => {
      const world = { map: { key: 'hospital-urgencias' }, flags: {} } as unknown as SimulationWorldState;

      function pauseThenResume(): void {
        sim.safeExit.mockReturnValue(of(makeAttempt({ status: 'PAUSED' })));
        // El mundo se recarga al pausar (suelta busy); la sala no cambia.
        sim.getWorld.mockReturnValue(of(component.world()));
        sim.getScenarioConfig.mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));
        component.pauseFromOverlay();
        expect(component.attempt()?.status).toBe('PAUSED');
        component.resumeCurrentAttempt();
      }

      beforeEach(() => {
        component.world.set(world);
        sessionStorage.setItem(consentKey(makeAttempt()), 'given');
      });

      it('la introducción sin leer reaparece (no queda la pausa tapada por la tarjeta)', () => {
        component.showCaseIntro.set(true);
        component.reduceMotion.set(false);

        pauseThenResume();

        expect(component.attempt()?.status).toBe('IN_PROGRESS');
        expect(component.showCaseIntro()).toBe(true);
        expect(audio.playIntroLament).toHaveBeenCalled();
      });

      it('con movimiento reducido la tarjeta reaparece igual', () => {
        component.showCaseIntro.set(true);
        component.reduceMotion.set(true);

        pauseThenResume();

        expect(component.showCaseIntro()).toBe(true);
      });

      it('un diálogo que llegó tarde durante la pausa no reaparece al reanudar', () => {
        sessionStorage.setItem(`siep_case_intro_${CASE_VERSION_ID}_attempt-1`, 'read');
        sim.safeExit.mockReturnValue(of(makeAttempt({ status: 'PAUSED' })));
        sim.getWorld.mockReturnValue(of(component.world()));
        sim.getScenarioConfig.mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));
        component.pauseFromOverlay();
        // La supervisión de una decisión se abre 400 ms después y puede caer ya con el intento en pausa.
        component.dialogue.set(optionsDialogue);

        component.resumeCurrentAttempt();

        expect(component.dialogue()).toBeNull();
      });

      it('una introducción ya leída no reaparece', () => {
        sessionStorage.setItem(`siep_case_intro_${CASE_VERSION_ID}_attempt-1`, 'read');

        pauseThenResume();

        expect(component.showCaseIntro()).toBe(false);
      });

      it('la tarjeta sin leer sale en la escena donde se reanude, sea cual sea la sala', () => {
        component.world.set({ map: { key: 'otra-sala' }, flags: {} } as unknown as SimulationWorldState);

        pauseThenResume();

        expect(component.showCaseIntro()).toBe(true);
      });

      describe('con el mundo recargándose tras la pausa', () => {
        const scenario = { scenarioKey: 'x', startRoomKey: 'x', rooms: [] };

        it('«Reanudar» pulsado antes de que termine la recarga no se pierde: sale al terminar', () => {
          const worldReload = new Subject<SimulationWorldState>();
          sim.safeExit.mockReturnValue(of(makeAttempt({ status: 'PAUSED' })));
          sim.getWorld.mockReturnValue(worldReload);
          sim.getScenarioConfig.mockReturnValue(of(scenario));
          component.pauseFromOverlay();
          expect(component.attempt()?.status).toBe('PAUSED');
          expect(component.busy()).toBe(true);

          component.resumeCurrentAttempt();
          expect(sim.resumeAttempt).not.toHaveBeenCalled();

          worldReload.next(world);

          expect(sim.resumeAttempt).toHaveBeenCalledTimes(1);
          expect(component.attempt()?.status).toBe('IN_PROGRESS');
          expect(component.busy()).toBe(false);
        });

        it('varios toques durante la recarga producen una sola reanudación', () => {
          const worldReload = new Subject<SimulationWorldState>();
          sim.safeExit.mockReturnValue(of(makeAttempt({ status: 'PAUSED' })));
          sim.getWorld.mockReturnValue(worldReload);
          sim.getScenarioConfig.mockReturnValue(of(scenario));
          component.pauseFromOverlay();

          component.resumeCurrentAttempt();
          component.resumeCurrentAttempt();
          component.resumeCurrentAttempt();
          worldReload.next(world);

          expect(sim.resumeAttempt).toHaveBeenCalledTimes(1);
        });

        it('si la recarga falla, el toque encolado se descarta y no reanuda por sorpresa', () => {
          const worldReload = new Subject<SimulationWorldState>();
          sim.safeExit.mockReturnValue(of(makeAttempt({ status: 'PAUSED' })));
          sim.getWorld.mockReturnValue(worldReload);
          component.pauseFromOverlay();
          component.resumeCurrentAttempt();

          worldReload.error(new Error('sin red'));

          expect(sim.resumeAttempt).not.toHaveBeenCalled();
          expect(component.attempt()?.status).toBe('PAUSED');
          expect(component.busy()).toBe(false);
        });

        it('sin recarga pendiente, un toque con una petición en curso sigue sin encolarse', () => {
          sim.safeExit.mockReturnValue(of(makeAttempt({ status: 'PAUSED' })));
          sim.getWorld.mockReturnValue(of(component.world()));
          sim.getScenarioConfig.mockReturnValue(of(scenario));
          component.pauseFromOverlay();
          expect(component.busy()).toBe(false);

          component.busy.set(true);
          component.resumeCurrentAttempt();
          component.busy.set(false);

          expect(sim.resumeAttempt).not.toHaveBeenCalled();
        });
      });
    });
  });
});
