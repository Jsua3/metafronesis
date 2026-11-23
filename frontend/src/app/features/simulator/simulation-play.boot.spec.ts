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
import { SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * Arranque y fallos de la pantalla de juego (plan visual F6-1): UN solo indicador de carga desde que se pide el
 * intento hasta el primer cuadro del mundo, y un fallo con «Reintentar» que vuelve a pedir LO QUE FALLÓ y limpia
 * el error (antes `error` no se limpiaba nunca y la única salida era un enlace).
 */

const CASE_VERSION_ID = 7;

function makeWorld(): SimulationWorldState {
  return {
    map: { key: 'hospital-sala-escucha', title: 'Sala de escucha' },
    objects: [], tools: [], inventory: [], usedToolKeys: [], inspectedObjectKeys: [], flags: {},
  } as unknown as SimulationWorldState;
}

function makeAttempt(overrides: Record<string, unknown> = {}): SimulationAttemptState {
  return {
    attemptId: 'attempt-1',
    caseVersionId: CASE_VERSION_ID,
    caseTitle: 'Caso demo',
    status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { id: 1, key: 'hospital-seguimiento', title: 'Título', narrative: '.', terminal: false, options: [] },
    completionReport: null,
    ...overrides,
  } as unknown as SimulationAttemptState;
}

const consentKey = (attempt: SimulationAttemptState) => `siep_case_consent_${attempt.caseVersionId}_${attempt.attemptId}`;
const httpError = (status: number) => new HttpErrorResponse({ status });

interface SetupOptions {
  caseVersionId?: string;
  active?: SimulationAttemptState | null;
  consent?: boolean;
  /** Dobles de SimulationService que sustituyen a los de partida. */
  sim?: Record<string, Mock>;
}

describe('SimulationPlayComponent: arranque y fallos con reintento (F6-1)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;

  function setup(options: SetupOptions = {}) {
    sessionStorage.clear();
    if (options.consent !== false) sessionStorage.setItem(consentKey(makeAttempt()), 'given');
    sim = {
      getActiveAttempt: vi.fn(() => of(options.active ?? null)),
      startAttempt: vi.fn(() => of(makeAttempt())),
      getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => of(makeWorld())),
      getScenarioConfig: vi.fn(() => throwError(() => new Error('sin escenario'))),
      resumeAttempt: vi.fn(() => of(makeAttempt())),
      safeExit: vi.fn(() => EMPTY),
      ...options.sim,
    };
    const audio = {
      init: vi.fn(), setScene: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
      dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        // El consentimiento de esta prueba vive en la pestaña (`sessionStorage`): el arranque es síncrono, sin servidor.
        { provide: CONSENT_RECORDER, useValue: new SessionConsentRecorder() },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: options.caseVersionId ?? String(CASE_VERSION_ID) }) } },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
  }

  afterEach(() => {
    component?.ngOnDestroy();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  // req: REGLA-004, BLOQUE-H
  describe('un fallo al cargar el mundo', () => {
    it('muestra el error con su código HTTP y reintentar vuelve a pedir el mundo y limpia el error', () => {
      setup({
        sim: {
          getWorld: vi.fn()
            .mockReturnValueOnce(throwError(() => httpError(0)))
            .mockReturnValue(of(makeWorld())),
        },
      });

      component.ngOnInit();

      expect(component.error()).toBe('No pudimos cargar el mapa del caso.');
      expect(component.errorStatus()).toBe(0);
      expect(component.errorKind()).toBe('network');
      expect(component.canRetry()).toBe(true);
      expect(component.loading()).toBe(false);

      component.retryFromError();

      expect(sim['getWorld']).toHaveBeenCalledTimes(2);
      expect(component.error()).toBe('');
      expect(component.errorStatus()).toBeNull();
      expect(component.world()).not.toBeNull();
      expect(component.loading()).toBe(false);
    });

    it('un segundo fallo vuelve a mostrar el error y conserva la posibilidad de reintentar', () => {
      setup({ sim: { getWorld: vi.fn(() => throwError(() => httpError(500))) } });

      component.ngOnInit();
      component.retryFromError();

      expect(component.error()).toBe('No pudimos cargar el mapa del caso.');
      expect(component.errorStatus()).toBe(500);
      expect(component.errorKind()).toBe('server');
      expect(component.canRetry()).toBe(true);
      expect(sim['getWorld']).toHaveBeenCalledTimes(2);
    });
  });

  describe('un fallo al iniciar o reanudar', () => {
    it('al iniciar, reintentar vuelve a pedir el intento con los mismos argumentos', () => {
      setup({
        sim: {
          startAttempt: vi.fn()
            .mockReturnValueOnce(throwError(() => httpError(500)))
            .mockReturnValue(of(makeAttempt())),
        },
      });

      component.ngOnInit();
      // Un 500 (o la red) no es un problema de permisos: el aviso no manda a revisarlos (hallazgo NVIDIA, 2026-11-16).
      expect(component.error()).toBe('No pudimos iniciar la simulación. Inténtalo de nuevo.');
      expect(component.error()).not.toContain('permisos');
      expect(component.canRetry()).toBe(true);

      component.retryFromError();

      expect(sim['startAttempt']).toHaveBeenCalledTimes(2);
      expect(sim['startAttempt']).toHaveBeenLastCalledWith(CASE_VERSION_ID, false, undefined);
      expect(component.error()).toBe('');
      expect(component.attempt()).not.toBeNull();
    });

    // req: RN-04, RF-15, decisión 12
    it('un 403 ACCESS_CLOSED al iniciar (o al empezar de nuevo) dice que el caso cerró, no «revisa tus permisos», y no ofrece reintentar', () => {
      const refusal = new HttpErrorResponse({
        status: 403, error: { success: false, code: 'ACCESS_CLOSED', message: 'El plazo de este caso ya terminó.', closesAt: '2026-10-05T23:59:00-05:00' },
      });
      setup({ sim: { startAttempt: vi.fn(() => throwError(() => refusal)) } });

      component.ngOnInit();

      expect(component.error()).toMatch(/^Ya cerró\. /);
      expect(component.error()).toContain('ya no se pueden iniciar intentos');
      expect(component.error()).not.toContain('Revisa tus permisos');
      expect(component.errorKind()).toBe('forbidden');
      expect(component.canRetry()).toBe(false);
    });

    it('un 403 ACCESS_NOT_YET_OPEN al iniciar dice desde cuándo se puede', () => {
      const refusal = new HttpErrorResponse({
        status: 403, error: { success: false, code: 'ACCESS_NOT_YET_OPEN', message: 'Este caso aún no está abierto.', opensAt: '2026-10-20T08:00:00-05:00' },
      });
      setup({ sim: { startAttempt: vi.fn(() => throwError(() => refusal)) } });

      component.ngOnInit();

      expect(component.error()).toMatch(/^Aún no abre\. /);
      expect(component.error()).toMatch(/20 de oct/);
    });

    it('un permiso negado se dice «sin permiso» (sin botón de reintento)', () => {
      setup({ sim: { startAttempt: vi.fn(() => throwError(() => httpError(403))) } });

      component.ngOnInit();

      expect(component.errorKind()).toBe('forbidden');
    });

    it('al reanudar, reintentar vuelve a pedir la reanudación del mismo intento', () => {
      setup({
        active: makeAttempt({ status: 'PAUSED' }),
        sim: {
          resumeAttempt: vi.fn()
            .mockReturnValueOnce(throwError(() => httpError(500)))
            .mockReturnValue(of(makeAttempt())),
        },
      });

      component.ngOnInit();
      component.resumeAttempt();
      expect(component.error()).toBe('No pudimos reanudar el intento.');

      component.retryFromError();

      expect(sim['resumeAttempt']).toHaveBeenCalledTimes(2);
      expect(component.error()).toBe('');
    });
  });

  describe('un caso que no existe', () => {
    it('no ofrece reintento: «no lo encontramos»', () => {
      setup({ caseVersionId: '0' });

      component.ngOnInit();

      expect(component.error()).toBe('Caso no encontrado.');
      expect(component.canRetry()).toBe(false);
      expect(component.errorKind()).toBe('not-found');
      expect(sim['getActiveAttempt']).not.toHaveBeenCalled();
    });
  });

  // req: REGLA-004, BLOQUE-H, RNF-04 (revisión de F6)
  describe('un lienzo que no pinta (watchdog de arranque)', () => {
    /** El anfitrión del mundo es un ViewChild que jsdom no monta: se le da un doble con lo único que se usa. */
    const attachWorld = () => {
      const retryLoad = vi.fn();
      (component as unknown as { gameWorld?: { retryLoad(): void } }).gameWorld = { retryLoad };
      return retryLoad;
    };

    it('«Reintentar» reinicia el lienzo y vuelve al indicador de arranque hasta el primer cuadro', () => {
      setup();
      component.ngOnInit();
      const retryLoad = attachWorld();
      component.onWorldBootFailed();
      expect(component.error()).toBe('No pudimos cargar el mapa del caso.');

      component.retryFromError();

      expect(retryLoad).toHaveBeenCalledTimes(1);
      expect(sim['getWorld']).toHaveBeenCalledTimes(1); // el mundo ya estaba pedido: lo colgado es Phaser, no la red
      expect(component.error()).toBe('');
      expect(component.worldRendered()).toBe(false);
      expect(component.loading()).toBe(false);
      expect(component.bootLoading()).toBe(true);
    });

    it('si el mundo pinta cuando el error ya se mostró, el error se retira', () => {
      setup();
      component.ngOnInit();
      component.onWorldBootFailed();
      expect(component.error()).not.toBe('');

      component.onWorldReady();

      expect(component.error()).toBe('');
      expect(component.errorStatus()).toBeNull();
      expect(component.worldRendered()).toBe(true);
      expect(component.bootLoading()).toBe(false);
    });

    it('un error de otro origen no lo retira un primer cuadro: solo el del propio arranque', () => {
      setup({ sim: { getWorld: vi.fn(() => throwError(() => httpError(500))) } });
      component.ngOnInit();
      expect(component.error()).not.toBe('');

      component.onWorldReady();

      expect(component.error()).not.toBe('');
    });
  });

  // req: BLOQUE-H, RNF-004
  describe('un solo indicador de arranque', () => {
    it('el arranque de un intento nuevo vuelve a mostrar el indicador hasta su primer cuadro (no hereda el del anterior)', () => {
      setup();
      component.ngOnInit();
      component.onWorldReady();
      expect(component.worldRendered()).toBe(true);
      expect(component.bootLoading()).toBe(false);

      // Lo que hace bootstrapAttempt para un intento sin consentimiento, y luego el aceptar: un arranque nuevo.
      component.worldStarted.set(false);
      (component as unknown as { startWorld(attempt: SimulationAttemptState): void })
        .startWorld(makeAttempt({ attemptId: 'attempt-2' }));

      expect(component.worldStarted()).toBe(true);
      expect(component.worldRendered()).toBe(false);
      expect(component.bootLoading()).toBe(true);
    });

    it('cubre el intento y el mundo hasta el primer cuadro con el MISMO indicador', () => {
      setup({ sim: { getWorld: vi.fn(() => EMPTY) } });

      // Antes de pedir nada: «Cargando el caso…».
      expect(component.bootLoading()).toBe(true);
      expect(component.bootLabel()).toBe('Cargando el caso…');

      component.ngOnInit();
      // Con el consentimiento dado el mundo se está pidiendo: cambia la etiqueta, no el indicador.
      expect(component.worldStarted()).toBe(true);
      expect(component.bootLoading()).toBe(true);
      expect(component.bootLabel()).toBe('Preparando la escena…');
    });

    it('termina con el primer cuadro del mundo', () => {
      setup();

      component.ngOnInit();
      // El mundo llegó (loading = false) pero todavía no se pintó el primer cuadro.
      expect(component.loading()).toBe(false);
      expect(component.bootLoading()).toBe(true);

      component.onWorldReady();

      expect(component.bootLoading()).toBe(false);
    });

    it('con un fallo no hay indicador: lo que se ve es el error', () => {
      setup({ sim: { getWorld: vi.fn(() => throwError(() => httpError(500))) } });

      component.ngOnInit();

      expect(component.error()).not.toBe('');
      expect(component.bootLoading()).toBe(false);
    });

    it('antes del consentimiento no hay indicador (el aviso es lo único en pantalla)', () => {
      setup({ consent: false });

      component.ngOnInit();

      expect(component.showContentWarning()).toBe(true);
      expect(component.bootLoading()).toBe(false);
    });
  });
});
