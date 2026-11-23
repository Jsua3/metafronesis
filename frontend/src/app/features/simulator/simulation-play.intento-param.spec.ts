// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta (mismo doble que el resto de specs de
// instancia del juego).
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

import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { EMPTY, Observable, Subject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { Mock } from 'vitest';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { SimulationAttemptState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent, UMBRAL_LENTO_MS } from './simulation-play.component';

/**
 * Cómo se entra al juego (DISENO §4.4; DP-12, DP-26) y el arranque como máquina de estados (hallazgo 7):
 * - `?intento=continuar` reanuda directo el intento abierto, sin el diálogo de reanudar;
 * - `?intento=nuevo` por URL ya no significa nada (una URL se repite desde el historial, un marcador u otra pestaña);
 * - el permiso de estado `reemplazar` reemplaza UNA vez y SOLO el `attemptId` que la persona aceptó perder;
 * - una respuesta de un arranque viejo se ignora, y «Volver a la ficha» desde un umbral lento no deja mundo ni audio.
 */
// req: RN-07, DP-26, REGLA-004, ETH-01
const CASE_VERSION_ID = 7;

function intento(overrides: Partial<SimulationAttemptState> = {}): SimulationAttemptState {
  return {
    attemptId: 'abierto-1', caseVersionId: CASE_VERSION_ID, caseTitle: 'Caso demo', status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { id: 1, key: 'n', title: 'Inicio', narrative: '.', terminal: false, options: [] },
    completionReport: null,
    ...overrides,
  } as unknown as SimulationAttemptState;
}

/** Corre los efectos pendientes (el temporizador de «lento» lo arma un effect). */
function correrEfectos(): void {
  const banco = TestBed as unknown as { tick?: () => void; flushEffects?: () => void };
  (banco.tick ?? banco.flushEffects)?.call(TestBed);
}

describe('SimulationPlayComponent: entrar al caso (intento por URL, permiso de reemplazo y arranque)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;
  let audio: Record<string, Mock>;
  let router: { navigate: Mock };
  let replaceState: Mock;

  function setup(options: { query?: Record<string, string>; state?: unknown; active?: () => Observable<SimulationAttemptState | null>; start?: () => Observable<SimulationAttemptState> } = {}) {
    sessionStorage.clear();
    // Con el consentimiento dado (lo registró la ficha), el arranque sigue sin el diálogo de respaldo.
    sessionStorage.setItem(`siep_case_consent_${CASE_VERSION_ID}_abierto-1`, 'given');
    sessionStorage.setItem(`siep_case_consent_${CASE_VERSION_ID}_nuevo-1`, 'given');
    window.history.replaceState(options.state ?? null, '');
    sim = {
      getActiveAttempt: vi.fn(options.active ?? (() => of(null))),
      startAttempt: vi.fn(options.start ?? (() => of(intento({ attemptId: 'nuevo-1' })))),
      resumeAttempt: vi.fn(() => of(intento())),
      getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => EMPTY),
      safeExit: vi.fn(() => EMPTY),
    };
    audio = {
      init: vi.fn(), setScene: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
      dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
    };
    router = { navigate: vi.fn() };
    replaceState = vi.fn((_ruta: string, _consulta: string, estado: unknown) => window.history.replaceState(estado, ''));
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        { provide: CONSENT_RECORDER, useValue: new SessionConsentRecorder() },
        { provide: Router, useValue: router },
        { provide: Location, useValue: { path: () => `/portal/simulador/${CASE_VERSION_ID}`, replaceState } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: String(CASE_VERSION_ID) }), queryParamMap: convertToParamMap(options.query ?? {}) } },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
  }

  afterEach(() => {
    component?.ngOnDestroy();
    sessionStorage.clear();
    window.history.replaceState(null, '');
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('?intento=continuar', () => {
    it('con un intento abierto lo reanuda directo, sin el diálogo «Continuar simulación formativa»', () => {
      setup({ query: { intento: 'continuar' }, active: () => of(intento()) });
      component.ngOnInit();
      expect(component.showResumePrompt()).toBe(false);
      expect(component.attempt()?.attemptId).toBe('abierto-1');
      expect(sim['startAttempt']).not.toHaveBeenCalled();
    });

    it('un intento en pausa se reanuda en el servidor (la misma transición explícita de siempre)', () => {
      setup({ query: { intento: 'continuar' }, active: () => of(intento({ status: 'PAUSED' })) });
      component.ngOnInit();
      expect(sim['resumeAttempt']).toHaveBeenCalledWith('abierto-1');
      expect(component.showResumePrompt()).toBe(false);
    });

    it('si ya no hay intento abierto, empieza uno sin reemplazar nada', () => {
      setup({ query: { intento: 'continuar' } });
      component.ngOnInit();
      expect(sim['startAttempt']).toHaveBeenCalledWith(CASE_VERSION_ID, false, undefined);
    });
  });

  describe('DP-26: reemplazar exige el permiso de un solo uso ligado a ESE intento', () => {
    // Control negativo: si `?intento=nuevo` volviera a reemplazar, un marcador borraría un intento sin consecuencia vista.
    it('?intento=nuevo por URL directa ya no significa nada: se ofrece reanudar', () => {
      setup({ query: { intento: 'nuevo' }, active: () => of(intento()) });
      component.ngOnInit();
      expect(component.showResumePrompt()).toBe(true);
      expect(sim['startAttempt']).not.toHaveBeenCalled();
    });

    it('sin parámetro ni permiso, el diálogo de reanudar de siempre', () => {
      setup({ active: () => of(intento()) });
      component.ngOnInit();
      expect(component.showResumePrompt()).toBe(true);
    });

    it('con el permiso del intento abierto, reemplaza UNA vez (forceNew) y borra el permiso en el acto', () => {
      setup({ state: { navigationId: 3, reemplazar: { attemptId: 'abierto-1' } }, active: () => of(intento()) });
      component.ngOnInit();
      expect(sim['startAttempt']).toHaveBeenCalledTimes(1);
      expect(sim['startAttempt']).toHaveBeenCalledWith(CASE_VERSION_ID, true, 'abierto-1');
      expect(replaceState).toHaveBeenCalledTimes(1);
      expect((window.history.state as { reemplazar?: unknown }).reemplazar).toBeUndefined();
      expect((window.history.state as { navigationId?: number }).navigationId).toBe(3);
    });

    it('recarga tras reemplazar: el estado ya no trae el permiso y no reemplaza otra vez', () => {
      setup({ state: { navigationId: 3, reemplazar: { attemptId: 'abierto-1' } }, active: () => of(intento()) });
      component.ngOnInit();
      const estadoTrasEntrar = window.history.state;
      component.ngOnDestroy();
      TestBed.resetTestingModule();
      // La recarga monta la pantalla otra vez con el estado que quedó (sin permiso) y el intento nuevo abierto.
      setup({ state: estadoTrasEntrar, active: () => of(intento({ attemptId: 'nuevo-1' })) });
      component.ngOnInit();
      expect(sim['startAttempt']).not.toHaveBeenCalled();
      expect(component.showResumePrompt()).toBe(true);
    });

    it('dos pestañas: la segunda ve OTRO intento abierto (la primera ya reemplazó) y no reemplaza: pide confirmar', () => {
      setup({ state: { reemplazar: { attemptId: 'abierto-1' } }, active: () => of(intento({ attemptId: 'nuevo-de-la-otra-pestana' })) });
      component.ngOnInit();
      expect(sim['startAttempt']).not.toHaveBeenCalled();
      expect(component.showResumePrompt()).toBe(true);
    });

    it('carrera: si el servidor responde 409 ATTEMPT_CHANGED no reintenta a ciegas, relee y vuelve a preguntar', () => {
      const lecturas = [intento(), intento({ attemptId: 'nuevo-de-la-otra-pestana' })];
      setup({
        state: { reemplazar: { attemptId: 'abierto-1' } },
        active: () => of(lecturas.shift() ?? null),
        start: () => throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'ATTEMPT_CHANGED' } })),
      });
      component.ngOnInit();
      expect(sim['startAttempt']).toHaveBeenCalledTimes(1);
      expect(sim['getActiveAttempt']).toHaveBeenCalledTimes(2);
      expect(component.error()).toBeFalsy();
      expect(component.showResumePrompt()).toBe(true);
      expect(component.pendingActiveAttempt()?.attemptId).toBe('nuevo-de-la-otra-pestana');
    });

    it('un permiso cuyo intento ya no está abierto no reemplaza nada: empieza uno con forceNew = false', () => {
      setup({ state: { reemplazar: { attemptId: 'abierto-1' } } });
      component.ngOnInit();
      expect(sim['startAttempt']).toHaveBeenCalledWith(CASE_VERSION_ID, false, undefined);
    });

    it('un permiso sin attemptId no reemplaza', () => {
      setup({ state: { reemplazar: {} }, active: () => of(intento()) });
      component.ngOnInit();
      expect(sim['startAttempt']).not.toHaveBeenCalled();
      expect(component.showResumePrompt()).toBe(true);
    });
  });

  describe('el umbral pinta desde el primer cuadro con lo que trajo la navegación', () => {
    it('título y portada del estado; sin estado, el título llega con el intento', () => {
      setup({ state: { umbral: { titulo: 'Caso de la ficha', portada: '/media/sala.png' } }, active: () => new Subject() });
      expect(component.umbralTitulo()).toBe('Caso de la ficha');
      expect(component.umbralDatos().portada).toBe('/media/sala.png');
      expect(component.umbralVisible()).toBe(true);
      expect(component.umbralFase()).toBe('intento');
    });

    it('sin estado no inventa nada hasta que llega el intento', () => {
      setup({ active: () => new Subject() });
      component.ngOnInit();
      expect(component.umbralTitulo()).toBeNull();
      expect(component.umbralDatos().portada).toBeNull();
    });
  });

  describe('el arranque como máquina de estados', () => {
    it('una respuesta de un arranque viejo se ignora (un reintento nunca se cruza con la respuesta lenta del anterior)', () => {
      const lenta = new Subject<SimulationAttemptState>();
      const rapida = new Subject<SimulationAttemptState>();
      const respuestas = [lenta, rapida];
      setup({ start: () => respuestas.shift()! });
      component.ngOnInit();          // arranque 1: startAttempt (lenta)
      component.startNewAttempt();   // arranque 2: otro startAttempt (rapida)
      rapida.next(intento({ attemptId: 'nuevo-1' }));
      lenta.next(intento({ attemptId: 'viejo' }));
      expect(component.attempt()?.attemptId).toBe('nuevo-1');
    });

    it('pasados 10 s cargando, el umbral se vuelve lento; «Volver a la ficha» no deja mundo ni audio vivos', () => {
      vi.useFakeTimers();
      const pendiente = new Subject<SimulationAttemptState>();
      setup({ start: () => pendiente });
      correrEfectos();
      component.ngOnInit();
      correrEfectos();
      vi.advanceTimersByTime(UMBRAL_LENTO_MS + 10);
      expect(component.umbralLento()).toBe(true);
      component.volverDesdeUmbral();
      expect(router.navigate).toHaveBeenCalledWith(['/portal/simulador', CASE_VERSION_ID, 'ficha']);
      component.ngOnDestroy();
      pendiente.next(intento({ attemptId: 'nuevo-1' }));
      expect(component.attempt()).toBeNull();
      expect(audio['init']).not.toHaveBeenCalled();
      expect(sim['getWorld']).not.toHaveBeenCalled();
    });
  });
});
