// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta (mismo doble que el resto
// de specs de la pantalla de juego): solo se evalúa `extends Phaser.Scene` al cargar el módulo.
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

import { Component, EventEmitter } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { EMPTY, of } from 'rxjs';
import type { Mock } from 'vitest';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { MapObjectState, SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { DRAFT_COPY } from './draft-copy';
import { GameWorldComponent } from './game-world.component';
import { SimulationPlayComponent } from './simulation-play.component';
import type { PlaceCandidate } from './world-places.util';

/**
 * Tarea 9: la sala ocupa la pantalla. La ficha del objetivo reemplaza la lista «Qué hacer», el HUD nombra la escena y
 * llegan los dos avisos («puedes conocer más», «hay otra forma de responder»). Se pinta la plantilla de verdad con un
 * mundo falso en lugar del lienzo de Phaser (que no entra en jsdom); `places()` lo decide cada prueba.
 */

let lugares: PlaceCandidate[] = [];

@Component({
  selector: 'app-game-world',
  template: '',
  inputs: ['world', 'scenarioConfig', 'viewedNpcKeys', 'shortcuts', 'nearbyInteraction', 'selectedInteractionKey', 'motionPaused', 'nombreDeQuienJuega',
    'sfxMuted', 'reduceMotion', 'activation', 'intensity', 'doorStates', 'doorMessages', 'nextTargetKey', 'dimmedKeys', 'compact', 'showLoader'],
  outputs: ['worldReady', 'patientVisual', 'proximity', 'proximityAlso', 'nothingNearby', 'interact', 'npcInteract', 'walkEnded', 'walkCancelled',
    'bootFailed', 'roomExit', 'enterRoom', 'positionChange'],
})
class MundoFalso {
  worldReady = new EventEmitter<unknown>();
  patientVisual = new EventEmitter<unknown>();
  proximity = new EventEmitter<unknown>();
  proximityAlso = new EventEmitter<unknown>();
  nothingNearby = new EventEmitter<unknown>();
  interact = new EventEmitter<unknown>();
  npcInteract = new EventEmitter<unknown>();
  walkEnded = new EventEmitter<unknown>();
  walkCancelled = new EventEmitter<void>();
  bootFailed = new EventEmitter<unknown>();
  roomExit = new EventEmitter<unknown>();
  enterRoom = new EventEmitter<unknown>();
  positionChange = new EventEmitter<unknown>();
  places() { return lugares; }
  focus() {}
  playerPosition() { return undefined; }
  refreshScale() {}
  updatePatientVisualState() {}
  setPersonaState() {}
  playRevealEffects() {}
  walkToKey() { return true; }
  retryLoad() {}
  // La cámara dirigida (M1): la pantalla le pasa ajustes, el plano congelado y el momento al pintar cada cuadro.
  setCameraOptions() {}
  setCameraFrozen() {}
  setCameraMoment() {}
}

const PERSONA_SIN_VER: PlaceCandidate = { key: 'npc:enfermera', label: 'Enfermera', kind: 'person' };
const PERSONA_VISTA: PlaceCandidate = PERSONA_SIN_VER;

const decision = (id: number) => ({ key: `o${id}`, text: `Opción ${id}`, decisionOptionId: id, requiredToolCode: null, effect: {} });

function objeto(key: string, choices: unknown[]): MapObjectState {
  return {
    key, label: key, type: 'OBJECT', x: 10, y: 10, width: 20, height: 20, color: '#fff', icon: '', shortCode: '', collision: false,
    interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null,
    dialogue: { key: `d-${key}`, speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices },
  } as unknown as MapObjectState;
}
const OBJETO_CON_DECISION = objeto('carpeta', [decision(1)]);
const OBJETO_SIN_DECISION = objeto('caja', []);

function mundo(extra: Record<string, unknown> = {}): SimulationWorldState {
  return {
    map: { key: 'sala-x', title: 'Sala X' }, objects: [OBJETO_CON_DECISION, OBJETO_SIN_DECISION], tools: [],
    inventory: [], usedToolKeys: [], inspectedObjectKeys: [], flags: {}, ...extra,
  } as unknown as SimulationWorldState;
}

const resultadoConOpciones = (options: Array<{ id: number; text: string }>, obj = OBJETO_SIN_DECISION) => ({
  world: mundo({ decisionOptions: options }), interaction: obj, dialogue: obj.dialogue,
  preparedDecisionOptionId: null, unlockedToolCode: null,
});

describe('SimulationPlayComponent: la sala ocupa la pantalla (guía genérica)', () => {
  let sim: Record<string, Mock>;
  let announcer: { announce: Mock };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    sessionStorage.clear();
    localStorage.clear();
    lugares = [];
    sim = {
      getActiveAttempt: vi.fn(() => EMPTY), getProgressMap: vi.fn(() => EMPTY), getWorld: vi.fn(() => EMPTY),
      safeExit: vi.fn(() => EMPTY), startAttempt: vi.fn(() => EMPTY), updateWorldState: vi.fn(() => EMPTY),
      openInteraction: vi.fn(() => EMPTY), getHints: vi.fn(() => of({ available: 1, shown: [] })),
    };
    announcer = { announce: vi.fn() };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: { init: vi.fn(), setScene: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false), dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn() } },
        { provide: AuthService, useValue: {} },
        { provide: CONSENT_RECORDER, useValue: new SessionConsentRecorder() },
        { provide: LiveRegionAnnouncer, useValue: announcer },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: '7' }) } } },
      ],
    });
    TestBed.overrideComponent(SimulationPlayComponent, { remove: { imports: [GameWorldComponent] }, add: { imports: [MundoFalso] } });
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  function montarConMundo(o: { goal?: string; title?: string; options?: Array<{ id: number; text: string }>; lugares?: PlaceCandidate[]; vistos?: string[] } = {}) {
    lugares = o.lugares ?? [];
    const fixture = TestBed.createComponent(SimulationPlayComponent);
    const component = fixture.componentInstance;
    component.attempt.set({
      attemptId: 'a1', caseVersionId: 7, caseTitle: 'Caso', status: 'IN_PROGRESS',
      persona: { bond: 'GUARDED', activation: 'TENSE', label: 'x' },
      currentNode: { id: 1, key: 'nodo-1', title: o.title ?? 'Escena', narrative: 'N', terminal: false, goal: o.goal, options: o.options ?? [{ id: 1, text: 'A' }] },
      completionReport: null,
    } as unknown as SimulationAttemptState);
    component.world.set(mundo());
    if (o.vistos) (component as any).viewedNpcKeys.set(new Set(o.vistos));
    // La tarjeta de controles de primera vez se anuncia al aparecer (P8); aquí se prueban los avisos de la guía, no ella.
    component.helpCardSeen.set(true);
    component.worldStarted.set(true);
    component.loading.set(false);
    fixture.detectChanges();
    return { fixture, component, announcer, service: sim };
  }

  it.each(['Enter', ' '])('al cerrar controles con %j, la pulsación queda fuera de la cola del mundo hasta soltarla', tecla => {
    const { fixture, component, service } = montarConMundo();
    const herramienta = { ...OBJETO_SIN_DECISION, key: 'tool-pap', type: 'TOOL' as const, toolCode: 'PAP' };
    const jugar = () => component.openInteraction(herramienta);
    const cola: Array<() => void> = [];
    const escucharMundo = (event: KeyboardEvent) => { if (!event.defaultPrevented) cola.push(jugar); };
    const pulsar = (target: EventTarget, tipo: 'keydown' | 'keyup', repeat = false) => {
      const event = new KeyboardEvent(tipo, { key: tecla, bubbles: true, cancelable: true, repeat });
      target.dispatchEvent(event);
      return event;
    };
    component.worldRendered.set(true);
    component.nearbyInteraction.set(herramienta);
    component.openControls();
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const entendido = Array.from(host.querySelectorAll('app-game-help button')).find(button => button.textContent?.includes('Entendido')) as HTMLButtonElement;
    const juego = host.querySelector<HTMLElement>('.game-container')!;
    entendido.focus();
    expect(document.activeElement).toBe(entendido);

    window.addEventListener('keydown', escucharMundo);
    try {
      expect(pulsar(entendido, 'keydown').defaultPrevented).toBe(false);
      if (tecla === ' ') pulsar(entendido, 'keyup');
      entendido.click(); // Activación nativa que jsdom no sintetiza a partir de KeyboardEvent.
      fixture.detectChanges();
      juego.focus();
      expect(component.controlsVisible()).toBe(false);

      if (tecla === 'Enter') {
        expect(pulsar(juego, 'keydown', true).defaultPrevented).toBe(true);
        pulsar(juego, 'keyup');
      }
      cola.splice(0).forEach(accion => accion());
      expect(service['openInteraction']).not.toHaveBeenCalled();

      pulsar(juego, 'keydown');
      expect(service['openInteraction']).toHaveBeenCalledOnce();
      expect(service['openInteraction']).toHaveBeenCalledWith('a1', herramienta.key);
    } finally {
      window.removeEventListener('keydown', escucharMundo);
    }
  });

  it('la guía prioriza los usos del nodo, incluso vacíos, y admite respuestas anteriores', () => {
    const { component } = montarConMundo();
    const world = mundo({ usedToolKeys: ['PAP@camilo'], map: { key: 'sala-x', title: 'Sala X', ambient: {
      guia: { pasos: [{ texto: 'Aplica la herramienta.', hecho: { used: 'PAP' } },
        { texto: 'Apóyalo con la herramienta.', hecho: { used: 'PAP@camilo' } }] },
    } } });
    const hechos = (estado: SimulationWorldState) => component.refreshGuide(estado).pasos?.map(p => p.hecho);

    expect(hechos({ ...world, usedToolKeysHere: [] })).toEqual([false, false]);
    expect(hechos({ ...world, usedToolKeysHere: ['PAP@otra-persona'] })).toEqual([true, false]);
    expect(hechos({ ...world, usedToolKeysHere: ['PAP@camilo'] })).toEqual([true, true]);
    expect(hechos(world)).toEqual([true, true]);
  });

  it('el Enter de la nota de capítulo no cierra los controles que aparecen después', () => {
    const { fixture, component, service } = montarConMundo();
    component.worldRendered.set(true);
    component.helpCardSeen.set(false);
    component.transitionNote.set('Capítulo 1 · Una llegada.');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const juego = host.querySelector<HTMLElement>('.game-container')!;
    const pulsar = (tipo: 'keydown' | 'keyup', repeat = false) => {
      const event = new KeyboardEvent(tipo, { key: 'Enter', bubbles: true, cancelable: true, repeat });
      juego.dispatchEvent(event);
      return event;
    };

    expect(host.querySelector('app-nota-transicion')).not.toBeNull();
    expect(host.querySelector('app-game-help')).toBeNull();
    expect(pulsar('keydown').defaultPrevented).toBe(true);
    fixture.detectChanges();
    expect(host.querySelector('app-nota-transicion')).toBeNull();
    expect(host.querySelector('app-game-help')).not.toBeNull();
    expect(pulsar('keydown', true).defaultPrevented).toBe(true);
    pulsar('keyup');
    expect(component.controlsVisible()).toBe(true);
    expect(service['openInteraction']).not.toHaveBeenCalled();
  });

  it('conserva las acciones al abrir y cerrar Ir a… y recibir posiciones y cercanía equivalentes', () => {
    const person = { ...OBJETO_CON_DECISION, type: 'PERSON' as const };
    const other = { ...OBJETO_SIN_DECISION, type: 'PERSON' as const };
    const { fixture, component } = montarConMundo({ goal: 'Hablar', lugares: [{ key: person.key, label: person.label, kind: 'person' }] });
    component.nearbyInteraction.set(person);
    component.nearbyAlso.set(other);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const primary = host.querySelector('.context-bar__interaction:not(.context-bar__interaction--secondary)');
    const secondary = host.querySelector('.context-bar__interaction--secondary');
    expect(primary).not.toBeNull(); expect(secondary).not.toBeNull();
    const removed: Node[] = [];
    const observer = new MutationObserver(records => records.forEach(r => removed.push(...Array.from(r.removedNodes))));
    observer.observe(host.querySelector('.context-bar')!, { childList: true, subtree: true });
    component.openPlaces(); fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      component.nearbyInteraction.set({ ...person }); component.nearbyAlso.set({ ...other });
      component.rememberPosition(i, i); fixture.detectChanges();
    }
    component.closePlaces(); fixture.detectChanges();
    removed.push(...observer.takeRecords().flatMap(r => Array.from(r.removedNodes)));
    observer.disconnect();
    expect(host.querySelector('.context-bar__interaction:not(.context-bar__interaction--secondary)')).toBe(primary);
    expect(host.querySelector('.context-bar__interaction--secondary')).toBe(secondary);
    expect(removed.filter(n => n === primary || n === secondary || (n instanceof Element && !!n.querySelector('button')))).toHaveLength(0);
  }, 20000);

  it('conserva el boton de la lista para cancelar la caminata', () => {
    const person = { ...OBJETO_CON_DECISION, type: 'PERSON' as const };
    const { fixture, component } = montarConMundo({ goal: 'Hablar', lugares: [{ key: person.key, label: person.label, kind: 'person' }] });
    const world = (component as any).gameWorld;
    vi.spyOn(world, 'walkToKey').mockReturnValue(true);
    world.cancelWalk = vi.fn();
    component.openPlaces(); fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('app-world-places-list .places__item') as HTMLButtonElement;
    button.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-world-places-list .places__item')).toBe(button);
    expect(button.textContent).toContain('Yendo hacia');
    button.click(); fixture.detectChanges();
    expect(button.textContent).toContain('Hablar con');
    expect(world.cancelWalk).toHaveBeenCalled();
  });

  it('una persona lejana inicia la caminata y solo interactúa al llegar', () => {
    const person = { ...OBJETO_CON_DECISION, type: 'PERSON' as const };
    const { component } = montarConMundo();
    const world = (component as any).gameWorld;
    const walk = vi.spyOn(world, 'walkToKey').mockReturnValue(true);
    const open = vi.spyOn(component, 'openInteraction');
    (component as any).requestInteraction(person);
    expect(walk).toHaveBeenCalledWith(person.key);
    expect(open).not.toHaveBeenCalled();
    component.onWalkEnded({ key: person.key, label: person.label, outcome: 'arrived' });
    expect(open).toHaveBeenCalledWith(person);
  });

  it('no abre una persona si la caminata se cancela o queda bloqueada', () => {
    const person = { ...OBJETO_CON_DECISION, type: 'PERSON' as const };
    const { component } = montarConMundo();
    const open = vi.spyOn(component, 'openInteraction');
    component.requestInteraction(person);
    component.cancelPendingInteraction();
    component.onWalkEnded({ key: person.key, label: person.label, outcome: 'arrived' });
    expect(open).not.toHaveBeenCalled();
    component.requestInteraction(person);
    component.onWalkEnded({ key: person.key, label: person.label, outcome: 'blocked' });
    expect(open).not.toHaveBeenCalled();
    expect(component.softNotice()).toContain(person.label);
  });

  it('explica que una persona ausente no se puede alcanzar', () => {
    const person = { ...OBJETO_CON_DECISION, type: 'PERSON' as const };
    const { component } = montarConMundo();
    vi.spyOn((component as any).gameWorld, 'walkToKey').mockReturnValue(false);
    component.requestInteraction(person);
    expect(component.softNotice()).toContain(person.label);
    expect(component.softNotice()).toContain('Camina');
  });

  it('retira el aviso de llegada al terminar su plazo', () => {
    const { component } = montarConMundo();
    component.onWalkEnded({ key: 'x', label: 'Vigilante', outcome: 'arrived' });
    expect(component.softNotice()).toContain('Vigilante');
    vi.advanceTimersByTime(10000);
    expect(component.softNotice()).toBe('');
  });

  it('nombra la otra sala cuando la persona está fuera', () => {
    const person = { ...OBJETO_CON_DECISION, key: 'npc:ana', label: 'Ana', type: 'PERSON' as const };
    const { component } = montarConMundo();
    component.scenarioConfig.set({ rooms: [{ key: 'sala-y', displayName: 'Sala de espera', npcs: [{ key: 'ana' }] }] } as any);
    vi.spyOn((component as any).gameWorld, 'walkToKey').mockReturnValue(false);
    component.requestInteraction(person);
    expect(component.softNotice()).toContain('Ana está en Sala de espera');
    expect(component.softNotice()).toContain('Ir a…');
  });

  it('al llegar enfoca la acción y Enter conserva su activación nativa', () => {
    const person = { ...OBJETO_CON_DECISION, type: 'PERSON' as const };
    const { fixture, component } = montarConMundo();
    component.nearbyInteraction.set(person);
    fixture.detectChanges();
    component.onWalkEnded({ key: person.key, label: person.label, outcome: 'arrived' });
    fixture.detectChanges(); TestBed.tick();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.context-bar__interaction')!;
    expect(document.activeElement).toBe(button);
    const key = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    button.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    const request = vi.spyOn(component, 'requestInteraction');
    button.click();
    expect(request).toHaveBeenCalledWith(person);
  });

  it('la ficha recibe el objetivo de la escena y no hay contador ni «Ahora:»', () => {
    const { fixture } = montarConMundo({ goal: 'Contener a la familia' });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-scene-goal-card')!.getAttribute('data-goal')).toBe('Contener a la familia');
    expect(el.textContent).not.toMatch(/Decisión \d+ de \d+|Ahora:/);
  });

  it('el HUD nombra la escena', () => {
    const { component } = montarConMundo({ title: 'Urgencias' });
    expect(component.stageLabel()).toBe('Urgencias');
  });

  it('abrir la ficha refresca «En esta sala» con lo que hay ahora en la sala', () => {
    const { fixture } = montarConMundo({ goal: 'G' });
    lugares = [PERSONA_SIN_VER];
    const el: HTMLElement = fixture.nativeElement;
    const toggle = el.querySelector<HTMLButtonElement>('app-scene-goal-card button.goal-card__toggle')!;
    // Desde V7 la ficha arranca abierta: se pliega y se vuelve a abrir.
    if (toggle.getAttribute('aria-expanded') === 'true') { toggle.click(); fixture.detectChanges(); }
    toggle.click();
    fixture.detectChanges();
    expect(el.querySelector('app-scene-goal-card')!.textContent).toContain('Enfermera');
    // P9: «aún no» ya no se dice; la única persona sin ver es el siguiente paso.
    expect(el.querySelector('app-scene-goal-card')!.textContent).toContain('tu siguiente paso');
  });

  it('con algo por conocer, la conversación con decisiones avisa «Puedes conocer más…»', () => {
    const { component } = montarConMundo({ lugares: [PERSONA_SIN_VER] });
    sim['openInteraction'].mockReturnValue(of(resultadoConOpciones([{ id: 1, text: 'A' }], OBJETO_CON_DECISION)));
    component.openInteraction(OBJETO_CON_DECISION);
    expect(component.dialogue()!.notice).toBe('Puedes conocer más antes de responder.');
  });

  it('con todo visto no hay aviso', () => {
    const { component } = montarConMundo({ lugares: [PERSONA_VISTA], vistos: ['enfermera'] });
    sim['openInteraction'].mockReturnValue(of(resultadoConOpciones([{ id: 1, text: 'A' }], OBJETO_CON_DECISION)));
    component.openInteraction(OBJETO_CON_DECISION);
    expect(component.dialogue()!.notice).toBeUndefined();
  });

  it('una opción nueva tras explorar se avisa una vez y se anuncia', () => {
    const { component, announcer } = montarConMundo({ options: [{ id: 1, text: 'A' }] });
    const dos = [{ id: 1, text: 'A' }, { id: 2, text: 'B' }];
    sim['openInteraction'].mockReturnValue(of(resultadoConOpciones(dos)));
    component.openInteraction(OBJETO_SIN_DECISION);
    expect(component.softNotice()).toBe('Ahora conoces algo más: hay otra forma de responder.');
    expect(announcer.announce).toHaveBeenCalledWith('Ahora conoces algo más: hay otra forma de responder.', 'polite');
    sim['openInteraction'].mockReturnValue(of(resultadoConOpciones(dos)));
    component.openInteraction(OBJETO_SIN_DECISION);
    expect(announcer.announce.mock.calls.filter(([t]) => String(t).startsWith('Ahora conoces')).length).toBe(1);
  });

  it('sin opciones nuevas (las mismas) no hay aviso', () => {
    const { component, announcer } = montarConMundo({ options: [{ id: 1, text: 'A' }] });
    sim['openInteraction'].mockReturnValue(of(resultadoConOpciones([{ id: 1, text: 'A' }])));
    component.openInteraction(OBJETO_SIN_DECISION);
    expect(component.softNotice()).toBe('');
    expect(announcer.announce).not.toHaveBeenCalled();
  });

  it('una opción nueva con la conversación abierta se avisa una sola vez y la conversación la muestra', () => {
    const dosDecisiones = objeto('carpeta', [decision(1), decision(2)]);
    const { component, announcer } = montarConMundo({ options: [{ id: 1, text: 'A' }] });
    sim['openInteraction'].mockReturnValue(of(resultadoConOpciones([{ id: 1, text: 'A' }], dosDecisiones)));
    component.openInteraction(dosDecisiones);
    const ids = () => component.dialogue()!.choices.map(c => c.decisionOptionId);
    expect(ids()).toEqual([1]);

    (component as any).applyDecisionOptions(mundo({ decisionOptions: [{ id: 1, text: 'A' }, { id: 2, text: 'B' }] }));
    expect(ids()).toEqual([1, 2]);
    (component as any).applyDecisionOptions(mundo({ decisionOptions: [{ id: 1, text: 'A' }, { id: 2, text: 'B' }] }));
    expect(announcer.announce.mock.calls.filter(([t]) => String(t).startsWith('Ahora conoces')).length).toBe(1);
  });

  it('si el nodo cambió entre una lectura y otra, la opción «nueva» es de otro nodo y no hay aviso', () => {
    const { component, announcer } = montarConMundo({ options: [{ id: 1, text: 'A' }] });
    (component as any).applyDecisionOptions(mundo({ decisionOptions: [{ id: 1, text: 'A' }] }));
    // La decisión llevó al estudiante al nodo 2, que nace con la opción 1; la lectura siguiente ofrece la 1 y la 2.
    component.attempt.update(game => ({ ...game!, currentNode: { ...game!.currentNode, id: 2, key: 'nodo-2', options: [{ id: 1, text: 'A' }] } }));
    (component as any).applyDecisionOptions(mundo({ decisionOptions: [{ id: 1, text: 'A' }, { id: 2, text: 'B' }] }));
    expect(component.softNotice()).toBe('');
    expect(announcer.announce).not.toHaveBeenCalled();
    // En el nodo 2, ya registrado, explorar sí avisa.
    (component as any).applyDecisionOptions(mundo({ decisionOptions: [{ id: 1, text: 'A' }, { id: 2, text: 'B' }, { id: 3, text: 'C' }] }));
    expect(component.softNotice()).toBe('Ahora conoces algo más: hay otra forma de responder.');
  });

  it('ningún aviso dice cuál opción es la adecuada', () => {
    for (const texto of [DRAFT_COPY.noticeMoreToKnow.text, DRAFT_COPY.noticeNewOption.text]) {
      expect(texto).not.toMatch(/recomendad|correct|adecuad|mejor|riesgo/i);
    }
  });
});
