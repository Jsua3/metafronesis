// Phaser inicializa un canvas WebGL al importarse (jsdom no lo soporta): solo se evalúa `extends Phaser.Scene`.
vi.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    Game: class { destroy(): void {} },
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Math: { Clamp: (value: number) => value },
    Input: { Keyboard: { JustDown: () => false } },
  },
}));

import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { EMPTY, of, throwError } from 'rxjs';
import type { Mock } from 'vitest';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { RehearsalApi } from '../../core/api/rehearsal.api';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { MapObjectState, RehearsalBlock, RehearsalStart, SimulationWorldState } from '../../core/models/simulation.model';
import { AvatarStore } from '../character/avatar.store';
import { KitService } from '../character/kit/kit.service';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { RehearsalPanelComponent } from './rehearsal-panel.component';
import { SimulationPlayComponent } from './simulation-play.component';

/**
 * El modo ensayo de la pantalla del juego (bloque B, tarea 23): la docente juega su borrador por las rutas normales, sin
 * consentimiento ni introducción, y un ensayo descartado (403 en las rutas del juego, 404 en las del panel) se dice con
 * «Empezar de nuevo» en vez de un error genérico.
 */
const BLOQUE = {
  sceneId: 33, options: [], comments: [], warnings: [], persona: { bond: 'GUARDED', activation: 'TENSE', label: 'x' },
  milestones: [], path: [], explored: { talked: [], inspected: [], has: [], used: [] }, explorable: [], scenes: [],
} as unknown as RehearsalBlock;

const INICIO = {
  attemptId: 'ens-1', caseVersionId: 9, caseTitle: 'Caso', status: 'IN_PROGRESS',
  persona: { bond: 'GUARDED', activation: 'TENSE', label: 'x' },
  currentNode: { id: 33, key: 'n', title: 'T', narrative: 'N', terminal: false, options: [] },
  completionReport: null, rehearsal: BLOQUE,
} as unknown as RehearsalStart;

const OBJETO = { key: 'carpeta', type: 'OBJECT', label: 'Carpeta', metadata: {} } as unknown as MapObjectState;
const MUNDO = {
  map: { key: 'sala', title: 'Sala' }, objects: [OBJETO], tools: [], inventory: [], usedToolKeys: [], inspectedObjectKeys: [], flags: {},
} as unknown as SimulationWorldState;
const gone = () => new HttpErrorResponse({ status: 404, error: { code: 'REHEARSAL_GONE' } });

interface Opciones { data?: Record<string, unknown>; params?: Record<string, string>; query?: Record<string, string> }

describe('SimulationPlayComponent: modo ensayo (tarea 23)', () => {
  let fixture: ComponentFixture<SimulationPlayComponent>;
  let service: Record<string, Mock>;
  let rehearsalApi: Record<string, Mock>;
  let el: HTMLElement;
  const component = () => fixture.componentInstance;

  function montar(opciones: Opciones = {}) {
    sessionStorage.clear();
    service = {
      getActiveAttempt: vi.fn(() => EMPTY), startAttempt: vi.fn(() => EMPTY), getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => EMPTY), getAttempt: vi.fn(() => EMPTY), safeExit: vi.fn(() => EMPTY), openInteraction: vi.fn(() => EMPTY),
      updateWorldState: vi.fn(() => EMPTY), studentReport: vi.fn(() => EMPTY),
    };
    rehearsalApi = { start: vi.fn(() => of(INICIO)), read: vi.fn(() => of(BLOQUE)), adjust: vi.fn(() => EMPTY) };
    const audio = {
      init: vi.fn(), setScene: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
      dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        provideRouter([]),
        { provide: SimulationService, useValue: service },
        { provide: RehearsalApi, useValue: rehearsalApi },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        { provide: KitService, useValue: fakeKitService() },
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: CONSENT_RECORDER, useValue: new SessionConsentRecorder() },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: opciones.data ?? { mode: 'rehearsal' },
              paramMap: convertToParamMap(opciones.params ?? { caseVersionId: '9' }),
              queryParamMap: convertToParamMap(opciones.query ?? {}),
            },
          },
        },
      ],
    });
    TestBed.inject(LiveRegionAnnouncer);
    fixture = TestBed.createComponent(SimulationPlayComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('en ensayo arranca con POST rehearsal en la escena pedida, sin consentimiento ni introducción', () => {
    montar({ query: { desde: '33' } });
    expect(rehearsalApi['start']).toHaveBeenCalledWith(9, 33);
    expect(service['getActiveAttempt']).not.toHaveBeenCalled();
    expect(service['startAttempt']).not.toHaveBeenCalled();
    expect(component().showContentWarning()).toBe(false);
    expect(component().showCaseIntro()).toBe(false);
    expect(component().mode()).toBe('rehearsal');
    expect(component().rehearsal()).toBe(BLOQUE);
    expect(service['getWorld']).toHaveBeenCalledWith('ens-1');
    expect(el.querySelector('.game-container')!.getAttribute('data-rehearsal')).toBe('true');
    expect(el.textContent).toContain('Ensayo del borrador: nada de esto cuenta para estudiantes ni informes.');
  });

  it('sin «desde» empieza en la escena de inicio y no guarda el token del ensayo en la pestaña', () => {
    montar();
    expect(rehearsalApi['start']).toHaveBeenCalledWith(9, null);
    expect(sessionStorage.getItem('siep_attempt_9')).toBeNull();
  });

  it('el modo estudiante no cambia: sin data-rehearsal y sin POST rehearsal', () => {
    montar({ data: {} });
    expect(rehearsalApi['start']).not.toHaveBeenCalled();
    expect(service['getActiveAttempt']).toHaveBeenCalledWith(9);
    expect(el.querySelector('.game-container')!.hasAttribute('data-rehearsal')).toBe(false);
  });

  it('un 403 del juego en ensayo que resulta REHEARSAL_GONE muestra «ya no existe» con «Empezar de nuevo»', () => {
    montar();
    rehearsalApi['read'].mockReturnValue(throwError(() => gone()));
    service['openInteraction'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    component().openInteraction(OBJETO);
    expect(rehearsalApi['read']).toHaveBeenCalledWith(9, 'ens-1');
    expect(component().rehearsalGone()).toBe(true);
    fixture.detectChanges();
    expect(el.textContent).toContain('Este ensayo ya no existe');
    expect(el.querySelector('a[href="/portal/casos/9/editor"]')).not.toBeNull();
    (el.querySelector('button.restart') as HTMLButtonElement).click();
    expect(rehearsalApi['start']).toHaveBeenCalledTimes(2);
    expect(rehearsalApi['start']).toHaveBeenLastCalledWith(9, 33);   // la escena en la que estaba
    expect(component().rehearsalGone()).toBe(false);
  });

  it('un 404 sin el código REHEARSAL_GONE no es un ensayo perdido', () => {
    montar();
    service['openInteraction'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    rehearsalApi['read'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    component().openInteraction(OBJETO);
    expect(component().rehearsalGone()).toBe(false);
  });

  it('un 403 con el ensayo vivo es un permiso y sigue su camino (no «ya no existe»)', () => {
    montar();
    service['openInteraction'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    component().openInteraction(OBJETO);
    expect(rehearsalApi['read']).toHaveBeenCalled();
    expect(component().rehearsalGone()).toBe(false);
  });

  it('en modo estudiante un 403 no consulta el ensayo', () => {
    montar({ data: {} });
    component().attempt.set({ ...INICIO, rehearsal: undefined } as never);
    service['openInteraction'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    component().openInteraction(OBJETO);
    expect(rehearsalApi['read']).not.toHaveBeenCalled();
    expect(component().rehearsalGone()).toBe(false);
  });

  it('un 403 al cargar el mundo del ensayo que resulta perdido no es «No pudimos cargar el mapa»', () => {
    montar();
    rehearsalApi['read'].mockReturnValue(throwError(() => gone()));
    service['getAttempt'].mockReturnValue(of(INICIO));
    service['getWorld'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    component().reloadRehearsal(BLOQUE);
    expect(component().rehearsalGone()).toBe(true);
    expect(component().error()).toBe('');
  });

  it('reloadRehearsal guarda el bloque y relee el juego con el mismo token', () => {
    montar();
    const nuevo = { ...BLOQUE, sceneId: 40 } as RehearsalBlock;
    const intento = { ...INICIO, rehearsal: undefined, currentNode: { ...INICIO.currentNode, id: 40 } };
    service['getAttempt'].mockReturnValue(of(intento));
    service['getWorld'].mockClear();
    component().reloadRehearsal(nuevo);
    expect(component().rehearsal()).toBe(nuevo);
    expect(service['getAttempt']).toHaveBeenCalledWith('ens-1');
    expect(service['getWorld']).toHaveBeenCalledWith('ens-1');
    expect(component().attempt()!.currentNode.id).toBe(40);
  });

  it('el panel de autora se monta a un lado del juego solo en ensayo y sus salidas llegan a la pantalla', () => {
    montar();
    const panel = fixture.debugElement.query(By.directive(RehearsalPanelComponent));
    expect(panel).not.toBeNull();
    expect(panel.componentInstance.caseVersionId()).toBe(9);
    expect(panel.componentInstance.attemptId()).toBe('ens-1');
    const nuevo = { ...BLOQUE, sceneId: 40 } as RehearsalBlock;
    service['getAttempt'].mockReturnValue(of({ ...INICIO, rehearsal: undefined }));
    panel.componentInstance.adjusted.emit(nuevo);
    expect(component().rehearsal()).toBe(nuevo);
    panel.componentInstance.gone.emit('closed');
    expect(component().rehearsalGone()).toBe(true);
    fixture.detectChanges();
    expect(el.textContent).toContain('Este ensayo ya terminó');
    fixture.destroy();
    TestBed.resetTestingModule();

    montar({ data: {} });
    component().attempt.set({ ...INICIO, rehearsal: undefined } as never);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(RehearsalPanelComponent))).toBeNull();
  });

  describe('con el ensayo perdido (REGLA-004)', () => {
    const perder = () => { montar(); component().showRehearsalGone(); fixture.detectChanges(); };

    it('la cabecera y el pie NO quedan inertes ni ocultos al lector, y «Salida segura» está habilitada', () => {
      perder();
      for (const selector of ['.top-bar', '.bottom-zone']) {
        const zona = el.querySelector(selector)!;
        expect(zona.hasAttribute('inert'), selector).toBe(false);
        expect(zona.hasAttribute('aria-hidden'), selector).toBe(false);
      }
      const salida = el.querySelector('.bottom-zone app-safe-exit-button button') as HTMLButtonElement;
      expect(salida).not.toBeNull();
      expect(salida.disabled).toBe(false);
      expect(component().inputBlocked()).toBe(false);
    });

    it('el mundo queda congelado, inerte y sin el panel de autora; las teclas del mundo no hacen nada', () => {
      perder();
      expect(component().worldMotionPaused()).toBe(true);
      expect(el.querySelector('.canvas-zone')!.hasAttribute('inert')).toBe(true);
      expect(el.querySelector('app-rehearsal-panel')).toBeNull();
      component().nearbyInteraction.set(OBJETO);
      service['openInteraction'].mockClear();
      component().handleGlobalInteraction(new KeyboardEvent('keydown', { key: 'e', cancelable: true }));
      expect(service['openInteraction']).not.toHaveBeenCalled();
    });

    it('Esc y «Salida segura» llevan al editor sin pedir la pausa al servidor ni repetir el aviso', () => {
      perder();
      const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      rehearsalApi['read'].mockClear();
      component().handleGlobalInteraction(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
      expect(navegar).toHaveBeenCalledWith(['/portal/casos', 9, 'editor']);
      (el.querySelector('.bottom-zone app-safe-exit-button button') as HTMLButtonElement).click();
      expect(navegar).toHaveBeenCalledTimes(2);
      expect(service['safeExit']).not.toHaveBeenCalled();
      expect(rehearsalApi['read']).not.toHaveBeenCalled();
    });

    it('Esc saca a la persona aunque el estado local ya no sea IN_PROGRESS (409 tras terminar)', () => {
      for (const status of ['COMPLETED', 'PAUSED'] as const) {
        perder();
        component().attempt.set({ ...INICIO, status } as never);
        const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
        const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
        component().handleGlobalInteraction(esc);
        expect(navegar, status).toHaveBeenCalledWith(['/portal/casos', 9, 'editor']);
        expect(esc.defaultPrevented, status).toBe(true);
        fixture.destroy();
        TestBed.resetTestingModule();
      }
    });

    it('si el intento no trae caseVersionId, la salida usa el de la ruta', () => {
      perder();
      component().attempt.set({ ...INICIO, caseVersionId: undefined } as never);
      const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      component().pauseFromOverlay();
      expect(navegar).toHaveBeenCalledWith(['/portal/casos', 9, 'editor']);
    });

    it('«Empezar de nuevo» sin id de caso en la ruta no abre nada', () => {
      montar({ params: {} });
      rehearsalApi['start'].mockClear();
      component().restartRehearsalHere();
      expect(rehearsalApi['start']).not.toHaveBeenCalled();
    });

    it('se anuncia una sola vez, por el anunciador, y el aviso no es un role=alert', () => {
      montar();
      const anunciar = vi.spyOn(TestBed.inject(LiveRegionAnnouncer), 'announce');
      component().showRehearsalGone();
      fixture.detectChanges();
      expect(anunciar).toHaveBeenCalledTimes(1);
      expect(el.querySelector('app-rehearsal-gone [role="alert"]')).toBeNull();
    });
  });

  it('un 409 REHEARSAL_CLOSED al confirmar dice que el ensayo ya terminó, con «Empezar de nuevo»', () => {
    montar();
    service['openInteraction'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    rehearsalApi['read'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'REHEARSAL_CLOSED' } })));
    component().openInteraction(OBJETO);
    fixture.detectChanges();
    expect(component().rehearsalGone()).toBe(true);
    expect(el.textContent).toContain('Este ensayo ya terminó');
    (el.querySelector('button.restart') as HTMLButtonElement).click();
    expect(rehearsalApi['start']).toHaveBeenCalledTimes(2);
  });

  it('un 400 con «desde» reintenta desde el inicio, y los fallos de abrir y recargar usan los textos del borrador', () => {
    montar({ query: { desde: '33' } });
    rehearsalApi['start'].mockReset();
    rehearsalApi['start'].mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 400 }))).mockReturnValue(of(INICIO));
    component().restartRehearsalHere();
    expect(rehearsalApi['start']).toHaveBeenNthCalledWith(1, 9, 33);
    expect(rehearsalApi['start']).toHaveBeenNthCalledWith(2, 9, null);
    rehearsalApi['start'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    component().restartRehearsalHere();
    expect(component().error()).toBe('No pudimos abrir el ensayo.');
    service['getAttempt'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    component().error.set('');
    component().reloadRehearsal(BLOQUE);
    expect(component().error()).toBe('No pudimos recargar el ensayo.');
  });

  it('reloadRehearsal cierra lo abierto (bitácora, selección) y marca ocupado mientras relee', () => {
    montar();
    component().journalOpen.set(true);
    component().selectedInteraction.set(OBJETO);
    component().reloadRehearsal(BLOQUE);   // getAttempt devuelve EMPTY: queda en vuelo
    expect(component().journalOpen()).toBe(false);
    expect(component().selectedInteraction()).toBeNull();
    expect(component().busy()).toBe(true);
  });
});
