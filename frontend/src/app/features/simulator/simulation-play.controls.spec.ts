import { readFileSync } from 'fs';
import { join } from 'path';
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
import { EMPTY, of, throwError } from 'rxjs';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
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
 * P8: lo que el juego explica y no bloquea: la tarjeta de controles, «Ir a…» a la vista, «Texto instantáneo», el aviso de
 * «Da unos pasos…» y el acuse «Decisión registrada». Misma instancia y mismas coordenadas del seed que la orientación.
 */

const CASE_VERSION_ID = 7;

function obj(
  key: string, label: string, type: MapObjectState['type'], x: number, y: number, extra: Partial<MapObjectState> = {},
): MapObjectState {
  return {
    key, label, type, x, y, width: 40, height: 40, color: '#fff', icon: '', shortCode: '', collision: false,
    interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null, ...extra,
  };
}

const door = (key: string, label: string, x: number, y: number, metadata?: Record<string, unknown>) =>
  obj(key, label, 'EXIT', x, y, { metadata });

function urgenciasObjects(collected = false): MapObjectState[] {
  return [
    obj('familia-crisis', 'Familia en crisis', 'PERSON', 190, 420),
    obj('zona-restringida', 'Acceso a quirófano', 'OBJECT', 660, 268),
    ...(collected ? [] : [obj('tool-pap', 'Kit PAP', 'TOOL', 318, 428, { toolCode: 'PAP' })]),
    door('puerta-sala-escucha', 'Sala de escucha familiar', 838, 440, {
      targetNodeKey: 'hospital-sala-escucha', requiresInspected: ['familia-crisis'], lockedMessage: 'Completa la contención de la familia.',
    }),
  ];
}

function makeWorld(mapKey: string, objects: MapObjectState[], extra: Record<string, unknown> = {}): SimulationWorldState {
  return {
    map: { key: mapKey, title: mapKey },
    objects,
    tools: [{ code: 'PAP', label: 'Primeros Auxilios Psicológicos', icon: 'healing', category: 'x', description: 'd', active: true }],
    inventory: [], usedToolKeys: [], inspectedObjectKeys: [], flags: {},
    ...extra,
  } as unknown as SimulationWorldState;
}

function makeAttempt(nodeKey = 'hospital-urgencias', overrides: Record<string, unknown> = {}): SimulationAttemptState {
  return {
    attemptId: 'attempt-1',
    caseVersionId: CASE_VERSION_ID,
    caseTitle: 'Caso demo',
    status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: {
      id: 1, key: nodeKey, title: 'Título del nodo', narrative: 'Primera frase. Segunda frase.', terminal: false,
      options: [{ id: 101, text: 'Opción' }],
    },
    completionReport: null,
    ...overrides,
  } as unknown as SimulationAttemptState;
}

const http = (status: number, message?: string) => new HttpErrorResponse({ status, error: message ? { message } : null });

describe('SimulationPlayComponent: controles, «Ir a…» y avisos sin bloqueo (P8)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;
  let audio: Record<string, Mock>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    sessionStorage.clear();
    localStorage.clear();
    sim = {
      getActiveAttempt: vi.fn(() => of(null)),
      startAttempt: vi.fn(() => of(makeAttempt())),
      getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => EMPTY),
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
      toggleMusicMuted: vi.fn(() => false), playResolution: vi.fn(), silenciarIntro: vi.fn(),
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

  /** Estado de una partida en Urgencias, al empezar. */
  function startInUrgencias(world = makeWorld('hospital-urgencias', urgenciasObjects())): void {
    component.attempt.set(makeAttempt());
    component.world.set(world);
  }

  const tick = (ms = 0) => { vi.advanceTimersByTime(ms); TestBed.tick(); };

  /** Partida ya en marcha: pasó el aviso de contenido, la introducción y el contexto. */
  function playing(): void {
    component.worldStarted.set(true);
    component.loading.set(false);
    startInUrgencias();
  }
  const key = (k: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key: k, cancelable: true, ...init });
    component.handleGlobalInteraction(event);
    return event;
  };

  describe('P8: tarjeta de controles', () => {
    it('al entrar por primera vez está a la vista, es modal para el mundo y no camina nadie', () => {
      playing();

      expect(component.controlsVisible()).toBe(true);
      expect(component.worldMotionPaused()).toBe(true);
    });

    it.each([true, false])('encadena cinemática, tutor y controles con nota de capítulo: %s', llevaNota => {
      playing();
      const world = component.world()!;
      component.world.set({ ...world, map: { ...world.map, ambient: {
        cinematica: { id: 'inicio', planos: [{ escena: 'negro' }] },
        tutor: { nombre: 'Docente', lineas: ['Lee el objetivo.'] },
        ...(llevaNota ? { transitionText: 'Capítulo 1 · Una llegada.' } : {}),
      } } });
      const mosaico = () => [!!component.cinematica(), !!component.tutor(), !!component.transitionNote(), component.controlsVisible()];
      (component as unknown as { empezarEntradaDelCaso(): boolean }).empezarEntradaDelCaso();
      expect(mosaico()).toEqual([true, false, false, false]);

      component.alTerminarCinematica();
      expect(mosaico()).toEqual([false, true, false, false]);
      component.openControls();
      expect(mosaico()).toEqual([false, true, false, false]);

      component.alCerrarTutor();
      expect(mosaico()).toEqual([false, false, llevaNota, !llevaNota]);
      if (llevaNota) {
        vi.advanceTimersByTime(4199);
        expect(component.controlsVisible()).toBe(false);
        vi.advanceTimersByTime(1);
      }
      expect(mosaico()).toEqual([false, false, false, true]);
    });

    it('con la tarjeta abierta E y J no actúan sobre el mundo de debajo', () => {
      playing();
      component.nearbyInteraction.set(urgenciasObjects().find(o => o.key === 'tool-pap')!);

      key('e');
      key('j');

      expect(sim['openInteraction']).not.toHaveBeenCalled();
      expect(component.journalOpen()).toBe(false);
    });

    it('«Entendido» la da por vista: no vuelve, y queda en la memoria de ayuda del navegador', () => {
      playing();

      component.closeControls();

      expect(component.controlsVisible()).toBe(false);
      expect(JSON.parse(localStorage.getItem('siep.ayuda.v1') ?? 'null')).toEqual({ v: 1, vistas: ['primero'] });
    });

    it('«Controles» de la cabecera la abre de nuevo y deja la de primera vez por vista', () => {
      playing();
      component.markHelpCardSeen();
      expect(component.controlsVisible()).toBe(false);

      component.openControls();

      expect(component.controlsVisible()).toBe(true);
      expect(component.controlsOpen()).toBe(true);
      component.closeControls();
      expect(component.controlsVisible()).toBe(false);
    });

    it('la tecla «?» la abre y, con ella abierta, la cierra', () => {
      playing();
      component.markHelpCardSeen();

      const abre = key('?');
      expect(abre.defaultPrevented).toBe(true);
      expect(component.controlsVisible()).toBe(true);

      key('?');
      expect(component.controlsVisible()).toBe(false);
    });

    it('con los atajos de una tecla apagados «?» no hace nada (WCAG 2.1.4); el botón «Controles» sigue ahí', () => {
      playing();
      component.markHelpCardSeen();
      component.shortcuts.set(false);

      key('?');

      expect(component.controlsVisible()).toBe(false);
      component.openControls();
      expect(component.controlsVisible()).toBe(true);
    });

    it('«Más ayuda» pasa de los controles a la pantalla «Cómo se juega»', () => {
      playing();

      component.openHelpFromControls();

      expect(component.controlsVisible()).toBe(false);
      expect(component.helpOpen()).toBe(true);
    });

    it('Esc con la tarjeta pedida la cierra sin pausar', () => {
      playing();
      component.markHelpCardSeen();
      component.openControls();

      key('Escape');

      expect(component.controlsVisible()).toBe(false);
      expect(sim['safeExit']).not.toHaveBeenCalled();
    });
  });

  describe('P8: «Ir a…» a la vista', () => {
    it('la tecla I abre la lista de lugares con el mundo libre', () => {
      playing();
      component.markHelpCardSeen();

      const event = key('i');

      expect(event.defaultPrevented).toBe(true);
      expect(component.placesOpen()).toBe(true);
    });

    it('no abre la lista con la tarjeta de controles encima, con Ctrl, ni con los atajos apagados', () => {
      playing();
      key('i');
      expect(component.placesOpen()).toBe(false);

      component.markHelpCardSeen();
      key('i', { ctrlKey: true });
      expect(component.placesOpen()).toBe(false);

      component.shortcuts.set(false);
      key('i');
      expect(component.placesOpen()).toBe(false);
    });

    it('la cabecera del juego enlaza el botón «Controles» y la fila «Texto instantáneo»', () => {
      const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');
      expect(source).toContain('(openControls)="openControls()"');
      expect(source).toContain('[instantText]="instantText.enabled()" (toggleInstantText)="toggleInstantText()"');
    });
  });

  describe('P8: «Texto instantáneo»', () => {
    it('se alterna desde Ajustes, se recuerda y se anuncia', () => {
      const announce = vi.spyOn(TestBed.inject(LiveRegionAnnouncer), 'announce');
      expect(component.instantText.enabled()).toBe(false);

      component.toggleInstantText();

      expect(component.instantText.enabled()).toBe(true);
      expect(localStorage.getItem('siep.texto-instantaneo.v1')).toBe('on');
      expect(announce).toHaveBeenCalledWith('Texto instantáneo activado.', 'polite');
    });
  });

  describe('P8: «Da unos pasos…» sin bloquear', () => {
    const exit = () => urgenciasObjects().find(o => o.key === 'puerta-sala-escucha')!;
    const abierta = () => makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] });

    it('recién cruzada, pulsar E junto a la puerta dice cuánto falta y hacia dónde, sin aviso modal ni llamada al servidor', () => {
      playing();
      startInUrgencias(abierta());
      (component as any).doorInteractionArmed = false;
      component.rememberPosition(830, 440);   // a 8 px de la puerta, a su izquierda

      component.openInteraction(exit());

      expect(component.stepsNotice()).toBe('Aléjate de la puerta en cualquier dirección posible para poder volver a cruzarla.');
      expect(component.doorNotice()).toBe('');
      expect(component.inputBlocked()).toBe(false);
      expect(sim['enterRoom']).not.toHaveBeenCalled();
      expect(audio['playSfx']).toHaveBeenCalledWith('ui_cancel');
    });

    it('el aviso sigue a quien camina y desaparece solo cuando ya se cumple la regla, con un anuncio', () => {
      startInUrgencias(abierta());
      (component as any).doorInteractionArmed = false;
      const announce = vi.spyOn(TestBed.inject(LiveRegionAnnouncer), 'announce');
      component.rememberPosition(830, 440);
      component.openInteraction(exit());
      announce.mockClear();

      component.rememberPosition(800, 440);   // a 38 px
      expect(component.stepsNotice()).toContain('cualquier dirección posible');
      expect(announce).not.toHaveBeenCalled();

      component.rememberPosition(760, 440);   // a 78 px: ya está lejos
      expect(component.stepsNotice()).toBe('');
      expect((component as any).doorInteractionArmed).toBe(true);
      expect(announce).toHaveBeenCalledWith('Ya puedes cruzar la puerta.', 'polite');
    });

    it('si ya se está lejos pero la posición aún no llegó, la puerta se rearma y se cruza (no se piden pasos de más)', () => {
      startInUrgencias(abierta());
      sim['enterRoom'].mockReturnValue(of(makeWorld('hospital-sala-escucha', [])));
      sim['getScenarioConfig'].mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));
      (component as any).doorInteractionArmed = false;
      (component as any).lastPosition = { x: 700, y: 440 };
      (component as any).lastSyncedPosition = { x: 700, y: 440 };   // sin posición pendiente de guardar antes de cruzar

      component.openInteraction(exit());
      tick(400);

      expect(component.stepsNotice()).toBe('');
      expect(sim['enterRoom']).toHaveBeenCalledWith('attempt-1', 'hospital-sala-escucha', 'puerta-sala-escucha');
    });

    it('sin saber dónde está la persona, el aviso es genérico y no inventa una cuenta', () => {
      startInUrgencias(abierta());
      (component as any).doorInteractionArmed = false;

      component.openInteraction(exit());

      expect(component.stepsNotice()).toBe('Aléjate un poco de la puerta para poder volver a cruzarla.');
    });

    it('cambiar de sala, pausar o empezar de nuevo retiran el aviso', () => {
      startInUrgencias(abierta());
      (component as any).doorInteractionArmed = false;
      component.rememberPosition(830, 440);
      component.openInteraction(exit());
      expect(component.stepsNotice()).not.toBe('');

      (component as any).applyLoadedWorld(makeWorld('hospital-sala-escucha', []));

      expect(component.stepsNotice()).toBe('');
    });

    it('la plantilla lo pinta en el carril, sin role ni modal, y lo oculta con el cuadro de diálogo encima', () => {
      const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');
      expect(source).toMatch(/@if \(stepsNotice\(\) && viewMode\(\) !== 'dialogue-cinematic'\) \{[\s\S]*?class="soft-notice steps-notice u-placa u-sombra" data-steps-notice/);
      expect(source).not.toContain("Da unos pasos dentro de la sala");
    });
  });

  describe('P8: «Decisión registrada»', () => {
    it('al llegar la respuesta del servidor sale un aviso breve y se apaga solo, sin bloquear', () => {
      startInUrgencias();
      const game = component.attempt()!;
      const updated = makeAttempt('hospital-sala-escucha', { status: 'IN_PROGRESS', reaction: null });

      (component as any).applyDecisionResult(game, updated);

      expect(component.softNotice()).toBe('Tu decisión se guardó.');
      expect(component.inputBlocked()).toBe(false);
      tick(4300);
      expect(component.softNotice()).toBe('');
    });

    it('tras confirmar muestra la opción elegida junto al aviso de guardado', () => {
      startInUrgencias();
      const game = component.attempt()!;
      const option = game.currentNode.options![0];
      (component as any).pendingDecisionRequest = { decisionOptionId: option.id, requestId: 'r' };
      (component as any).onDecisionResult(game, makeAttempt('hospital-sala-escucha', { reaction: null }));
      expect(component.softNotice()).toContain('Tu decisión se guardó.');
      expect(component.decisionSelection()).toBe(`Elegiste: “${option.text}”`);
      tick(4300);
      expect(component.decisionSelection()).toBe('');
    });

    it('confirma el texto que se mostró en la ficha elegida, aunque el nodo use otra redacción', () => {
      startInUrgencias();
      component.dialogue.set({ key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [],
        choices: [{ key: 'c', text: 'Escuchar con calma', decisionOptionId: 101, requiredToolCode: null, effect: {} }] } as DialogueState);
      sim['chooseDecision'].mockReturnValue(of(makeAttempt('hospital-sala-escucha', { reaction: null })));
      component.executeDecision(101);
      expect(component.decisionSelection()).toBe('Elegiste: “Escuchar con calma”');
    });

    it('al limpiar los avisos también descarta la elección visible anterior', () => {
      component.decisionSelection.set('Elegiste: “Anterior”');
      (component as any).resetNotices();
      expect(component.decisionSelection()).toBe('');
    });

    it('el acuse acompaña al aviso de reenvío tras volver la red', () => {
      startInUrgencias();
      const game = component.attempt()!;
      (component as any).showSoftNotice('Volvió la conexión: enviamos tu elección.');

      (component as any).applyDecisionResult(game, makeAttempt('hospital-sala-escucha', { reaction: null }));

      expect(component.softNotice()).toBe('Volvió la conexión: enviamos tu elección. Tu decisión se guardó.');
    });
    it('una segunda oportunidad no anuncia que la primera respuesta fue aplicada', () => {
      startInUrgencias();
      const game = component.attempt()!;
      const updated = makeAttempt('hospital-sala-escucha', { reaction: null, retry: { allowed: true, message: '' } });
      (component as any).applyDecisionResult(game, updated);
      expect(component.softNotice()).not.toContain('se guardó');
    });
  });
});
