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
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, NEVER, Subject, defer, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { DialogueState, MapObjectState, SimulationAttemptState, SimulationWorldState, WorldComment } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * Robustez del cliente del juego (R1): salida segura inmediata, plazos, decisión pendiente, guardado de posición y punto de
 * lectura. La pantalla solo cablea. Se ejercita la instancia con un mundo falso (sin plantilla).
 */

const COMENT_ABUELA_SIN_GESTO: WorldComment = { id: '7-0', objectKey: 'abuela', line: 'Gracias por venir.', emotion: 'triste', gesture: null };
const DIALOGO = {
  key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: [],
} as unknown as DialogueState;

function makeWorld(comments?: WorldComment[]): SimulationWorldState {
  return {
    map: { key: 'sala', title: 'Sala' },
    objects: [
      { key: 'abuela', type: 'PERSON', label: 'Abuela', metadata: {} },
      { key: 'carpeta', type: 'OBJECT', label: 'Carpeta', metadata: {} },
    ],
    tools: [], inventory: [], usedToolKeys: [], inspectedObjectKeys: [], flags: {},
    ...(comments ? { comments } : {}),
  } as unknown as SimulationWorldState;
}

function makeAttempt(): SimulationAttemptState {
  return {
    attemptId: 'attempt-1', caseVersionId: 7, caseTitle: 'Caso demo', status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { id: 1, key: 'n', title: 'Título', narrative: 'N', terminal: false, options: [{ id: 41, text: 'Opción' }] },
    completionReport: null,
  } as unknown as SimulationAttemptState;
}

interface Reacciones {
  setComments: Mock; setBlocked: Mock; setActivation: Mock; onProximity: Mock; onInspected: Mock; dispose: Mock;
}

describe('SimulationPlayComponent: robustez del cliente (R1)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;
  let mundo: Record<string, Mock>;

  const interno = () => component as unknown as Record<string, unknown> & {
    applyDecisionOptions(world: SimulationWorldState): void;
    doOpenBackendInteraction(o: MapObjectState): void;
    ensureReactions(): void;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    sessionStorage.clear();
    sim = {
      getActiveAttempt: vi.fn(() => EMPTY),
      safeExit: vi.fn(() => EMPTY),
      updateWorldState: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => EMPTY),
      getProgressMap: vi.fn(() => EMPTY),
      chooseDecision: vi.fn(() => EMPTY),
      startAttempt: vi.fn(() => EMPTY),
      openInteraction: vi.fn(() => EMPTY),
      useTool: vi.fn(() => NEVER),
      enterRoom: vi.fn(() => EMPTY),
      recordNpcInteraction: vi.fn(() => EMPTY),
      resumeAttempt: vi.fn(() => EMPTY),
      saveReflection: vi.fn(() => EMPTY),
      getAttempt: vi.fn(() => EMPTY),
    };
    const audio = {
      init: vi.fn(), dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
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
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
    component.attempt.set(makeAttempt());
    component.world.set(makeWorld());
    // El mundo falso: cada llamada que la pantalla le haga es una función vacía salvo lo que la prueba mira.
    const mirado: Record<string, Mock> = { isKeyPerson: vi.fn(() => false), peopleNear: vi.fn(() => []), playGesture: vi.fn(() => Promise.resolve()) };
    mundo = mirado;
    interno()['gameWorld'] = new Proxy(mirado, { get: (t, k: string) => (t[k] ??= vi.fn()) });
  });

  afterEach(() => {
    component?.ngOnDestroy();
    vi.useRealTimers();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('descarta el acuse tardío de otra sala', () => {
    const respuesta = new Subject<any>();
    sim['updateWorldState'].mockReturnValue(respuesta);
    interno()['lastPosition'] = { x: 10, y: 20 };
    (interno() as any).persistPosition();
    const actual = { ...makeWorld(), map: { key: 'otra', title: 'Otra' } } as SimulationWorldState;
    component.world.set(actual);
    respuesta.next({ attemptId: 'attempt-1', map: { key: 'sala' }, player: { x: 10, y: 20 } });
    expect(component.world()).toBe(actual);
  });

  it('reserva la interacción durante la sincronización', () => {
    sim['updateWorldState'].mockReturnValue(NEVER);
    interno()['lastPosition'] = { x: 10, y: 20 };
    const objeto = makeWorld().objects[1];
    (interno() as any).openBackendInteraction(objeto);
    (interno() as any).openBackendInteraction(objeto);
    expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
    expect(component.busy()).toBe(true);
  });

  it('no envía la interacción si no logra guardar la posición', () => {
    const envios = vi.fn();
    sim['updateWorldState'].mockReturnValue(defer(() => { envios(); return throwError(() => new Error('sin red')); }));
    interno()['lastPosition'] = { x: 10, y: 20 };
    (interno() as any).openBackendInteraction(makeWorld().objects[1]);
    expect(envios).toHaveBeenCalledTimes(2);
    expect(sim['openInteraction']).not.toHaveBeenCalled();
    expect(component.busy()).toBe(false);
  });

  it('una herramienta sin respuesta libera la accion y avisa', () => {
    (interno() as any).doUseTool('herramienta', null);
    vi.advanceTimersByTime(30000);
    expect(component.busy()).toBe(false);
    expect(component.actionError()).toContain('tardando');
  });

  it('una decisión sin respuesta no habilita una elección distinta', () => {
    sim['chooseDecision'].mockReturnValue(NEVER);
    const intento = makeAttempt();
    intento.currentNode.options.push({ id: 42, text: 'Otra' } as any);
    component.attempt.set(intento);
    component.executeDecision(41);
    vi.advanceTimersByTime(30000);
    component.executeDecision(42);
    expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
    expect(component.busy()).toBe(false);
    expect((interno() as any).pendingDecisionRequest).not.toBeNull();
    component.executeDecision(41);
    expect(sim['chooseDecision']).toHaveBeenCalledTimes(2);
    expect(sim['chooseDecision'].mock.calls[1][2]).toBe(sim['chooseDecision'].mock.calls[0][2]);
  });

  it('una conversación con una persona del escenario (npc-…) también encuadra a las dos personas (V6, camara-y-plano)', () => {
    component.dialogue.set({ ...DIALOGO, key: 'npc-enfermera-urgencias' } as DialogueState);
    expect(component.cameraMoment()).toEqual({ tipo: 'conversacion', clave: 'npc:enfermera-urgencias' });
    component.dialogue.set(null);
    expect(component.cameraMoment()).toEqual({ tipo: 'explorar' });
  });

  describe('salida segura inmediata (REGLA-004)', () => {
    const conPosicionPendiente = () => {
      interno()['lastPosition'] = { x: 10, y: 20 };
      sim['updateWorldState'].mockReturnValue(NEVER);
    };

    it('la pantalla de pausa sale en el acto aunque la posición pendiente aún no se guarde; la pausa se envía tras ella (V4)', () => {
      conPosicionPendiente();
      component.pauseFromOverlay();
      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.pausing()).toBe(true);
      expect(sim['updateWorldState']).toHaveBeenCalledWith('attempt-1', 10, 20, 'sala', true);
      expect(sim['safeExit']).not.toHaveBeenCalled();
    });

    it('con una petición en vuelo la pausa sale en el acto, sin esperar su plazo', () => {
      component.busy.set(true);
      component.pauseFromOverlay();
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
      expect(component.pausing()).toBe(true);
    });

    it('la respuesta tardía de una interacción en vuelo no abre una conversación sobre la pausa', () => {
      const respuesta = new Subject<any>();
      sim['openInteraction'].mockReturnValue(respuesta);
      (interno() as any).openBackendInteraction(makeWorld().objects[1]);
      component.pauseFromOverlay();
      component.attempt.set({ ...makeAttempt(), status: 'PAUSED' } as SimulationAttemptState);
      respuesta.next({ world: makeWorld(), interaction: makeWorld().objects[1], dialogue: DIALOGO });
      expect(component.dialogue()).toBeNull();
      expect(component.busy()).toBe(false);
    });

    it('si la salida no recibe respuesta a tiempo la persona sigue en pausa, no queda nada colgado y se reintenta sola (V3)', () => {
      sim['safeExit'].mockReturnValue(NEVER);
      component.pauseFromOverlay();
      vi.advanceTimersByTime(15_000);
      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.busy()).toBe(false);
      expect(component.pauseNote()).not.toBeNull();
      vi.advanceTimersByTime(2_000);
      expect(sim['safeExit']).toHaveBeenCalledTimes(2);
    });
  });

  describe('la pausa lleva consigo la posición pendiente (V4, REGLA-004)', () => {
    const ack = { attemptId: 'attempt-1', status: 'IN_PROGRESS', map: { key: 'sala' }, player: { x: 10, y: 20 } };
    const pausada = { ...makeAttempt(), status: 'PAUSED' } as SimulationAttemptState;
    const orden: string[] = [];
    const conPosicionPendiente = () => { interno()['lastPosition'] = { x: 10, y: 20 }; };
    beforeEach(() => {
      orden.length = 0;
      sim['updateWorldState'].mockImplementation(() => defer(() => { orden.push('posicion'); return of(ack); }));
      sim['safeExit'].mockImplementation(() => defer(() => { orden.push('pausa'); return of(pausada); }));
    });

    it('con la posición sin guardar, primero la posición y después la pausa; la pausa queda registrada', () => {
      conPosicionPendiente();
      component.pauseFromOverlay();
      expect(orden).toEqual(['posicion', 'pausa']);
      expect(sim['updateWorldState']).toHaveBeenCalledWith('attempt-1', 10, 20, 'sala', true);
      expect(interno()['lastSyncedPosition']).toEqual({ x: 10, y: 20 });
      expect(component.pauseNote()).toBeNull();
    });

    it('con la posición ya guardada solo sale la pausa', () => {
      conPosicionPendiente();
      interno()['lastSyncedPosition'] = { x: 10, y: 20 };
      component.pauseFromOverlay();
      expect(orden).toEqual(['pausa']);
    });

    it('el guardado con espera que estaba programado no sale después de la pausa', () => {
      conPosicionPendiente();
      interno()['positionSaveHandle'] = window.setTimeout(() => (interno() as any).persistPosition(), 400);
      component.pauseFromOverlay();
      vi.advanceTimersByTime(5_000);
      expect(orden).toEqual(['posicion', 'pausa']);
    });

    it('si el servidor rechaza la posición, la pausa se registra igual', () => {
      conPosicionPendiente();
      sim['updateWorldState'].mockImplementation(() => defer(() => { orden.push('posicion'); return throwError(() => new HttpErrorResponse({ status: 400 })); }));
      component.pauseFromOverlay();
      expect(orden).toEqual(['posicion', 'pausa']);
      expect(component.pauseNote()).toBeNull();
    });

    it('sin red no se pierde la posición: al reintentar sale otra vez la posición y luego la pausa', () => {
      conPosicionPendiente();
      let red = false;
      sim['updateWorldState'].mockImplementation(() => defer(() => {
        orden.push('posicion');
        return red ? of(ack) : throwError(() => new HttpErrorResponse({ status: 0 }));
      }));
      component.pauseFromOverlay();
      expect(orden).toEqual(['posicion']);
      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.pauseNote()).not.toBeNull();
      red = true;
      vi.advanceTimersByTime(2_000);
      expect(orden).toEqual(['posicion', 'posicion', 'pausa']);
      expect(interno()['lastSyncedPosition']).toEqual({ x: 10, y: 20 });
      expect(component.pauseNote()).toBeNull();
    });
  });

  describe('plazos en puertas, personajes y el resto de acciones', () => {
    it('una puerta sin respuesta libera la acción, quita el fundido y avisa', () => {
      sim['enterRoom'].mockReturnValue(NEVER);
      const puerta = { key: 'puerta', type: 'EXIT', x: 500, y: 500, metadata: { targetNodeKey: 'otra' } } as unknown as MapObjectState;
      component.world.set({ ...makeWorld(), objects: [puerta] } as SimulationWorldState);
      (interno() as any).doorInteractionArmed = true;
      component.openInteraction(puerta);
      vi.advanceTimersByTime(400);
      expect(sim['enterRoom']).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(15_000);
      expect(component.busy()).toBe(false);
      expect(component.fadeActive()).toBe(false);
      expect(component.actionError()).toContain('tardando');
    });

    it('una conversación con un personaje sin respuesta libera la acción y avisa', () => {
      sim['recordNpcInteraction'].mockReturnValue(NEVER);
      component.openNpcDialogue({ key: 'vecino', displayName: 'Vecino', dialogue: { lines: [{ text: 'Hola' }] } } as any);
      vi.advanceTimersByTime(15_000);
      expect(component.busy()).toBe(false);
      expect(component.actionError()).toContain('tardando');
    });

    it('guardar la bitácora sin respuesta libera la acción y lo dice', () => {
      sim['saveReflection'].mockReturnValue(NEVER);
      component.saveReflection('algo');
      vi.advanceTimersByTime(15_000);
      expect(component.busy()).toBe(false);
      expect(component.journalSaveState()).toBe('error');
    });

    it('reanudar sin respuesta libera la acción y avisa', () => {
      sim['resumeAttempt'].mockReturnValue(NEVER);
      component.attempt.set({ ...makeAttempt(), status: 'PAUSED' } as SimulationAttemptState);
      component.resumeCurrentAttempt();
      vi.advanceTimersByTime(15_000);
      expect(component.busy()).toBe(false);
      expect(component.actionError()).not.toBe('');
    });

    it('cargar el mundo sin respuesta muestra el error con reintento en vez de quedarse colgado', () => {
      sim['getWorld'].mockReturnValue(NEVER);
      (interno() as any).loadWorld(makeAttempt());
      vi.advanceTimersByTime(15_000);
      expect(component.error()).not.toBe('');
      expect(component.loading()).toBe(false);
    });

    it('la respuesta tardía de una herramienta tras la pausa no pisa el mundo', () => {
      const respuesta = new Subject<any>();
      sim['useTool'].mockReturnValue(respuesta);
      const actual = makeWorld();
      component.world.set(actual);
      (interno() as any).doUseTool('t', null);
      component.attempt.set({ ...makeAttempt(), status: 'PAUSED' } as SimulationAttemptState);
      respuesta.next({ world: { ...makeWorld(), map: { key: 'x', title: 'X' } }, feedback: null });
      expect(component.world()).toBe(actual);
      expect(component.busy()).toBe(false);
    });
  });

  describe('decisión pendiente que sobrevive a recargar', () => {
    const http = (status: number) => new HttpErrorResponse({ status });
    const conDosOpciones = () => {
      const intento = makeAttempt();
      intento.currentNode.options.push({ id: 42, text: 'Otra' } as any);
      component.attempt.set(intento);
    };

    it('la intención (opción y requestId) se guarda al elegir', () => {
      sim['chooseDecision'].mockReturnValue(NEVER);
      component.executeDecision(41);
      const guardada = JSON.parse(sessionStorage.getItem('siep_decision_pendiente_attempt-1')!);
      expect(guardada).toMatchObject({ attemptId: 'attempt-1', nodeId: 1, decisionOptionId: 41 });
      expect(guardada.requestId).toBe(sim['chooseDecision'].mock.calls[0][2]);
    });

    it('al recargar con la intención guardada se restaura: no se puede elegir otra opción y la misma reenvía el mismo requestId', () => {
      sessionStorage.setItem('siep_decision_pendiente_attempt-1', JSON.stringify({ attemptId: 'attempt-1', nodeId: 1, decisionOptionId: 41, requestId: 'req-guardado' }));
      conDosOpciones();
      (interno() as any).restorePendingDecision(makeAttempt());
      component.executeDecision(42);
      expect(sim['chooseDecision']).not.toHaveBeenCalled();
      sim['chooseDecision'].mockReturnValue(NEVER);
      component.executeDecision(41);
      expect(sim['chooseDecision'].mock.calls[0][2]).toBe('req-guardado');
    });

    it('al recargar, si el servidor ya avanzó de nodo la intención no bloquea: se reenvía (V3) y un fallo de red NO la borra (M-6)', () => {
      sessionStorage.setItem('siep_decision_pendiente_attempt-1', JSON.stringify({ attemptId: 'attempt-1', nodeId: 99, decisionOptionId: 41, requestId: 'req-guardado' }));
      sim['chooseDecision'].mockReturnValue(throwError(() => new Error('sin red')));
      (interno() as any).restorePendingDecision(makeAttempt());
      (interno() as any).replayAppliedDecision();
      expect(sim['chooseDecision']).toHaveBeenCalledWith('attempt-1', 41, 'req-guardado');
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).not.toBeNull();
      sim['chooseDecision'].mockReturnValue(NEVER);
      conDosOpciones();
      component.executeDecision(42);
      expect(sim['chooseDecision']).toHaveBeenCalledTimes(2);   // el reenvío de la intención y la elección nueva: nada bloquea
      expect(sim['chooseDecision'].mock.calls[1][1]).toBe(42);
    });

    it('un 4xx en el reenvío NO libera la intención sin consultar el estado del intento', () => {
      const error$ = new Subject<any>();
      sim['chooseDecision'].mockReturnValue(error$);
      const consulta = new Subject<SimulationAttemptState>();
      sim['getAttempt'].mockReturnValue(consulta);
      conDosOpciones();
      component.executeDecision(41);
      error$.error(http(400));
      expect(sim['getAttempt']).toHaveBeenCalledWith('attempt-1');
      expect((interno() as any).pendingDecisionRequest).not.toBeNull();
      component.executeDecision(42);
      expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
    });

    it('si la consulta dice que la decisión no se aplicó, ahí sí se libera', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(400)));
      sim['getAttempt'].mockReturnValue(of(makeAttempt()));
      conDosOpciones();
      component.executeDecision(41);
      expect((interno() as any).pendingDecisionRequest).toBeNull();
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).toBeNull();
    });

    it('si la consulta dice que la decisión SÍ se aplicó, se adopta el intento del servidor y no se pierde la decisión', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(409)));
      const avanzado = makeAttempt();
      avanzado.currentNode = { ...avanzado.currentNode, id: 2, key: 'siguiente' } as any;
      sim['getAttempt'].mockReturnValue(of(avanzado));
      sim['getWorld'].mockReturnValue(NEVER);
      conDosOpciones();
      component.executeDecision(41);
      expect(component.attempt()?.currentNode.id).toBe(2);
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).toBeNull();
      expect(sim['getWorld']).toHaveBeenCalledTimes(1);
    });

    it('si la consulta tampoco responde, la intención se conserva', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(400)));
      sim['getAttempt'].mockReturnValue(throwError(() => new Error('sin red')));
      conDosOpciones();
      component.executeDecision(41);
      expect((interno() as any).pendingDecisionRequest).not.toBeNull();
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).not.toBeNull();
    });

    it('al confirmarse la decisión se borra la intención guardada', () => {
      sim['chooseDecision'].mockReturnValue(of(makeAttempt()));
      component.executeDecision(41);
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).toBeNull();
    });
  });

  describe('guardado automático de la posición', () => {
    const guardar = () => {
      interno()['lastPosition'] = { x: 10, y: 20 };
      (interno() as any).persistPosition();
    };

    it('reintenta con espera creciente tras un fallo y, si se logra, no avisa', () => {
      sim['updateWorldState'].mockReturnValueOnce(throwError(() => new Error('sin red')));
      sim['updateWorldState'].mockReturnValue(of({ attemptId: 'attempt-1', status: 'IN_PROGRESS', map: { key: 'sala' }, player: { x: 10, y: 20 } }));
      guardar();
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(599);
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(2);
      expect(component.actionError()).toBe('');
    });

    it('si no se pudo tras todos los reintentos avisa (y, desde V3, sigue pendiente: lo retoma al volver la red)', () => {
      sim['updateWorldState'].mockReturnValue(throwError(() => new Error('sin red')));
      guardar();
      vi.advanceTimersByTime(4_200);
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(4);
      expect(component.actionError()).toContain('posición');
    });

    it('una respuesta vieja, dentro de la misma sala, no pisa la posición sincronizada más nueva', () => {
      const primera = new Subject<any>();
      const segunda = new Subject<any>();
      sim['updateWorldState'].mockReturnValueOnce(primera).mockReturnValueOnce(segunda);
      interno()['lastPosition'] = { x: 10, y: 20 };
      (interno() as any).persistPosition();
      interno()['lastPosition'] = { x: 50, y: 60 };
      (interno() as any).persistPosition();
      const ack = (x: number, y: number) => ({ attemptId: 'attempt-1', status: 'IN_PROGRESS', map: { key: 'sala' }, player: { x, y } });
      segunda.next(ack(50, 60));
      primera.next(ack(10, 20));
      expect(interno()['lastSyncedPosition']).toEqual({ x: 50, y: 60 });
    });
  });

  describe('punto de lectura de un diálogo', () => {
    const dialogoDe = (key: string) => ({ key, speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [{ order: 1, text: 'a' }, { order: 2, text: 'b' }, { order: 3, text: 'c' }], choices: [] }) as unknown as DialogueState;

    it('se guarda qué conversación y en qué línea va', () => {
      (interno() as any).saveReadingPoint({ key: 'abuela', type: 'PERSON' }, dialogoDe('d1'), 2);
      expect(JSON.parse(sessionStorage.getItem('siep_punto_lectura_attempt-1')!)).toEqual({ attemptId: 'attempt-1', nodeId: 1, objectKey: 'abuela', dialogueKey: 'd1', line: 2 });
    });

    it('al cerrar la conversación el punto se borra', () => {
      (interno() as any).saveReadingPoint({ key: 'abuela', type: 'PERSON' }, dialogoDe('d1'), 1);
      (interno() as any).saveReadingPoint(null, null, 0);
      expect(sessionStorage.getItem('siep_punto_lectura_attempt-1')).toBeNull();
    });

    it('al recargar reabre esa conversación y arranca en la línea guardada', () => {
      sessionStorage.setItem('siep_punto_lectura_attempt-1', JSON.stringify({ attemptId: 'attempt-1', nodeId: 1, objectKey: 'carpeta', dialogueKey: 'd1', line: 2 }));
      const objeto = makeWorld().objects[1];
      sim['openInteraction'].mockReturnValue(of({ world: makeWorld(), interaction: objeto, dialogue: dialogoDe('d1') }));
      (interno() as any).restoreReadingPoint(makeWorld());
      expect(sim['openInteraction']).toHaveBeenCalledWith('attempt-1', 'carpeta');
      expect(component.dialogue()?.key).toBe('d1');
      expect(component.dialogueStart()).toEqual({ key: 'd1', line: 2 });
    });

    it('recupera el retrato del hablante al reanudar la lectura aunque falte la interacción seleccionada', () => {
      sessionStorage.setItem('siep_punto_lectura_attempt-1', JSON.stringify({ attemptId: 'attempt-1', nodeId: 1, objectKey: 'abuela', dialogueKey: 'd1', line: 2 }));
      const world = makeWorld();
      const actor = world.objects[0];
      const cara = { key: 'visual-abuela' };
      mundo['characterVisualOf'] = vi.fn(() => cara);
      sim['openInteraction'].mockReturnValue(of({ world, interaction: actor, dialogue: dialogoDe('d1') }));
      const juego = interno() as unknown as { restoreReadingPoint(world: SimulationWorldState): void; speakerVisual(): unknown };

      juego.restoreReadingPoint(world);
      component.selectedInteraction.set(null);
      expect(juego.speakerVisual()).toBeNull();

      component.worldRendered.set(true);
      expect(juego.speakerVisual()).toBe(cara);
      expect(mundo['characterVisualOf']).toHaveBeenCalledWith(actor.key);
    });

    it('reabre el diálogo de un personaje de ambiente con su retrato y sin interacción seleccionada', () => {
      const world = makeWorld();
      const actor = { key: 'acompanante', displayName: 'Acompañante', npcType: 'family' as const,
        recipeId: 'madre-acompanante', portrait: '', x: 10, y: 20, dialogue: { lines: [{ text: 'Te escucho.' }] } };
      component.scenarioConfig.set({ scenarioKey: 'caso', startRoomKey: world.map.key, rooms: [{
        key: world.map.key, displayName: 'Sala', tiledMapKey: 'sala', tiledJsonPath: '', spawnX: 0, spawnY: 0, exits: [], npcs: [actor],
      }] });
      sessionStorage.setItem('siep_punto_lectura_attempt-1', JSON.stringify({ attemptId: 'attempt-1', nodeId: 1,
        objectKey: `npc-${actor.key}`, dialogueKey: `npc-${actor.key}`, line: 0 }));
      const cara = { key: 'visual-acompanante' };
      mundo['characterVisualOf'] = vi.fn(() => cara);
      const juego = interno() as unknown as { restoreReadingPoint(world: SimulationWorldState): void; speakerVisual(): unknown };

      component.worldRendered.set(true);
      juego.restoreReadingPoint(world);

      expect(component.selectedInteraction()).toBeNull();
      expect(component.dialogue()?.key).toBe(`npc-${actor.key}`);
      expect(juego.speakerVisual()).toBe(cara);
      expect(mundo['characterVisualOf']).toHaveBeenCalledWith(`npc:${actor.key}`);
      expect(sim['openInteraction']).not.toHaveBeenCalled();
    });

    it('si el objeto ya no está en la sala, el punto se descarta', () => {
      sessionStorage.setItem('siep_punto_lectura_attempt-1', JSON.stringify({ attemptId: 'attempt-1', nodeId: 1, objectKey: 'fantasma', dialogueKey: 'd1', line: 1 }));
      (interno() as any).restoreReadingPoint(makeWorld());
      expect(sim['openInteraction']).not.toHaveBeenCalled();
      expect(sessionStorage.getItem('siep_punto_lectura_attempt-1')).toBeNull();
    });
  });

  describe('ronda de arreglos 1', () => {
    const http = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });
    const pausado = () => ({ ...makeAttempt(), status: 'PAUSED' } as SimulationAttemptState);
    const conDosOpciones = () => {
      const intento = makeAttempt();
      intento.currentNode.options.push({ id: 42, text: 'Otra' } as any);
      component.attempt.set(intento);
    };

    it('salida segura: la pausa NO viaja mientras la decisión está en vuelo; sale al llegar su respuesta, con el token vigente (V3: el token no rota)', () => {
      const decision$ = new Subject<SimulationAttemptState>();
      sim['chooseDecision'].mockReturnValue(decision$);
      sim['safeExit'].mockReturnValue(NEVER);
      component.executeDecision(41);
      component.pauseFromOverlay();
      expect(sim['safeExit']).not.toHaveBeenCalled();
      expect(component.attempt()?.status).toBe('PAUSED');

      decision$.next({ ...makeAttempt() } as SimulationAttemptState);
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
      expect(sim['safeExit']).toHaveBeenLastCalledWith('attempt-1', 'Salida segura solicitada');
    });

    it('salida segura: si la decisión en vuelo falla, la pausa se envía igualmente en vez de quedarse esperando', () => {
      const decision$ = new Subject<SimulationAttemptState>();
      sim['chooseDecision'].mockReturnValue(decision$);
      sim['safeExit'].mockReturnValue(NEVER);
      component.executeDecision(41);
      component.pauseFromOverlay();
      decision$.error(http(500));
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('una decisión que falla con la pausa ya registrada no devuelve la conversación ni avisa', () => {
      const decision$ = new Subject<SimulationAttemptState>();
      sim['chooseDecision'].mockReturnValue(decision$);
      sim['safeExit'].mockReturnValue(of(pausado()));
      sim['getWorld'].mockReturnValue(NEVER);
      component.dialogue.set(DIALOGO);
      component.executeDecision(41);
      component.pauseFromOverlay();
      expect(component.attempt()?.status).toBe('PAUSED');
      decision$.error(http(500));
      expect(component.dialogue()).toBeNull();
      expect(component.actionError()).toBe('');
    });

    describe('en ensayo', () => {
      let rehearsalApi: Record<string, Mock>;
      beforeEach(() => {
        rehearsalApi = { read: vi.fn(() => throwError(() => http(404, { code: 'REHEARSAL_GONE' }))), start: vi.fn(() => EMPTY) };
        (component as any).rehearsalApi = rehearsalApi;
        component.mode.set('rehearsal');
      });

      it('un ensayo borrado con una decisión en vuelo dice «ya no existe» y no «seguimos confirmando»', () => {
        sim['chooseDecision'].mockReturnValue(throwError(() => http(404, { code: 'REHEARSAL_GONE' })));
        sim['getAttempt'].mockReturnValue(throwError(() => http(404, { code: 'REHEARSAL_GONE' })));
        conDosOpciones();
        component.executeDecision(41);
        expect(rehearsalApi['read']).toHaveBeenCalled();
        expect(component.rehearsalGone()).toBe(true);
        expect(component.actionError()).not.toContain('confirmando');
      });

      it('un ensayo borrado durante el guardado automático de la posición dice «ya no existe»', () => {
        sim['updateWorldState'].mockReturnValue(throwError(() => http(404, { code: 'REHEARSAL_GONE' })));
        interno()['lastPosition'] = { x: 10, y: 20 };
        (interno() as any).persistPosition();
        expect(component.rehearsalGone()).toBe(true);
        vi.advanceTimersByTime(60_000);
        expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
      });

      it('un ensayo borrado al sincronizar la posición antes de una acción dice «ya no existe», no «no pudimos guardar»', () => {
        sim['updateWorldState'].mockReturnValue(throwError(() => http(404, { code: 'REHEARSAL_GONE' })));
        interno()['lastPosition'] = { x: 10, y: 20 };
        (interno() as any).openBackendInteraction(makeWorld().objects[1]);
        expect(component.rehearsalGone()).toBe(true);
        expect(component.actionError()).not.toContain('ubicación');
      });
    });

    it('un intento nuevo no hereda la decisión incierta, la lectura ni los fallos de guardado del anterior', () => {
      sim['chooseDecision'].mockReturnValue(NEVER);
      conDosOpciones();
      component.executeDecision(41);
      sessionStorage.setItem('siep_punto_lectura_attempt-1', JSON.stringify({ attemptId: 'attempt-1', objectKey: 'carpeta', dialogueKey: 'd', line: 1 }));
      (interno() as any).positionFailures = 3;
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).not.toBeNull();

      component.startNewAttempt();

      expect((interno() as any).pendingDecisionRequest).toBeNull();
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).toBeNull();
      expect(sessionStorage.getItem('siep_punto_lectura_attempt-1')).toBeNull();
      expect((interno() as any).positionFailures).toBe(0);
    });

    it('un ensayo nuevo tampoco hereda la decisión incierta del anterior', () => {
      sim['chooseDecision'].mockReturnValue(NEVER);
      conDosOpciones();
      component.executeDecision(41);
      (component as any).rehearsalApi = { start: vi.fn(() => EMPTY), read: vi.fn(() => EMPTY) };
      (interno() as any).beginRehearsal(7, null);
      expect((interno() as any).pendingDecisionRequest).toBeNull();
    });

    it('si el mundo no carga tras recargar, el guardado del punto de lectura no queda mudo', () => {
      (interno() as any).readingRestorePending = true;
      sim['getWorld'].mockReturnValue(throwError(() => http(500)));
      (interno() as any).loadWorld(makeAttempt());
      expect((interno() as any).readingRestorePending).toBe(false);
    });

    it('«safeExit()» ya no existe como camino aparte: el pie y Esc usan la misma salida', () => {
      expect((component as any).safeExit).toBeUndefined();
    });
  });

  describe('intento reemplazado desde otra pestaña u otro equipo (V4)', () => {
    const http = (status: number) => new HttpErrorResponse({ status, error: { success: false, code: 'NOT_FOUND', message: 'Intento no encontrado' } });
    const guardar = () => {
      interno()['lastPosition'] = { x: 10, y: 20 };
      (interno() as any).persistPosition();
    };

    it('un 404 al guardar la posición, confirmado con la lectura del intento, lo da por reemplazado y deja de reintentar', () => {
      sim['updateWorldState'].mockReturnValue(throwError(() => http(404)));
      sim['getAttempt'].mockReturnValue(throwError(() => http(404)));
      guardar();
      expect(sim['getAttempt']).toHaveBeenCalledWith('attempt-1');
      expect(component.attempt()?.status).toBe('REPLACED');
      vi.advanceTimersByTime(60_000);
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
      expect(component.actionError()).toBe('');
    });

    it('si la lectura del intento responde, el 404 no era del intento: sigue el reintento de siempre', () => {
      sim['updateWorldState'].mockReturnValueOnce(throwError(() => http(404)))
        .mockReturnValue(of({ attemptId: 'attempt-1', status: 'IN_PROGRESS', map: { key: 'sala' }, player: { x: 10, y: 20 } }));
      sim['getAttempt'].mockReturnValue(of(makeAttempt()));
      guardar();
      expect(component.attempt()?.status).toBe('IN_PROGRESS');
      vi.advanceTimersByTime(600);
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(2);
    });

    it('una interacción con 404 sobre un intento reemplazado no dice «Revisa tu conexión»: muestra el intento reemplazado', () => {
      sim['updateWorldState'].mockReturnValue(of({ attemptId: 'attempt-1', status: 'IN_PROGRESS', map: { key: 'sala' }, player: { x: 0, y: 0 } }));
      sim['openInteraction'].mockReturnValue(throwError(() => http(404)));
      sim['getAttempt'].mockReturnValue(throwError(() => http(404)));
      (interno() as any).openBackendInteraction(makeWorld().objects[1]);
      expect(component.attempt()?.status).toBe('REPLACED');
      expect(component.actionError()).toBe('');
      expect(component.busy()).toBe(false);
    });

    it('la salida segura sobre un intento reemplazado no queda pendiente: la pantalla dice que se reemplazó', () => {
      sim['safeExit'].mockReturnValue(throwError(() => http(404)));
      sim['getAttempt'].mockReturnValue(throwError(() => http(404)));
      component.pauseFromOverlay();
      vi.advanceTimersByTime(1);
      expect(component.attempt()?.status).toBe('REPLACED');
      expect(component.pauseNote()).toBeNull();
      expect(sessionStorage.getItem('siep_pausa_pendiente_attempt-1')).toBeNull();
      vi.advanceTimersByTime(60_000);
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });
  });
});
