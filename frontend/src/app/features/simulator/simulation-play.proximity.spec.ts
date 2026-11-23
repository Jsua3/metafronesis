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
import { EMPTY, of } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { DialogueState, MapObjectState, SimulationAttemptState, SimulationWorldState, WorldComment } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * Reacciones al acercarse y al explorar (bloque B, tarea 22): la pantalla solo cablea. Se ejercita la instancia con un mundo
 * falso (sin plantilla): lo que llega a las reacciones, cuándo se bloquean y que Esc sigue pausando con la burbuja a la vista.
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

describe('SimulationPlayComponent: reacciones al acercarse (4.3.7)', () => {
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

  function conReaccionesFalsas(): Reacciones {
    const falsas: Reacciones = {
      setComments: vi.fn(), setBlocked: vi.fn(), setActivation: vi.fn(), onProximity: vi.fn(), onInspected: vi.fn(), dispose: vi.fn(),
    };
    interno()['reactions'] = falsas;
    return falsas;
  }

  it('pasa los comentarios del mundo a las reacciones, y los de una respuesta sin ellos los vacía', () => {
    const reacciones = conReaccionesFalsas();
    interno().applyDecisionOptions(makeWorld([COMENT_ABUELA_SIN_GESTO]));
    expect(reacciones.setComments).toHaveBeenLastCalledWith([COMENT_ABUELA_SIN_GESTO]);
    interno().applyDecisionOptions(makeWorld());
    expect(reacciones.setComments).toHaveBeenLastCalledWith([]);
  });

  it('bloquea las reacciones con un diálogo abierto y las libera al cerrarlo', () => {
    const reacciones = conReaccionesFalsas();
    TestBed.tick();
    expect(reacciones.setBlocked).toHaveBeenLastCalledWith(false);
    component.dialogue.set(DIALOGO);
    TestBed.tick();
    expect(reacciones.setBlocked).toHaveBeenLastCalledWith(true);
    component.dialogue.set(null);
    TestBed.tick();
    expect(reacciones.setBlocked).toHaveBeenLastCalledWith(false);
  });

  it('bloquea mientras el personaje reacciona a la decisión y con el intento en pausa', () => {
    const reacciones = conReaccionesFalsas();
    component.reacting.set(true);
    TestBed.tick();
    expect(reacciones.setBlocked).toHaveBeenLastCalledWith(true);
    component.reacting.set(false);
    component.attempt.set({ ...makeAttempt(), status: 'PAUSED' } as SimulationAttemptState);
    TestBed.tick();
    expect(reacciones.setBlocked).toHaveBeenLastCalledWith(true);
  });

  it('pasa la activación del intento a las reacciones', () => {
    const reacciones = conReaccionesFalsas();
    TestBed.tick();
    expect(reacciones.setActivation).toHaveBeenLastCalledWith('TENSE');
  });

  it('al estar listo el mundo crea las reacciones con los comentarios que ya trae y una burbuja que se retira sola', () => {
    component.world.set(makeWorld([COMENT_ABUELA_SIN_GESTO]));
    component.onWorldReady();
    const reacciones = interno()['reactions'] as { onProximity(key: string | null): void };
    expect(reacciones).not.toBeNull();
    reacciones.onProximity('abuela');
    expect((component as unknown as { bubble(): { comment: WorldComment } | null }).bubble()?.comment.id).toBe('7-0');
    expect(mundo['faceTowards']).toHaveBeenCalledWith('abuela', 'player');
    vi.advanceTimersByTime(6000);
    expect((component as unknown as { bubble(): unknown }).bubble()).toBeNull();
  });

  it('el gesto automático al acercarse pide no marcar data-reaction (eso es solo de las decisiones)', () => {
    component.world.set(makeWorld([{ ...COMENT_ABUELA_SIN_GESTO, gesture: 'asiente' }]));
    component.onWorldReady();
    (interno()['reactions'] as { onProximity(key: string | null): void }).onProximity('abuela');
    expect(mundo['playGesture']).toHaveBeenCalledWith('abuela', 'asiente', { mark: false });
  });

  it('al cambiar de intento con una burbuja a la vista, la burbuja vieja se retira', () => {
    component.world.set(makeWorld([COMENT_ABUELA_SIN_GESTO]));
    component.onWorldReady();
    (interno()['reactions'] as { onProximity(key: string | null): void }).onProximity('abuela');
    const bubble = () => (component as unknown as { bubble(): unknown }).bubble();
    expect(bubble()).not.toBeNull();
    component.attempt.set({ ...makeAttempt(), attemptId: 'attempt-2' } as SimulationAttemptState);
    component.onWorldReady();
    expect(bubble()).toBeNull();
  });

  it('abrir un diálogo con la burbuja a la vista la retira', () => {
    component.world.set(makeWorld([COMENT_ABUELA_SIN_GESTO]));
    component.onWorldReady();
    (interno()['reactions'] as { onProximity(key: string | null): void }).onProximity('abuela');
    component.dialogue.set(DIALOGO);
    TestBed.tick();
    expect((component as unknown as { bubble(): unknown }).bubble()).toBeNull();
  });

  it('crea las reacciones una sola vez por intento', () => {
    component.onWorldReady();
    const primeras = interno()['reactions'];
    component.onWorldReady();
    expect(interno()['reactions']).toBe(primeras);
  });

  it('tras revisar un objeto, las personas cercanas lo miran; tras hablar con una persona, no', () => {
    const reacciones = conReaccionesFalsas();
    const objeto = makeWorld().objects[1];
    sim['openInteraction'].mockReturnValue(of({ world: makeWorld(), interaction: objeto, dialogue: null }));
    interno().doOpenBackendInteraction(objeto);
    expect(reacciones.onInspected).toHaveBeenCalledWith('carpeta');
    reacciones.onInspected.mockClear();
    const persona = makeWorld().objects[0];
    sim['openInteraction'].mockReturnValue(of({ world: makeWorld(), interaction: persona, dialogue: null }));
    interno().doOpenBackendInteraction(persona);
    expect(reacciones.onInspected).not.toHaveBeenCalled();
  });

  it('Esc con la burbuja a la vista pausa como siempre', () => {
    component.world.set(makeWorld([COMENT_ABUELA_SIN_GESTO]));
    component.onWorldReady();
    (interno()['reactions'] as { onProximity(key: string | null): void }).onProximity('abuela');
    expect((component as unknown as { bubble(): unknown }).bubble()).not.toBeNull();
    component.handleGlobalInteraction(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(sim['safeExit']).toHaveBeenCalledTimes(1);
  });

  it('al destruir la pantalla las reacciones se sueltan', () => {
    const reacciones = conReaccionesFalsas();
    component.ngOnDestroy();
    expect(reacciones.dispose).toHaveBeenCalled();
  });
});
