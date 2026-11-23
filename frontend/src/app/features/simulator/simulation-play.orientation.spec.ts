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
 * Integración de la orientación en la pantalla de juego (T9.1 a T9.11, T8.4): la ficha del objetivo,
 * el contador único, la etapa nueva, las puertas, los avisos y las personas del mundo. Se ejercita la
 * instancia con las coordenadas y los nombres del seed, como el resto de specs de instancia del juego.
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

describe('SimulationPlayComponent: orientación integrada', () => {
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

  /** Estado de una partida en Urgencias, al empezar. */
  function startInUrgencias(world = makeWorld('hospital-urgencias', urgenciasObjects())): void {
    component.attempt.set(makeAttempt());
    component.world.set(world);
  }

  const tick = (ms = 0) => { vi.advanceTimersByTime(ms); TestBed.tick(); };

  describe('T9.4: puertas con una sola fuente', () => {
    const exit = () => urgenciasObjects().find(o => o.key === 'puerta-sala-escucha')!;

    beforeEach(() => {
      (component as any).doorInteractionArmed = true;
    });

    it('doorStates marca como bloqueada la puerta que pide hablar con la familia', () => {
      startInUrgencias();

      expect(component.doorStates()).toEqual({ 'puerta-sala-escucha': 'locked' });
    });

    it('doorStates abre la puerta cuando ya se habló con la familia', () => {
      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));

      expect(component.doorStates()).toEqual({ 'puerta-sala-escucha': 'open' });
    });

    it('sin intento ni mundo no hay estados de puerta', () => {
      expect(component.doorStates()).toEqual({});
      expect(component.doorMessages()).toEqual({});
    });

    it('doorMessages da al aviso de la puerta el mismo motivo vivo que la barra, y nada si está abierta', () => {
      startInUrgencias();
      expect(component.doorMessages()).toEqual({
        'puerta-sala-escucha': 'Antes de pasar, habla con Familia en crisis (en el extremo izquierdo, al frente).',
      });

      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));
      expect(component.doorMessages()).toEqual({});
    });

    it('una puerta bloqueada explica el motivo vivo, no el texto del seed, y no llama al servidor', () => {
      startInUrgencias();

      component.openInteraction(exit());

      expect(component.doorNotice()).toBe('Antes de pasar, habla con Familia en crisis (en el extremo izquierdo, al frente).');
      expect(component.doorNotice()).not.toMatch(/contenci[oó]n/i);
      expect(sim['enterRoom']).not.toHaveBeenCalled();
      expect(audio['playSfx']).toHaveBeenCalledWith('ui_cancel');
    });

    it('el motivo del aviso es el mismo que ve la barra antes de pulsar', () => {
      startInUrgencias();

      component.openInteraction(exit());

      expect(component.doorNotice()).toBe(component.doorStatusFor(exit())?.message);
    });

    it('con la familia atendida la puerta se abre: fundido y entrada a la sala', () => {
      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));
      sim['enterRoom'].mockReturnValue(of(makeWorld('hospital-sala-escucha', [])));
      sim['getScenarioConfig'].mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));

      component.openInteraction(exit());
      tick(400);

      expect(component.doorNotice()).toBe('');
      expect(sim['enterRoom']).toHaveBeenCalledWith('attempt-1', 'hospital-sala-escucha', 'puerta-sala-escucha');
    });

    it('si el servidor rechaza una puerta que el cliente creía abierta, no muestra el texto del seed', () => {
      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));
      sim['enterRoom'].mockReturnValue(throwError(() => http(400, 'Completa la contención de la familia.')));

      component.openInteraction(exit());
      tick(400);

      expect(component.doorNotice()).toBe('Antes de pasar, explora un poco más la sala.');
      expect(component.actionError()).toBe('');
      expect(component.busy()).toBe(false);
      expect(component.fadeActive()).toBe(false);
    });

    it('al cruzar suena la puerta, no el avance de diálogo', () => {
      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));
      sim['enterRoom'].mockReturnValue(EMPTY);

      component.openInteraction(exit());

      expect(audio['playSfx']).toHaveBeenCalledWith('door_open');
      expect(audio['playSfx']).not.toHaveBeenCalledWith('dialogue_advance');
    });

    it('decidir sigue sonando como el avance de diálogo', () => {
      component.attempt.set(makeAttempt('nodo-sin-evidencia'));
      component.world.set(makeWorld('hospital-urgencias', []));
      component.dialogue.set({
        key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [],
        choices: [{ key: 'o', text: 'O', decisionOptionId: 101, requiredToolCode: null, effect: {} }],
      } as unknown as DialogueState);

      component.executeDecision(101);

      expect(audio['playSfx']).toHaveBeenCalledWith('dialogue_advance');
    });

    it('un fallo de red al cruzar usa el mensaje del servidor o el de respaldo', () => {
      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));
      sim['enterRoom'].mockReturnValue(throwError(() => http(500)));

      component.openInteraction(exit());
      tick(400);

      expect(component.actionError()).toBe('No pudimos cruzar la puerta.');
    });

    it('una puerta bloqueada por la etapa dice la frase general, sin contar decisiones de un caso', () => {
      const gate = door('salida-institucional', 'Salida institucional', 838, 440, {
        targetNodeKey: 'comisaria-recepcion', requiresNodes: ['hospital-cierre-bloque'],
      });
      component.attempt.set(makeAttempt('hospital-accion-etica'));
      component.world.set(makeWorld('hospital-sala-escucha', [gate]));

      component.openInteraction(gate);

      expect(component.doorNotice()).toBe('Esta salida se abre más adelante: sigue en esta sala.');
    });
  });

  describe('T9.6: avisos', () => {
    const pickup = (): MapObjectState => urgenciasObjects().find(o => o.key === 'tool-pap')!;

    function openResult(interaction: MapObjectState, unlockedToolCode: string | null) {
      return of({
        world: makeWorld('hospital-urgencias', urgenciasObjects(true), { inventory: unlockedToolCode ? [unlockedToolCode] : [] }),
        interaction, dialogue: null, preparedDecisionOptionId: null, unlockedToolCode,
      });
    }

    it('recoger avisa «Obtuviste: …» con la etiqueta del objeto y suena item_pickup', () => {
      startInUrgencias();
      sim['openInteraction'].mockReturnValue(openResult(pickup(), 'PAP'));

      component.openInteraction(pickup());

      expect(component.softNotice()).toBe('Obtuviste: Kit PAP. Ya está en tu barra de herramientas.');
      expect(audio['playSfx']).toHaveBeenCalledWith('item_pickup');
    });

    it('el aviso se apaga solo a los 4,2 s', () => {
      startInUrgencias();
      sim['openInteraction'].mockReturnValue(openResult(pickup(), 'PAP'));
      component.openInteraction(pickup());

      vi.advanceTimersByTime(4100);
      expect(component.softNotice()).not.toBe('');
      vi.advanceTimersByTime(200);

      expect(component.softNotice()).toBe('');
    });

    it('revisar un objeto sin herramienta no avisa ni suena a recogida', () => {
      startInUrgencias();
      const zona = urgenciasObjects().find(o => o.key === 'zona-restringida')!;
      sim['openInteraction'].mockReturnValue(openResult(zona, null));

      component.openInteraction(zona);

      expect(component.softNotice()).toBe('');
      expect(audio['playSfx']).not.toHaveBeenCalledWith('item_pickup');
    });
  });

  describe('T9.3 y T9.5: barra contextual y personas', () => {
    const NURSE: NpcConfig = {
      key: 'enfermera-urgencias', npcType: 'colleague', displayName: 'Enfermera de urgencias', portrait: 'x', x: 560, y: 330,
      frameIndex: 0, dialogue: { lines: [{ text: 'Hola.' }] },
    } as unknown as NpcConfig;
    /** Lo que emite el mundo para una persona del escenario (clave `npc:`). */
    const nurseMarker = (): MapObjectState => obj('npc:enfermera-urgencias', 'Enfermera de urgencias', 'PERSON', 560, 330);
    const lockedDoor = () => urgenciasObjects().find(o => o.key === 'puerta-sala-escucha')!;

    function withScenario(): void {
      startInUrgencias();
      component.scenarioConfig.set({
        scenarioKey: 'hospital-urgencias', startRoomKey: 'hospital-urgencias',
        rooms: [{ key: 'hospital-urgencias', npcs: [NURSE] }],
      } as never);
    }

    it('una persona cercana se ofrece como «Hablar con …» con el nombre accesible «Interactuar: …»', () => {
      withScenario();
      component.nearbyInteraction.set(nurseMarker());

      const action = component.contextAction();

      expect(action?.verb.text).toBe('Hablar con Enfermera de urgencias');
      expect(action?.ariaLabel).toBe('Interactuar: Hablar con Enfermera de urgencias');
      expect(action?.ariaLabel).not.toMatch(/atajo/i);
    });

    it('una herramienta se ofrece como «Recoger …» y un objeto como «Revisar …»', () => {
      startInUrgencias();
      component.nearbyInteraction.set(urgenciasObjects().find(o => o.key === 'tool-pap')!);
      expect(component.contextAction()?.verb.text).toBe('Recoger Kit PAP');

      component.nearbyInteraction.set(urgenciasObjects().find(o => o.key === 'zona-restringida')!);
      expect(component.contextAction()?.verb.text).toBe('Revisar Acceso a quirófano');
    });

    it('el botón no usa la descripción sembrada del objeto como texto: queda solo en el title', () => {
      startInUrgencias();
      const tool = { ...urgenciasObjects().find(o => o.key === 'tool-pap')!, interactionPrompt: 'Aplicar PAP', interactionText: 'Material de primeros auxilios.' };
      component.nearbyInteraction.set(tool);

      const action = component.contextAction();

      expect(action?.verb.text).toBe('Recoger Kit PAP');
      expect(action?.ariaLabel).not.toContain('Aplicar PAP');
    });

    it('una puerta bloqueada muestra candado, el motivo vivo y lo dice en su nombre accesible', () => {
      startInUrgencias();
      component.nearbyInteraction.set(lockedDoor());

      const action = component.contextAction();

      expect(action?.verb.locked).toBe(true);
      expect(action?.verb.text).toBe('Pasar a Sala de escucha familiar');
      expect(action?.verb.reason).toBe('Antes de pasar, habla con Familia en crisis (en el extremo izquierdo, al frente).');
      expect(action?.ariaLabel).toBe(
        'Interactuar: Pasar a Sala de escucha familiar, bloqueada: Antes de pasar, habla con Familia en crisis (en el extremo izquierdo, al frente).');
      expect(action?.title).toContain(action?.verb.reason ?? '');
    });

    it('con el motivo cumplido la puerta ya no marca candado', () => {
      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));
      component.nearbyInteraction.set(lockedDoor());

      const action = component.contextAction();

      expect(action?.verb.locked).toBe(false);
      expect(action?.ariaLabel).toBe('Interactuar: Pasar a Sala de escucha familiar');
    });

    it('el botón secundario solo existe junto a un principal y dice «Pasar a …» sin candado inventado', () => {
      startInUrgencias();
      component.nearbyAlso.set(lockedDoor());
      expect(component.contextAlso()).toBeNull();

      component.nearbyInteraction.set(urgenciasObjects().find(o => o.key === 'familia-crisis')!);

      expect(component.contextAlso()?.verb.text).toBe('Pasar a Sala de escucha familiar');
      expect(component.contextAction()?.verb.text).toBe('Hablar con Familia en crisis');
    });

    it('con una petición en curso o un diálogo abierto la barra vuelve a «Ahora: …»', () => {
      startInUrgencias();
      component.nearbyInteraction.set(urgenciasObjects().find(o => o.key === 'familia-crisis')!);
      expect(component.contextAction()).not.toBeNull();

      component.busy.set(true);
      expect(component.contextAction()).toBeNull();
      component.busy.set(false);
      component.dialogue.set({ key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: [] } as unknown as DialogueState);
      expect(component.contextAction()).toBeNull();
    });

    it('URGENTE: pulsar el botón junto a una persona abre su diálogo y no pide `npc:…` al servidor', () => {
      withScenario();

      component.openInteraction(nurseMarker());

      expect(sim['openInteraction']).not.toHaveBeenCalled();
      expect(sim['recordNpcInteraction']).toHaveBeenCalledWith('attempt-1', 'enfermera-urgencias');
    });

    it('URGENTE: la tecla E junto a una persona abre su diálogo (una sola petición, aunque la tecla se repita)', () => {
      withScenario();
      component.nearbyInteraction.set(nurseMarker());
      const press = (repeat: boolean) => {
        const event = new KeyboardEvent('keydown', { key: 'e', repeat, cancelable: true });
        component.handleGlobalInteraction(event);
        return event;
      };

      const first = press(false);
      press(true);
      press(true);

      expect(first.defaultPrevented).toBe(true);
      expect(sim['recordNpcInteraction']).toHaveBeenCalledTimes(1);
      expect(sim['openInteraction']).not.toHaveBeenCalled();
    });

    it('la persona se muestra al responder el servidor, con su conversación', () => {
      withScenario();
      sim['recordNpcInteraction'].mockReturnValue(of(makeWorld('hospital-urgencias', urgenciasObjects(), { flags: { viewedNpcKeys: ['enfermera-urgencias'] } })));

      component.openInteraction(nurseMarker());

      expect(component.dialogue()?.speakerName).toBe('Enfermera de urgencias');
      expect(component.busy()).toBe(false);
    });

    it('una persona que el escenario no conoce no hace ninguna petición', () => {
      startInUrgencias();

      component.openInteraction(nurseMarker());

      expect(sim['recordNpcInteraction']).not.toHaveBeenCalled();
      expect(sim['openInteraction']).not.toHaveBeenCalled();
    });

    it('E sin nada cerca: el mundo avisa y la barra dice, 2,5 s y sin sonido, que no hay nada al alcance', () => {
      startInUrgencias();

      component.showNothingNearby();

      expect(component.nothingNearbyNote()).toBe('No hay nada a tu alcance. Acércate a una persona o un objeto.');
      expect(audio['playSfx']).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2400);
      expect(component.nothingNearbyNote()).toBe('No hay nada a tu alcance. Acércate a una persona o un objeto.');
      vi.advanceTimersByTime(200);
      expect(component.nothingNearbyNote()).toBe('');
    });

    it('en reposo la barra no trae línea «Ahora:» ni leyenda de teclas: solo la nota mientras dure', () => {
      const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');
      expect(source).not.toContain('nowLine');
      expect(source).not.toContain('context-bar__hint');
      // Bloque U1 (variante B): la nota de reposo es una placa (u-placa).
      expect(source).toMatch(/<div class="context-bar__idle">\s*@if \(nothingNearbyNote\(\); as note\) \{\s*<p class="context-bar__now u-placa">\{\{ note \}\}<\/p>/);
    });
  });

  describe('T9.9: atenuados hacia el mundo', () => {
    it('los objetos de decisión de otras etapas se atenúan; el de esta etapa no', () => {
      const choice = (id: number) => ({ key: `o${id}`, text: 'x', decisionOptionId: id, requiredToolCode: null, effect: {} });
      const withChoices = (key: string, ids: number[]) => obj(key, key, 'OBJECT', 100, 100, {
        dialogue: { key: `dlg-${key}`, speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: ids.map(choice) },
      });
      component.attempt.set(makeAttempt('hospital-sala-escucha', { currentNode: { key: 'hospital-sala-escucha', title: 't', narrative: '', terminal: false, options: [{ id: 201, text: 'a' }] } }));
      component.world.set(makeWorld('hospital-sala-escucha', [withChoices('familia-duelo', [101]), withChoices('marco-normativo-hospital', [201])]));

      expect([...component.dimmedKeys()]).toEqual(['familia-duelo']);
    });
  });

  describe('T9.8: ayuda', () => {
    /** Partida ya en marcha: pasó el aviso de contenido, la introducción y el contexto. */
    function playing(): void {
      component.worldStarted.set(true);
      component.loading.set(false);
      startInUrgencias();
    }
    const esc = () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      component.handleGlobalInteraction(event);
      return event;
    };

    it('la tarjeta de primera vez aparece cuando ya se puede jugar', () => {
      playing();

      expect(component.showHelpCard()).toBe(true);
    });

    it.each([
      ['el aviso de contenido (ETH-01)', () => component.showContentWarning.set(true)],
      ['la introducción', () => component.showCaseIntro.set(true)],
      ['el aviso de reanudar', () => component.showResumePrompt.set(true)],
      ['un diálogo abierto', () => component.dialogue.set({ key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: [] } as unknown as DialogueState)],
      ['la bitácora abierta', () => component.journalOpen.set(true)],
      ['la pantalla de ayuda abierta', () => component.helpOpen.set(true)],
      ['el mundo aún sin cargar', () => component.loading.set(true)],
      ['un intento en pausa', () => component.attempt.set(makeAttempt('hospital-urgencias', { status: 'PAUSED' }))],
    ])('no aparece con %s', (_name, hide) => {
      playing();
      hide();

      expect(component.showHelpCard()).toBe(false);
    });

    it('«Entendido» la marca como vista en el navegador (sin identificadores ni fechas) y no vuelve', () => {
      playing();

      component.markHelpCardSeen();

      expect(component.showHelpCard()).toBe(false);
      expect(JSON.parse(localStorage.getItem('siep.ayuda.v1') ?? 'null')).toEqual({ v: 1, vistas: ['primero'] });
    });

    it('un intento nuevo en el mismo navegador no la repite', () => {
      localStorage.setItem('siep.ayuda.v1', JSON.stringify({ v: 1, vistas: ['primero'] }));
      const again = TestBed.runInInjectionContext(() => new SimulationPlayComponent());

      expect(again.helpCardSeen()).toBe(true);
    });

    it('«Más ayuda» (y el botón «?») abren la pantalla y dan la tarjeta por vista', () => {
      playing();

      component.openHelp();

      expect(component.helpOpen()).toBe(true);
      expect(component.helpCardSeen()).toBe(true);
    });

    it('«Ver la ayuda otra vez» borra la marca y la tarjeta vuelve en esta misma sesión', () => {
      playing();
      component.markHelpCardSeen();

      component.resetHelpCard();

      expect(component.showHelpCard()).toBe(true);
      expect(localStorage.getItem('siep.ayuda.v1')).toBeNull();
    });

    it('si un diálogo o la bitácora tapan la tarjeta ya vista, no reaparece al cerrarlos', () => {
      playing();
      tick();
      expect(component.showHelpCard()).toBe(true);

      component.journalOpen.set(true);
      tick();
      component.journalOpen.set(false);
      tick();

      expect(component.helpCardSeen()).toBe(true);
      expect(component.showHelpCard()).toBe(false);
    });

    it('Esc cierra primero la ayuda y no pausa; el siguiente Esc sí pausa', () => {
      playing();
      component.helpOpen.set(true);

      const first = esc();
      expect(first.defaultPrevented).toBe(true);
      expect(component.helpOpen()).toBe(false);
      expect(sim['safeExit']).not.toHaveBeenCalled();

      esc();
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('con la tarjeta visible (no modal) Esc pausa directamente: la tarjeta no consume Esc', () => {
      playing();

      esc();

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('con la pantalla de ayuda abierta E y J no actúan sobre el mundo de debajo, y el personaje no camina', () => {
      playing();
      component.nearbyInteraction.set(urgenciasObjects().find(o => o.key === 'tool-pap')!);
      component.helpOpen.set(true);

      component.handleGlobalInteraction(new KeyboardEvent('keydown', { key: 'e', cancelable: true }));
      component.handleGlobalInteraction(new KeyboardEvent('keydown', { key: 'j', cancelable: true }));

      expect(sim['openInteraction']).not.toHaveBeenCalled();
      expect(component.journalOpen()).toBe(false);
      expect(component.worldMotionPaused()).toBe(true);
    });

    it('pausar con la ayuda abierta la cierra', () => {
      playing();
      component.helpOpen.set(true);
      sim['safeExit'].mockReturnValue(of(makeAttempt('hospital-urgencias', { status: 'PAUSED' })));

      component.pauseFromOverlay();
      tick();

      expect(component.helpOpen()).toBe(false);
    });
  });

  describe('T9.11: supervisión sin números y herramienta sin cifras', () => {
    /** La respuesta de decidir (C2): el estado del intento, la consecuencia narrativa y, si la regla lo concede, el reintento. */
    function decide(retry: unknown = null, attemptOverrides: Record<string, unknown> = {}): DialogueState | null {
      component.attempt.set(makeAttempt('nodo-sin-evidencia'));
      component.world.set(makeWorld('hospital-urgencias', []));
      sim['chooseDecision'].mockReturnValue(of({
        ...makeAttempt('nodo-sin-evidencia', attemptOverrides),
        consequence: retry ? null : { text: 'La estudiante asiente y pregunta por su familia.', source: 'OPTION' },
        retry,
      }));
      sim['getWorld'].mockReturnValue(of(makeWorld('hospital-urgencias', [])));
      sim['getScenarioConfig'].mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));
      component.dialogue.set({
        key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [],
        choices: [{ key: 'o', text: 'O', decisionOptionId: 101, requiredToolCode: null, effect: {} }],
      } as unknown as DialogueState);
      component.executeDecision(101);
      tick(340); tick(100); tick(400);
      return component.dialogue();
    }

    it('la consecuencia se lee con el aviso de que quedó registrada en el seguimiento, sin puntaje ni cifras', () => {
      const dialogue = decide();
      const lines = dialogue?.lines.map(line => line.text) ?? [];

      expect(dialogue?.speakerName).toBe('Consecuencia');
      expect(lines).toContain('La estudiante asiente y pregunta por su familia.');
      expect(lines).toContain('Tu decisión quedó registrada en tu seguimiento formativo.');
      expect(lines.join(' ')).not.toMatch(/Puntaje|Confianza|Riesgo|Estrés|\d/);
    });

    it('con una primera respuesta que no se aplica muestra el texto del reintento, no un mensaje evaluativo', () => {
      const dialogue = decide({ allowed: true, message: 'Decisión con riesgo: revisa.' });
      const lines = dialogue?.lines.map(line => line.text) ?? [];

      expect(lines.join(' ')).toContain('El caso sigue en el mismo punto');
      expect(lines.join(' ')).not.toContain('Decisión con riesgo');
      expect(lines).not.toContain('Tu decisión quedó registrada en tu seguimiento formativo.');
    });

    function useTool(): DialogueState | null {
      startInUrgencias();
      component.selectedInteraction.set(urgenciasObjects().find(o => o.key === 'familia-crisis')!);
      sim['useTool'].mockReturnValue(of({
        world: makeWorld('hospital-urgencias', urgenciasObjects(), { usedToolKeys: ['PAP'] }),
        toolCode: 'PAP', targetKey: 'familia-crisis', pertinent: true, feedbackMessage: 'La familia escucha con más calma.',
      }));
      component.useTool('PAP');
      return component.dialogue();
    }

    it('la herramienta dice solo su mensaje: sin línea de estrés ni pulso, y no toca el intento', () => {
      const lines = useTool()?.lines.map(line => line.text) ?? [];

      expect(lines).toEqual(['La familia escucha con más calma.']);
      expect(component.attempt()).toEqual(makeAttempt());
      expect((component as any).stressPulse).toBeUndefined();
    });
  });

  describe('anuncio del cambio de la persona (VD-23)', () => {
    const persona = (bond: string, activation: string) => ({ bond, activation, label: 'x' });
    let announced: Mock;

    beforeEach(() => {
      announced = vi.fn();
      (component as any).announce = announced;
    });

    it('la primera carga del intento no anuncia nada', () => {
      (component as any).trackPersona(makeAttempt('a', { persona: persona('GUARDED', 'TENSE') }));
      expect(announced).not.toHaveBeenCalled();
    });

    it('si la activación baja se anuncia UNA vez, con el texto del borrador, y repetir el mismo estado no vuelve a anunciar', () => {
      const t = (component as any).trackPersona.bind(component);
      t(makeAttempt('a', { persona: persona('GUARDED', 'TENSE') }));
      t(makeAttempt('a', { persona: persona('GUARDED', 'CALM') }));
      t(makeAttempt('a', { persona: persona('GUARDED', 'CALM') }));

      expect(announced).toHaveBeenCalledTimes(1);
      expect(announced).toHaveBeenCalledWith('La persona se muestra más tranquila.');
    });

    it('si cambian el vínculo y la activación se dicen en una sola frase', () => {
      const t = (component as any).trackPersona.bind(component);
      t(makeAttempt('a', { persona: persona('GUARDED', 'TENSE') }));
      t(makeAttempt('a', { persona: persona('OPEN', 'CALM') }));

      expect(announced).toHaveBeenCalledTimes(1);
      expect(announced).toHaveBeenCalledWith('La persona se muestra más tranquila y se abre un poco más.');
    });

    it('un intento distinto solo recuerda la persona: no anuncia', () => {
      const t = (component as any).trackPersona.bind(component);
      t(makeAttempt('a', { persona: persona('GUARDED', 'TENSE') }));
      t(makeAttempt('a', { attemptId: 'attempt-2', persona: persona('OPEN', 'CALM') }));

      expect(announced).not.toHaveBeenCalled();
    });

    it('al decidir, si la respuesta trae otra persona, se anuncia una sola vez', () => {
      component.attempt.set(makeAttempt('nodo-sin-evidencia'));
      (component as any).trackPersona(component.attempt());
      component.world.set(makeWorld('hospital-urgencias', []));
      sim['chooseDecision'].mockReturnValue(of({
        ...makeAttempt('nodo-sin-evidencia', { persona: persona('GUARDED', 'CALM') }),
        consequence: { text: 'La persona respira.', source: 'OPTION' },
        retry: null,
      }));
      sim['getWorld'].mockReturnValue(of(makeWorld('hospital-urgencias', [])));
      sim['getScenarioConfig'].mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));
      component.executeDecision(101);
      tick(340); tick(100); tick(400);

      const calls = announced.mock.calls.filter(args => /^La persona /.test(String(args[0])));
      expect(calls).toEqual([['La persona se muestra más tranquila.']]);
    });
  });

  describe('T10: modo compacto', () => {
    const COMPACT = '(max-height: 520px), (pointer: coarse) and (orientation: landscape)';
    let original: typeof window.matchMedia | undefined;
    let listeners: Array<{ query: string; handler: (event: { matches: boolean }) => void }>;

    function mockMedia(matching: string[]): void {
      listeners = [];
      window.matchMedia = ((query: string) => ({
        matches: matching.includes(query),
        media: query,
        addEventListener: (_type: string, handler: (event: { matches: boolean }) => void) => listeners.push({ query, handler }),
        removeEventListener: (_type: string, handler: (event: { matches: boolean }) => void) => {
          listeners = listeners.filter(entry => entry.handler !== handler);
        },
      })) as unknown as typeof window.matchMedia;
    }

    beforeEach(() => { original = window.matchMedia; });
    afterEach(() => { window.matchMedia = original as typeof window.matchMedia; });

    it('una pantalla baja o táctil horizontal arranca en compacto y con puntero grueso', () => {
      mockMedia([COMPACT, '(pointer: coarse)']);
      const compact = TestBed.runInInjectionContext(() => new SimulationPlayComponent());

      expect(compact.compactMode()).toBe(true);
      expect(compact.coarsePointer()).toBe(true);
      expect(compact.helpModality()).toBe('touch');
    });

    it('un móvil vertical no es compacto, pero la ficha del objetivo también arranca plegada', () => {
      mockMedia(['(max-width: 760px)', '(pointer: coarse)']);
      const phone = TestBed.runInInjectionContext(() => new SimulationPlayComponent());

      expect(phone.compactMode()).toBe(false);
      expect(phone.cardFolded()).toBe(true);
    });

    it('un portátil no es compacto y la ayuda habla de teclado', () => {
      mockMedia([]);
      const laptop = TestBed.runInInjectionContext(() => new SimulationPlayComponent());

      expect(laptop.compactMode()).toBe(false);
      expect(laptop.cardFolded()).toBe(false);
      expect(laptop.helpModality()).toBe('keyboard');
    });

    it('girar o redimensionar el dispositivo cambia el modo sin recargar, y se deja de escuchar al salir', () => {
      mockMedia([]);
      const device = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
      device.ngOnInit();
      expect(listeners.map(entry => entry.query)).toEqual([COMPACT, '(pointer: coarse)', '(max-width: 760px)']);

      listeners.find(entry => entry.query === COMPACT)?.handler({ matches: true });
      expect(device.compactMode()).toBe(true);

      device.ngOnDestroy();
      expect(listeners).toEqual([]);
    });

    it('con la bitácora, un diálogo o la ayuda a la vista el pie no cambia: la barra muestra siempre una sola cosa', () => {
      mockMedia([COMPACT]);
      const compact = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
      compact.attempt.set(makeAttempt());
      compact.world.set(makeWorld('hospital-urgencias', urgenciasObjects()));

      expect(compact.contextAction()).toBeNull();
      expect(compact.nothingNearbyNote()).toBe('');
      compact.nearbyInteraction.set(urgenciasObjects().find(o => o.key === 'tool-pap')!);
      expect(compact.contextAction()?.verb.text).toBe('Recoger Kit PAP');
      expect(compact.contextAlso()).toBeNull();
    });
  });

  describe('T9.2: contador único y etapa nueva', () => {
    it('el HUD recibe el título de la escena, sin contador de decisiones', () => {
      component.attempt.set(makeAttempt('hospital-accion-etica'));

      expect(component.stageLabel()).toBe('Título del nodo');
    });

    it('sin intento no hay rótulo', () => {
      expect(component.stageLabel()).toBeNull();
    });

    it('la «Trazabilidad» de la bitácora recibe los títulos completos de las etapas visitadas', () => {
      // La API ya no recorta a 14 caracteres: estos dos nodos eran idénticos («Consultorio: …»).
      component.progressMap.set({
        currentNodeKey: 'comisaria-accion-final',
        visitedNodeKeys: ['comisaria-consultorio', 'comisaria-accion-final'],
        nodes: [
          { key: 'hospital-urgencias', label: 'Urgencias: crisis y contención' },
          { key: 'comisaria-consultorio', label: 'Consultorio: protección y marco' },
          { key: 'comisaria-accion-final', label: 'Consultorio: acción técnica y ética' },
        ],
      } as never);

      expect(component.visitedStageLabels()).toEqual([
        'Consultorio: protección y marco',
        'Consultorio: acción técnica y ética',
      ]);
    });

    /** Decide en `previousNode` (mundo `fromMap`) y deja que llegue el mundo `toMap` de la etapa nueva. */
    function decideTo(nextNodeKey: string, toMap: string, previousNode: string, fromMap = toMap): void {
      component.attempt.set(makeAttempt(previousNode));
      component.world.set(makeWorld(fromMap, []));
      sim['chooseDecision'].mockReturnValue(of(makeAttempt(nextNodeKey)));
      sim['getWorld'].mockReturnValue(of(makeWorld(toMap, [])));
      sim['getScenarioConfig'].mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));
      component.dialogue.set({
        key: 'd', speakerName: 'Alguien', portraitKey: null, emotion: 'neutral',
        lines: [{ order: 1, speakerName: 'Alguien', text: 'Texto.', emotion: 'neutral' }],
        choices: [{ key: 'o', text: 'Opción', decisionOptionId: 101, requiredToolCode: null, effect: {} }],
      } as unknown as DialogueState);
      component.executeDecision(101);
      // V7: la consecuencia se cierra (leída) y, si la sala cambia, se pulsa «Ir a <lugar>».
      if (component.dialogue()?.speakerName === 'Consecuencia') component.closeDialogue();
      if (component.cambioDeLugar()) component.irAlLugar();
      tick(340); // fundido
      tick(100); // el mundo nuevo ya se ve
    }

    it('al pasar a otra etapa con el mismo mapa el banner dice el título de la escena nueva, sin «Nueva etapa» ni contador', () => {
      decideTo('hospital-accion-etica', 'hospital-sala-escucha', 'hospital-sala-escucha');
      tick();

      expect(component.roomBanner()).toBe('Título del nodo');
    });

    it('con la sala distinta el banner de la escena manda sobre el nombre de la sala', () => {
      decideTo('hospital-sala-escucha', 'hospital-sala-escucha', 'hospital-urgencias', 'hospital-urgencias');

      expect(component.roomBanner()).toBe('Título del nodo');
    });

    it('si la decisión no cambia de escena no hay banner', () => {
      decideTo('hospital-urgencias', 'hospital-urgencias', 'hospital-urgencias');
      tick();

      expect(component.roomBanner()).toBe('');
    });

    it('al recargar o reanudar con el mismo intento no reaparece el banner de etapa', () => {
      sessionStorage.setItem(`siep_case_consent_${CASE_VERSION_ID}_attempt-1`, 'given');
      sim['getWorld'].mockReturnValue(of(makeWorld('hospital-sala-escucha', [])));
      sim['getScenarioConfig'].mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));

      (component as any).bootstrapAttempt(makeAttempt('hospital-accion-etica'));
      tick(500);

      expect(component.roomBanner()).toBe('');
    });
  });
});
