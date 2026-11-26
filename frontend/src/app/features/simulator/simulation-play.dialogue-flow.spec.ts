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

import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { EMPTY, Subject, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  DialogueState, MapObjectState, NpcConfig, SimulationAttemptState, SimulationWorldState,
} from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * Flujo del diálogo sin callejones (F§7.6, F§5.6, B§T8.3): un panel que se queda bloqueado tras un
 * rechazo o un error, un error que no dice la causa o un estado que sobrevive a un intento nuevo
 * dejan al estudiante sin salida. Se ejercita la instancia, como el resto de specs del juego.
 */

const CASE_VERSION_ID = 7;
/** Nodo sin evidencia exigida: la compuerta blanda no interviene en estos flujos. */
const FREE_NODE = 'nodo-sin-evidencia';

function makeAttempt(overrides: Record<string, unknown> = {}): SimulationAttemptState {
  return {
    attemptId: 'attempt-1',
    caseVersionId: CASE_VERSION_ID,
    caseTitle: 'Caso demo',
    status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: {
      key: FREE_NODE,
      title: 'Etapa',
      options: [{ id: 11, text: 'Opción de esta etapa' }],
    },
    completionReport: null,
    ...overrides,
  } as unknown as SimulationAttemptState;
}

function decisionDialogue(optionId: number): DialogueState {
  return {
    key: 'dialogue-decision',
    speakerName: 'Familia',
    portraitKey: null,
    emotion: 'neutral',
    lines: [{ order: 1, speakerName: 'Familia', text: 'Ayúdanos.', emotion: 'concerned' }],
    choices: [{
      key: `opt-${optionId}`, text: 'Opción', decisionOptionId: optionId,
      requiredToolCode: null, effect: {},
    }],
  } as unknown as DialogueState;
}

function http(status: number, message?: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: message ? { message } : null });
}

describe('SimulationPlayComponent: diálogo sin callejones', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;
  let audio: Record<string, Mock>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    sessionStorage.clear();
    sim = {
      getActiveAttempt: vi.fn(() => of(null)),
      startAttempt: vi.fn(() => of(makeAttempt({ attemptId: 'attempt-2' }))),
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
      getAttempt: vi.fn(() => of(makeAttempt())),
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
    component.attempt.set(makeAttempt());
    component.world.set({
      map: { key: 'hospital-urgencias' }, objects: [], tools: [], inventory: [],
      usedToolKeys: [], inspectedObjectKeys: [], flags: {},
    } as unknown as SimulationWorldState);
  });

  afterEach(() => {
    component?.ngOnDestroy(); // cancela los temporizadores pendientes antes de que se desmonte el entorno
    vi.useRealTimers();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('cerrar y empezar de nuevo', () => {
    it('cerrar el diálogo deja de marcar el objeto como seleccionado (DLG-31)', () => {
      component.selectedInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as unknown as MapObjectState);
      component.dialogue.set(decisionDialogue(11));

      component.closeDialogue();

      expect(component.dialogue()).toBeNull();
      expect(component.selectedInteraction()).toBeNull();
    });

    it('un intento nuevo no hereda el diálogo, la selección ni la bitácora abierta', () => {
      component.dialogue.set(decisionDialogue(11));
      component.selectedInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as unknown as MapObjectState);
      component.nearbyInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as unknown as MapObjectState);
      component.journalOpen.set(true);

      component.startNewAttempt();

      expect(sim['startAttempt']).toHaveBeenCalledWith(CASE_VERSION_ID, true, undefined);
      expect(component.dialogue()).toBeNull();
      expect(component.selectedInteraction()).toBeNull();
      expect(component.nearbyInteraction()).toBeNull();
      expect(component.journalOpen()).toBe(false);
    });
  });

  describe('elegir una opción', () => {
    it('una opción de otra etapa no llama al servidor, avisa y libera el panel', () => {
      component.dialogue.set(decisionDialogue(99));
      const before = component.dialogueReleaseToken();

      component.executeDecision(99);

      expect(sim['chooseDecision']).not.toHaveBeenCalled();
      expect(component.actionError()).toMatch(/otra etapa/i);
      expect(component.dialogueReleaseToken()).toBe(before + 1);
      expect(component.dialogue()).not.toBeNull();
    });

    it('elegir una opción la envía en el acto: no hay diálogo «Criterio profesional»', () => {
      component.dialogue.set(decisionDialogue(11));

      component.executeDecision(11);

      expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
      expect(sim['chooseDecision']).toHaveBeenCalledWith(
        expect.any(String), 11, expect.any(String),
      );
      expect(component.dialogue()).toBeNull();
    });

    it('con una petición en curso rechaza la elección sin dejarla bloqueada', () => {
      component.dialogue.set(decisionDialogue(11));
      component.busy.set(true);
      const before = component.dialogueReleaseToken();

      component.executeDecision(11);

      expect(sim['chooseDecision']).not.toHaveBeenCalled();
      expect(component.dialogueReleaseToken()).toBe(before + 1);
    });

    it('si el servidor falla libera el panel, devuelve la conversación y dice la causa real', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(400, 'Esta decisión ya fue registrada.')));
      const dialogue = decisionDialogue(11);
      component.dialogue.set(dialogue);
      const before = component.dialogueReleaseToken();

      component.executeDecision(11);
      vi.advanceTimersByTime(400);

      expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
      expect(component.actionError()).toBe('Esta decisión ya fue registrada.');
      expect(component.dialogueReleaseToken()).toBe(before + 1);
      expect(component.dialogue()).toBe(dialogue);
      expect(component.busy()).toBe(false);
      expect(component.fadeActive()).toBe(false);
    });

    it('un fallo sin mensaje del servidor usa el texto de respaldo', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(500)));
      component.dialogue.set(decisionDialogue(11));

      component.executeDecision(11);
      vi.advanceTimersByTime(400);

      expect(component.actionError()).toBe('No pudimos registrar tu decisión. Inténtalo de nuevo.');
    });

    it('un error que el interceptor ya comunicó (sin conexión) no duplica el aviso', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(0)));
      component.dialogue.set(decisionDialogue(11));
      const before = component.dialogueReleaseToken();

      component.executeDecision(11);
      vi.advanceTimersByTime(400);

      expect(component.actionError()).toBe('');
      expect(component.dialogueReleaseToken()).toBe(before + 1);
      expect(component.busy()).toBe(false);
    });
  });

  describe('salida segura con una decisión en vuelo (H-04)', () => {
    it('la persona sale en el acto (pausa local); el envío de la pausa espera la respuesta de la decisión y el servidor ve la decisión primero (V3)', () => {
      const decision$ = new Subject<SimulationAttemptState>();
      sim['chooseDecision'].mockReturnValue(decision$);
      sim['safeExit'].mockReturnValue(of(makeAttempt({ status: 'PAUSED' })));
      sim['getWorld'].mockReturnValue(of(component.world()));
      sim['getScenarioConfig'].mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));
      component.dialogue.set(decisionDialogue(11));

      component.executeDecision(11);
      vi.advanceTimersByTime(400);
      component.pauseFromOverlay();

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.pausing()).toBe(true);
      expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
      expect(sim['safeExit']).not.toHaveBeenCalled();

      // El servidor aplica la decisión y, después, ve la pausa (el token no rota: se usa el que trajo la respuesta).
      decision$.next(makeAttempt({ currentNode: { key: FREE_NODE, title: 'Etapa 2', options: [] } }));

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
      expect(sim['safeExit']).toHaveBeenLastCalledWith('attempt-1', 'Salida segura solicitada');
      expect(component.pausing()).toBe(false);
    });

    it('si la decisión falla la pausa pedida se ejecuta igualmente y la conversación no reaparece', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(500)));
      sim['safeExit'].mockReturnValue(of(makeAttempt({ status: 'PAUSED' })));
      sim['getWorld'].mockReturnValue(of(component.world()));
      sim['getScenarioConfig'].mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));
      component.dialogue.set(decisionDialogue(11));

      component.executeDecision(11);
      component.pauseFromOverlay();
      vi.advanceTimersByTime(400);
      TestBed.tick();

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.dialogue()).toBeNull();
      expect(component.pausing()).toBe(false);
    });
  });

  describe('usar una herramienta', () => {
    it('si el servidor falla libera el panel y dice la causa', () => {
      sim['useTool'].mockReturnValue(throwError(() => http(400, 'Esa herramienta no está en tu barra.')));
      component.selectedInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as unknown as MapObjectState);
      const before = component.dialogueReleaseToken();

      component.useTool('PAP');

      expect(sim['useTool']).toHaveBeenCalledWith('attempt-1', 'PAP', 'familia-crisis');
      expect(component.actionError()).toBe('Esa herramienta no está en tu barra.');
      expect(component.dialogueReleaseToken()).toBe(before + 1);
      expect(component.busy()).toBe(false);
    });

    it('sin mensaje del servidor usa el texto de respaldo', () => {
      sim['useTool'].mockReturnValue(throwError(() => http(500)));

      component.useTool('PAP');

      expect(component.actionError()).toBe('No pudimos usar la herramienta.');
    });

    it('con una petición en curso rechaza el uso sin dejar el panel bloqueado', () => {
      component.busy.set(true);
      const before = component.dialogueReleaseToken();

      component.useTool('PAP');

      expect(sim['useTool']).not.toHaveBeenCalled();
      expect(component.dialogueReleaseToken()).toBe(before + 1);
    });
  });

  /**
   * AC-3: ninguna conversación ofrece opciones de decisión que no estén en `currentNode.options`.
   * Las opciones de herramienta (sin `decisionOptionId`) se conservan: sin ellas «usar el material»
   * sería imposible en la etapa 6.
   */
  describe('AC-3: sin decisiones de otra etapa', () => {
    const choice = (key: string, decisionOptionId: number | null, requiredToolCode: string | null = null) =>
      ({ key, text: key, decisionOptionId, requiredToolCode, effect: {} });

    function objectWith(key: string, choices: unknown[]): MapObjectState {
      return {
        key, label: key, type: 'PERSON', x: 100, y: 100,
        dialogue: {
          key: `dlg-${key}`, speakerName: 'Alguien', portraitKey: null, emotion: 'neutral',
          lines: [{ order: 1, speakerName: 'Alguien', text: 'Texto.', emotion: 'neutral' }],
          choices,
        },
      } as unknown as MapObjectState;
    }

    function open(obj: MapObjectState): DialogueState | null {
      sim['openInteraction'].mockReturnValue(of({
        world: component.world(), interaction: obj, dialogue: obj.dialogue,
      }));
      component.openInteraction(obj);
      return component.dialogue();
    }

    it('quita las decisiones de otra etapa y conserva la de esta y las de herramienta', () => {
      const dialogue = open(objectWith('mixto', [
        choice('usar-material', null, 'PAP'),
        choice('esta-etapa', 11),
        choice('otra-etapa', 99),
      ]));

      expect(dialogue?.choices.map(c => c.key)).toEqual(['usar-material', 'esta-etapa']);
      expect(dialogue?.stale).toBeUndefined();
    });

    it('un objeto con decisiones solo de otra etapa pasa a ser una conversación informativa', () => {
      const dialogue = open(objectWith('marco-normativo', [choice('otra-1', 98), choice('otra-2', 99)]));

      expect(dialogue?.choices).toEqual([]);
      expect(dialogue?.stale).toBe(true);
      expect(dialogue?.lines.some(line => line.text.includes('Por ahora no hay nada que decidir'))).toBe(false);
      expect(component.viewMode()).toBe('dialogue-cinematic');
    });

    it('en ningún objeto del mundo queda una decisión que el nodo actual no contiene', () => {
      const optionIds = [11, 12, 13];
      component.attempt.set(makeAttempt({
        currentNode: { key: FREE_NODE, title: 'Etapa', options: optionIds.map(id => ({ id, text: `Opción ${id}` })) },
      }));
      const objects = [
        objectWith('a', [choice('a1', 11), choice('a2', 21), choice('a3', 31)]),
        objectWith('b', [choice('b1', 22), choice('b2', 32)]),
        objectWith('c', [choice('c1', 12), choice('c2', 13)]),
        objectWith('d', [choice('d1', null, 'RISK_METER'), choice('d2', 41)]),
        objectWith('e', []),
      ];

      for (const obj of objects) {
        const dialogue = open(obj);
        for (const c of dialogue!.choices) {
          if (c.decisionOptionId != null) expect(optionIds).toContain(c.decisionOptionId);
        }
        component.closeDialogue();
      }
    });

    it('sin la lista de opciones del nodo no filtra nada (no se pierde la decisión por falta de datos)', () => {
      component.attempt.set(makeAttempt({ currentNode: { key: FREE_NODE, title: 'Etapa' } }));

      const dialogue = open(objectWith('sin-datos', [choice('x', 77)]));

      expect(dialogue?.choices.map(c => c.key)).toEqual(['x']);
    });

    it('el aviso de lo que queda por conocer llega una sola vez, en `notice`, y sin claves internas', () => {
      component.attempt.set(makeAttempt({
        currentNode: { key: 'hospital-urgencias', title: 'Urgencias', options: [{ id: 11, text: 'Opción' }] },
      }));
      // Una persona de la sala con la que aún no se habló: queda algo por conocer.
      (component as any).gameWorld = { places: () => [{ key: 'npc:enfermera', label: 'Enfermera', kind: 'person' }], playerPosition: () => undefined, focus: () => undefined };

      const dialogue = open(objectWith('sala', [choice('uno', 11)]));

      expect(dialogue?.notice).toBe('Puedes conocer más antes de responder.');
      expect(dialogue?.notice).not.toMatch(/enfermera|PAP|npc:|tool:/);
      expect(dialogue?.choices.every(c => c.evidenceWarning === undefined)).toBe(true);
    });

    it('marca la opción de herramienta cuyo material aún no se tiene', () => {
      const dialogue = open(objectWith('familia', [choice('usar-pap', null, 'PAP'), choice('esta-etapa', 11)]));

      expect(dialogue?.choices.find(c => c.key === 'usar-pap')?.toolMissing).toBe(true);
      expect(dialogue?.choices.find(c => c.key === 'esta-etapa')?.toolMissing).toBeUndefined();
    });
  });

  describe('abrir una interacción', () => {
    const object = { key: 'familia-crisis', label: 'Familia', type: 'PERSON', x: 190, y: 420 } as unknown as MapObjectState;

    it('si el servidor falla suelta la selección, libera el panel y dice la causa', () => {
      sim['openInteraction'].mockReturnValue(throwError(() => http(400, 'Estás demasiado lejos de este objeto.')));
      const before = component.dialogueReleaseToken();

      component.openInteraction(object);

      expect(component.actionError()).toBe('Estás demasiado lejos de este objeto.');
      expect(component.selectedInteraction()).toBeNull();
      expect(component.dialogueReleaseToken()).toBe(before + 1);
      expect(component.busy()).toBe(false);
    });

    it('sin mensaje del servidor usa el texto de respaldo', () => {
      sim['openInteraction'].mockReturnValue(throwError(() => http(500)));

      component.openInteraction(object);

      expect(component.actionError()).toBe('No pudimos abrir la interacción.');
    });

    it('si falla el registro de la conversación con una persona dice cómo seguir', () => {
      sim['recordNpcInteraction'].mockReturnValue(throwError(() => http(500)));
      const npc = { key: 'enfermera-urgencias', displayName: 'Enfermera', dialogue: { lines: [{ text: 'Hola.' }] } } as unknown as NpcConfig;
      const before = component.dialogueReleaseToken();

      component.openNpcDialogue(npc);

      expect(component.actionError()).toBe(
        'No pudimos registrar la conversación. Acércate un poco más e inténtalo de nuevo.',
      );
      expect(component.dialogueReleaseToken()).toBe(before + 1);
      expect(component.busy()).toBe(false);
    });

    it('usa el mensaje del servidor cuando explica la distancia a una persona', () => {
      sim['recordNpcInteraction'].mockReturnValue(throwError(() => http(400, 'Estás demasiado lejos del NPC.')));
      const npc = { key: 'enfermera-urgencias', displayName: 'Enfermera', dialogue: { lines: [{ text: 'Hola.' }] } } as unknown as NpcConfig;

      component.openNpcDialogue(npc);

      expect(component.actionError()).toBe('Estás demasiado lejos del NPC.');
    });
  });
});
