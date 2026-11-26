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
import { EMPTY, Subject, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * Correcciones de la revisión adversarial sobre la salida segura (REGLA-004 / ETH-02): el fundido de escena no
 * tapa el pie (F1), la pausa sale en el acto, sin cola (F2), Esc mantenido no encadena acciones (F5) y ningún aviso
 * queda encima de la pantalla de pausa (F7). Instancia + contratos de fuente (Jest no renderiza la plantilla).
 */

const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

/** Cuerpo de la primera regla cuyo selector es exactamente `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No se encontró la regla ${selector}`);
  return match[2];
}

const zIndex = (selector: string): number => Number(/z-index:\s*(\d+)/.exec(rule(selector))?.[1]);

function makeAttempt(overrides: Record<string, unknown> = {}): SimulationAttemptState {
  return {
    attemptId: 'attempt-1', caseVersionId: 7, caseTitle: 'Caso demo', status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { id: 1, key: 'hospital-urgencias', title: 'Urgencias', narrative: 'N', terminal: false, options: [] },
    completionReport: null, ...overrides,
  } as unknown as SimulationAttemptState;
}

describe('SimulationPlayComponent: salida segura (correcciones de la revisión)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;
  let audio: Record<string, Mock>;

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
    };
    audio = {
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
  });

  afterEach(() => {
    component?.ngOnDestroy(); // cancela los temporizadores pendientes antes de que se desmonte el entorno
    vi.useRealTimers();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('F1: el fundido de escena no tapa «Salida segura»', () => {
    it('el pie sube por encima del fundido mientras este espera al servidor', () => {
      expect(component.footerAboveVeils()).toBe(false);

      component.fadeActive.set(true);

      expect(component.footerAboveVeils()).toBe(true);
    });

    it('también sube por encima de la nota de transición (z 340), que cubre la pantalla con 92 % de negro', () => {
      component.transitionNote.set('Quince días después…');

      expect(component.footerAboveVeils()).toBe(true);
    });

    it('con una superposición abierta el pie es inerte y no sube: la superposición trae su propio botón', () => {
      component.fadeActive.set(true);
      component.dialogue.set({ key: 'd', lines: [], choices: [] } as never);

      expect(component.footerAboveVeils()).toBe(false);
    });

    it('la plantilla enlaza el pie inerte y mantiene Salida segura durante el encuadre', () => {
      expect(source).toMatch(/<footer class="bottom-zone" \[class\.bottom-zone--above-veils\]="footerAboveVeils\(\)"\s*\[attr\.inert\]="pieInerte\(\)/);
      expect(source).toContain("(this.inputBlocked() || this.viewMode() === 'dialogue-cinematic') && !this.esperandoPanel()");
    });

    // Bloque U1 (variante B): el aviso de pausa ya no trae un número sino `var(--ds-z-maximo)` (1000): se resuelve su valor en la escala de capas.
    it('el z-index del pie elevado supera al fundido (200) y a la nota de transición (340), y no al aviso de pausa (z máximo)', () => {
      const scale = readFileSync(join(__dirname, '../../../styles/tokens/_scale.scss'), 'utf-8');
      const maximo = Number(/\$z:\s*\([^)]*\bmaximo:\s*(\d+)\)/.exec(scale)?.[1]);
      expect(rule('.pausing-notice')).toContain('z-index: var(--ds-z-maximo);');
      expect(maximo).toBeGreaterThan(0);
      expect(zIndex('.bottom-zone--above-veils')).toBeGreaterThan(zIndex('.scene-fade'));
      expect(zIndex('.bottom-zone--above-veils')).toBeGreaterThan(zIndex('.transition-note'));
      expect(zIndex('.bottom-zone--above-veils')).toBeLessThan(maximo);
    });

    it('el fundido sigue a pantalla completa y capturando punteros: el mundo y la cabecera no se tocan mientras dura', () => {
      expect(rule('.scene-fade')).toMatch(/position: fixed; inset: 0; z-index: 200;/);
      expect(rule('.scene-fade--active')).toContain('pointer-events: auto;');
    });
  });
  describe('F5: un Esc mantenido no cierra y además pausa', () => {
    const dialogue = { key: 'd', lines: [{ order: 1, speakerName: 'A', text: 'x', emotion: 'neutral' }], choices: [] } as never;
    const escape = (repeat: boolean): KeyboardEvent => new KeyboardEvent('keydown', { key: 'Escape', repeat, cancelable: true });

    it('los eventos repetidos de Esc se ignoran: ni cierran la ayuda, la bitácora o el diálogo, ni pausan', () => {
      component.helpOpen.set(true);
      component.journalOpen.set(true);
      component.dialogue.set(dialogue);

      for (let i = 0; i < 10; i += 1) component.handleGlobalInteraction(escape(true));

      expect(component.helpOpen()).toBe(true);
      expect(component.journalOpen()).toBe(true);
      expect(component.dialogue()).not.toBeNull();
      expect(sim['safeExit']).not.toHaveBeenCalled();
      expect(component.pausing()).toBe(false);
    });

    it('una pulsación mantenida cierra solo lo primero (primer evento) y nunca llega a la pausa', () => {
      component.dialogue.set(dialogue);

      component.handleGlobalInteraction(escape(false)); // primer evento: cierra el diálogo
      for (let i = 0; i < 10; i += 1) component.handleGlobalInteraction(escape(true)); // los repetidos

      expect(component.dialogue()).toBeNull();
      expect(sim['safeExit']).not.toHaveBeenCalled();
      expect(component.pausing()).toBe(false);
    });

    it('Esc mantenido en la introducción no repite la pausa y un Esc nuevo sí pausa', () => {
      component.showCaseIntro.set(true);

      component.handleGlobalInteraction(escape(true));
      expect(component.pausing()).toBe(false);

      component.handleGlobalInteraction(escape(false));
      expect(component.pausing()).toBe(true);
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('un Esc nuevo (no repetido) sigue pausando con el mundo libre', () => {
      component.handleGlobalInteraction(escape(false));

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });
  });

  describe('F7: ningún aviso queda sobre la pantalla de pausa', () => {
    const paused = () => makeAttempt({ status: 'PAUSED' });

    function showAllNotices(): void {
      component.roomBanner.set('Marco normativo en salud');
      // El aviso de puerta es un aviso del sistema (F6-12): se emite por su camino real.
      (component as unknown as { showDoorNotice(message: string): void }).showDoorNotice('Aún no puedes pasar.');
      component.transitionNote.set('Quince días después…');
      component.softNotice.set('Obtuviste: Kit PAP.');
    }

    it('al pausar se apagan el banner de etapa, el aviso de puerta y la nota de transición', () => {
      sim['safeExit'].mockReturnValue(of(paused()));
      showAllNotices();

      component.pauseFromOverlay();

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.roomBanner()).toBe('');
      expect(component.doorNotice()).toBe('');
      expect(component.transitionNote()).toBe('');
      expect(component.softNotice()).toBe('');
    });

    it('los temporizadores de esos avisos no los vuelven a pintar tras la pausa', () => {
      sim['safeExit'].mockReturnValue(of(paused()));
      // Los avisos reales nacen con su temporizador (4,2 s, 3 s…): se ejercitan por las rutas privadas.
      const internals = component as unknown as {
        showRoomBanner(text: string, ms: number): void;
        showDoorNotice(message: string): void;
      };
      internals.showRoomBanner('Marco normativo en salud', 3000);
      internals.showDoorNotice('Aún no puedes pasar.');

      component.pauseFromOverlay();
      vi.advanceTimersByTime(10_000);

      expect(component.roomBanner()).toBe('');
      expect(component.doorNotice()).toBe('');
    });

    it('aunque la pausa no se registre, los avisos se apagan en el acto: la persona ya salió (V3, REGLA-004)', () => {
      const failing = new Subject<never>();
      sim['safeExit'].mockReturnValue(failing);
      showAllNotices();

      component.pauseFromOverlay();
      failing.error(new Error('sin red'));

      expect(component.roomBanner()).toBe('');
      expect(component.doorNotice()).toBe('');
      expect(component.transitionNote()).toBe('');
      expect(component.softNotice()).toBe('');
    });

    it('un intento nuevo también limpia los avisos del intento anterior', () => {
      showAllNotices();

      component.startNewAttempt();

      expect(component.roomBanner()).toBe('');
      expect(component.doorNotice()).toBe('');
      expect(component.transitionNote()).toBe('');
    });

    // req: REGLA-004 (revisión de F6, «Ir a…» + «Salida segura»)
    it('«Ir a…» abierto se cierra con la pausa: no queda bajo la pantalla de pausa ni reaparece al reanudar', () => {
      sim['safeExit'].mockReturnValue(of(paused()));
      component.placesOpen.set(true);

      component.pauseFromOverlay();

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.placesOpen()).toBe(false);
    });

    it('aunque la pausa no se registre, «Ir a…» se cierra en el acto y la pausa se reintenta sola (V3)', () => {
      const failing = new Subject<never>();
      sim['safeExit'].mockReturnValue(failing);
      component.placesOpen.set(true);

      component.pauseFromOverlay();
      failing.error(new Error('sin red'));

      expect(component.placesOpen()).toBe(false);
      expect(component.attempt()?.status).toBe('PAUSED');
    });

    it('la salida segura cancela el temporizador de la nota de transición', () => {
      const juego = component as unknown as {
        mostrarNotaDeTransicion(world: SimulationWorldState): boolean;
        transitionNoteTimer: number | null;
      };
      const cancelar = vi.spyOn(window, 'clearTimeout');
      sim['safeExit'].mockReturnValue(of(paused()));
      const withNote = { map: { key: 'sala', ambient: { transitionText: 'Quince días después…' } } } as SimulationWorldState;
      expect(juego.mostrarNotaDeTransicion(withNote)).toBe(true);
      const temporizador = juego.transitionNoteTimer;
      expect(temporizador).not.toBeNull();

      component.pauseFromOverlay();

      expect(cancelar).toHaveBeenCalledWith(temporizador);
      expect(juego.transitionNoteTimer).toBeNull();
      expect(component.transitionNote()).toBe('');
      cancelar.mockRestore();
    });
  });

  describe('F2: la pausa sale en el acto, sin cola ni plazo (petición colgada)', () => {
    const DEADLINE_MS = 10_000;
    const paused = () => makeAttempt({ status: 'PAUSED' });

    it('con una petición colgada la pausa sale en el acto, sin esperar ningún plazo, una sola vez', () => {
      component.busy.set(true); // una petición que nunca responde

      component.pauseFromOverlay();
      TestBed.tick();

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
      expect(sim['safeExit']).toHaveBeenCalledWith('attempt-1', 'Salida segura solicitada');

      vi.advanceTimersByTime(60_000);

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('si la petición termina mucho después, su liberación de busy no repite la pausa', () => {
      component.busy.set(true);
      component.pauseFromOverlay();
      vi.advanceTimersByTime(DEADLINE_MS);
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);

      component.busy.set(false); // llega tarde la respuesta colgada
      TestBed.tick();
      TestBed.tick();

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('al terminar la pausa se apagan el estado, el aviso de lentitud y el plazo', () => {
      sim['safeExit'].mockReturnValue(of(paused()));
      component.busy.set(true);
      component.pauseFromOverlay();

      vi.advanceTimersByTime(DEADLINE_MS);

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.pausing()).toBe(false);
      vi.advanceTimersByTime(60_000);
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('si el servidor no registra la pausa, la persona sigue en pausa con la nota de la pantalla (sin aviso de error) y se reintenta sola', () => {
      const failing = new Subject<never>();
      sim['safeExit'].mockReturnValue(failing);
      component.busy.set(true);
      component.pauseFromOverlay();
      vi.advanceTimersByTime(DEADLINE_MS);

      failing.error(new Error('sin red'));

      expect(component.pausing()).toBe(true);
      expect(component.pauseNote()).not.toBeNull();
      expect(component.actionError()).toBe('');
      expect(component.busy()).toBe(false);
      vi.advanceTimersByTime(2_000);
      expect(sim['safeExit']).toHaveBeenCalledTimes(2);
    });

    it('con la posición sin guardar la pausa se ve en el acto y la posición sale antes que la pausa (V4)', () => {
      const sync = new Subject<unknown>();
      sim['updateWorldState'].mockReturnValue(sync);
      (component as unknown as { lastPosition: { x: number; y: number } }).lastPosition = { x: 120, y: 340 };
      component.world.set({ map: { key: 'hospital-urgencias' }, objects: [], tools: [], inventory: [], flags: {} } as never);

      component.pauseFromOverlay();

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(sim['updateWorldState']).toHaveBeenCalledWith('attempt-1', 120, 340, 'hospital-urgencias', true);
      expect(sim['safeExit']).not.toHaveBeenCalled();
      sync.next({ attemptId: 'attempt-1', status: 'IN_PROGRESS', map: { key: 'hospital-urgencias' }, player: { x: 120, y: 340 } });
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('si el servidor rechaza la posición, registra la pausa e informa de la posición no guardada', () => {
      sim['updateWorldState'].mockReturnValue(throwError(() => new Error('rechazada')));
      sim['safeExit'].mockReturnValue(of(paused()));
      (component as unknown as { lastPosition: { x: number; y: number } }).lastPosition = { x: 120, y: 340 };
      component.world.set({ map: { key: 'hospital-urgencias' }, objects: [], tools: [], inventory: [], flags: {} } as never);
      component.pauseFromOverlay();
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
      expect(component.pausePositionNote()).toContain('No se guardó tu última posición');
    });

    it('la respuesta de una decisión que llega con la pausa puesta no saca a la persona de ella (adopta el estado, sigue PAUSED)', () => {
      const decision = new Subject<SimulationAttemptState>();
      sim['chooseDecision'].mockReturnValue(decision);
      sim['safeExit'].mockReturnValue(of(paused()));
      sim['getWorld'].mockReturnValue(of({ map: { key: 'hospital-urgencias' }, objects: [], tools: [], inventory: [], flags: {} } as never));
      sim['getScenarioConfig'] = vi.fn(() => of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));
      component.attempt.set(makeAttempt({
        currentNode: { id: 1, key: 'hospital-urgencias', title: 'U', narrative: 'N', terminal: false, options: [{ id: 101, text: 'Opción' }] },
      }));

      component.executeDecision(101);
      vi.advanceTimersByTime(340); // el fundido y luego la petición, que se cuelga
      expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
      component.pauseFromOverlay();
      vi.advanceTimersByTime(DEADLINE_MS);
      expect(component.attempt()?.status).toBe('PAUSED');

      decision.next(makeAttempt({ status: 'IN_PROGRESS' }));

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.busy()).toBe(false);
      expect(component.fadeActive()).toBe(false);
    });

    it('el aviso del pie admite varias líneas sin salirse de la pantalla', () => {
      expect(rule('.pausing-notice')).toMatch(/width: max-content; max-width: min\(92vw, 520px\);/);
    });
  });
});

// F6-2: «reanudar» es la misma tarjeta que las otras tres entradas. Lo que protegía F3 (que sus tres salidas no queden
// inalcanzables en pantallas bajas) lo da ahora la estructura común: cabecera, cuerpo que se desplaza por dentro y pie
// con las acciones siempre a la vista, con la tarjeta acotada al alto de la pantalla.
describe('F3 y F6-2: el aviso de reanudar conserva sus tres salidas en pantallas bajas (844x390)', () => {
  it('la tarjeta es de tres filas (cabecera, cuerpo con scroll propio, acciones) acotada a la pantalla', () => {
    expect(rule('.case-intro-card')).toMatch(/grid-template-rows: auto minmax\(0, 1fr\) auto;/);
    expect(rule('.case-intro-card')).toMatch(/max-height: min\(86vh, 720px\);/);
    expect(rule('.case-intro-card__body')).toMatch(/overflow-y: auto;/);
    expect(source).not.toMatch(/\.resume-(overlay|card|metrics|actions)/);
  });

  it('en pantallas bajas la tarjeta ocupa todo el alto disponible y las acciones siguen a la vista', () => {
    // La consulta de pantallas bajas aparece varias veces en el archivo: se parte de la regla y se sube a SU consulta.
    const rule = source.indexOf('.case-intro-card { max-height: 100%; border-radius: 14px; }');
    expect(rule).toBeGreaterThan(-1);
    const start = source.lastIndexOf('@media', rule);
    expect(source.slice(start, rule)).toContain('(max-height: 520px), (pointer: coarse) and (orientation: landscape) {');
    const block = source.slice(start, source.indexOf('\n    }\n', start));
    expect(block).toMatch(/\.case-intro-card \{ max-height: 100%; border-radius: 14px; \}/);
    expect(block).toMatch(/\.case-intro-card__actions \{ padding: 8px 16px; gap: 10px; \}/);
  });

  it('las tres salidas siguen en la plantilla: volver al catálogo, iniciar uno nuevo (con confirmación) y reanudar', () => {
    expect(source).toMatch(/routerLink="\/portal\/simulador">Volver al catálogo[\s\S]*?requestNewAttempt\(\)[\s\S]*?resumeAttempt\(\)/);
  });
});
