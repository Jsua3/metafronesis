import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { CaseAccessCache } from '../../core/api/case-access.cache';
import { SimulationService } from '../../core/api/simulation.service';
import { CaseAccess, CaseBrief, SimulationAttemptState, StudentAttemptSummary } from '../../core/models/simulation.model';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { KitService } from '../character/kit/kit.service';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { CaseBriefComponent } from './case-brief.component';
import { CONSENT_RECORDER, ConsentNoticeStaleError, ConsentRecorder } from './consent-recorder';
import { CONTENT_NOTICE_TEXT, DRAFT_COPY } from './draft-copy';

function brief(partial: Partial<CaseBrief> = {}): CaseBrief {
  return {
    caseVersionId: 7,
    title: 'Primer contacto en urgencias',
    context: 'Una joven llega a urgencias acompañada de su abuela después de un episodio de violencia.',
    characters: [
      { id: 1, displayName: 'Enfermera de urgencias', roleLabel: 'Personal de salud', portraitKey: 'enfermera-urgencias' },
      { id: 2, displayName: 'Abuela de la niña', roleLabel: 'Familiar acompañante', portraitKey: 'familia-duelo' },
    ],
    learningObjectives: ['Reconocer señales de riesgo en el primer contacto.', 'Practicar una escucha que no revictimiza.'],
    hasSensitiveContent: true,
    access: { allowed: true },
    escenas: 5,
    inicio: { escena: 'Llegada', lugar: 'la sala de urgencias' },
    portada: null,
    temasSensibles: ['Violencia de pareja'],
    conRubrica: true,
    ...partial,
  };
}

function abierto(partial: Partial<SimulationAttemptState> = {}): SimulationAttemptState {
  return {
    attemptId: 'intento-abierto', caseVersionId: 7, caseTitle: 'Primer contacto en urgencias', status: 'IN_PROGRESS',
    currentNode: { id: 3, key: 'k', title: 'Sala de espera', narrative: '', terminal: false, options: [] },
    ...partial,
  } as unknown as SimulationAttemptState;
}

const failure = (status: number, code?: string) => throwError(() => ({ status, error: code ? { code } : null }));

interface Api {
  getCaseBrief: (caseVersionId: number) => Observable<CaseBrief>;
  startAttempt?: (caseVersionId: number, forceNew?: boolean) => Observable<unknown>;
  getActiveAttempt?: (caseVersionId: number) => Observable<SimulationAttemptState | null>;
  attemptHistory?: () => Observable<StudentAttemptSummary[]>;
}

/**
 * La ficha del caso antes de jugar (DISENO §4.3, DP-08; RF-16, CU-07, C8). Es una lectura: nunca crea el intento
 * (RN-07). El aviso de contenido va ANTES del contexto, «Comenzar» registra el consentimiento (ETH-01) y SOLO entonces
 * navega; con un intento abierto, «Continuar donde quedaste» y «Empezar de nuevo» (con su consecuencia y DP-26).
 */
// req: RF-16, CU-07, RNF-04, ETH-01, RN-07, BLOQUE-H
describe('CaseBriefComponent', () => {
  let fixture: ComponentFixture<CaseBriefComponent>;
  let navigate: ReturnType<typeof vi.fn>;
  let consent: { isGivenForCase: ReturnType<typeof vi.fn>; recordForCase: ReturnType<typeof vi.fn>; prime: ReturnType<typeof vi.fn>; isGiven: () => boolean; record: () => Promise<void> };
  let consequence: ReturnType<typeof vi.fn>;
  let announce: ReturnType<typeof vi.fn>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  // Lo que oye un lector de pantalla: sin los iconos ni el motivo oculto del botón deshabilitado.
  const spoken = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll('[aria-hidden="true"], [hidden]').forEach(node => node.remove());
    return text(copy);
  };
  const button = (name: string) => [...host().querySelectorAll('button, a')].find(el => spoken(el) === name) as HTMLElement | undefined;
  const h2s = () => [...host().querySelectorAll('h2')].map(text);

  async function render(api: Partial<Api> = {}, access?: CaseAccess, opciones: { dado?: boolean; respuesta?: 'proceed' | 'continue' } = {}) {
    const service: Api = {
      getCaseBrief: () => of(brief(access ? { access } : {})),
      startAttempt: vi.fn(() => of({})),
      getActiveAttempt: vi.fn(() => of(null)),
      attemptHistory: vi.fn(() => of([])),
      ...api,
    };
    let dado = opciones.dado ?? false;
    consent = {
      isGivenForCase: vi.fn(() => dado),
      recordForCase: vi.fn(async () => { dado = true; }),
      prime: vi.fn(() => Promise.resolve()),
      isGiven: () => dado,
      record: () => Promise.resolve(),
    };
    consequence = vi.fn(() => Promise.resolve(opciones.respuesta ?? 'continue'));
    announce = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: SimulationService, useValue: service },
        { provide: KitService, useValue: fakeKitService() },
        { provide: CONSENT_RECORDER, useValue: consent as unknown as ConsentRecorder },
        { provide: CaseAccessCache, useValue: { intentoAbierto: () => undefined, guardandoIntentoAbierto: () => (fuente: Observable<unknown>) => fuente } },
        { provide: UiDialog, useValue: { consequence } },
        { provide: LiveRegionAnnouncer, useValue: { announce } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: '7' }) } } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
    fixture = TestBed.createComponent(CaseBriefComponent);
    await fixture.whenStable();
    return service;
  }

  beforeEach(() => {
    // La precarga del juego (DP-11) importaría Phaser en jsdom: aquí no se descarga nada.
    vi.stubGlobal('requestIdleCallback', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('muestra la ficha sin crear intento: título, meta, contexto, objetivos y personajes', async () => {
    const service = await render();
    expect(host().querySelectorAll('h1')).toHaveLength(1);
    expect(text(host().querySelector('h1'))).toBe('Primer contacto en urgencias');
    expect(text(host())).toContain('5 escenas · Empiezas en la sala de urgencias · Puedes pausar cuando quieras');
    expect(text(host())).toContain('Una joven llega a urgencias');
    expect([...host().querySelectorAll('.brief-objective')].map(text)).toEqual([
      'Reconocer señales de riesgo en el primer contacto.', 'Practicar una escucha que no revictimiza.',
    ]);
    expect([...host().querySelectorAll('.brief-character h3')].map(text)).toEqual(['Enfermera de urgencias', 'Abuela de la niña']);
    expect(service.startAttempt).not.toHaveBeenCalled();
  });

  // Criterio (1) de B4b: el orden ES la decisión de cuidado.
  it('el aviso de contenido va ANTES del contexto, y el contexto antes de los personajes', async () => {
    await render();
    expect(h2s()).toEqual(['Antes de leer', 'Qué vas a practicar', 'Cómo funciona esta práctica', 'Contexto', 'Quiénes aparecen', 'Tu entrada']);
    const aviso = host().querySelector('#aviso')!;
    const contexto = host().querySelector('.brief-context')!;
    expect(aviso.compareDocumentPosition(contexto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Leer el aviso coloca el foco en el aviso sin salir de la ficha', async () => {
    await render();
    const enlace = host().querySelector<HTMLAnchorElement>('a[href="#aviso"]')!;
    const aviso = host().querySelector<HTMLElement>('#aviso')!;
    enlace.click();
    expect(document.activeElement).toBe(aviso);
  });

  it('el aviso es el MISMO texto validado del juego, con los temas que el caso declara y el alcance como nota', async () => {
    await render();
    const aviso = host().querySelector('#aviso')!;
    expect(text(aviso)).toContain(CONTENT_NOTICE_TEXT.contenido);
    expect(text(aviso)).toContain(CONTENT_NOTICE_TEXT.salida);
    expect([...aviso.querySelectorAll('.ficha__temas li')].map(text)).toEqual(['Violencia de pareja']);
    expect(aviso.querySelector('ui-scope-notice')).not.toBeNull();
  });

  it('«Cómo funciona»: el contrato de ficción, la rúbrica solo si la hay y el sonido antes de entrar', async () => {
    await render();
    expect(text(host())).toContain(DRAFT_COPY.briefFictionContract.text);
    expect(text(host())).toContain(DRAFT_COPY.briefFictionRubric.text);
    expect(text(host())).toContain(DRAFT_COPY.briefSound.text);
    TestBed.resetTestingModule();
    await render({ getCaseBrief: () => of(brief({ conRubrica: false })) });
    expect(text(host())).not.toContain(DRAFT_COPY.briefFictionRubric.text);
  });

  it('cada personaje trae su retrato del kit (decorativo) y su rol en palabras', async () => {
    await render();
    const portraits = [...host().querySelectorAll('.brief-character app-kit-figure')];
    expect(portraits).toHaveLength(2);
    expect(portraits.map(el => el.querySelector('.kit-figure')?.getAttribute('aria-hidden'))).toEqual(['true', 'true']);
    expect([...host().querySelectorAll('.brief-character__role')].map(text)).toEqual(['Personal de salud', 'Familiar acompañante']);
  });

  it('«Tu entrada» lleva la portada que viaja al umbral, el estado y la seguridad', async () => {
    await render();
    const entrada = host().querySelector('aside.ficha__lateral')!;
    expect(entrada.querySelector('ui-portada-caso')?.classList).toContain('vt-portada');
    expect(text(entrada)).toContain('Sin empezar');
    expect(text(entrada)).toContain('Salida segura (Esc) pausa el caso');
    expect(text(entrada)).toContain(DRAFT_COPY.supportResourcesPending.text);
    expect(entrada.querySelector('a[href="#aviso"]')).not.toBeNull();
    expect(button('Volver a tus casos')?.getAttribute('href')).toBe('/portal/simulador');
  });

  // Criterio (2): registra y luego navega; nunca crea el intento.
  it('«Comenzar» registra el consentimiento y SOLO después navega al juego, con los datos del umbral', async () => {
    const service = await render();
    button('Comenzar')!.click();
    await fixture.whenStable();
    expect(consent.recordForCase).toHaveBeenCalledWith(7);
    expect(consent.recordForCase.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]);
    expect(navigate).toHaveBeenCalledWith(['/portal/simulador', 7], { state: { umbral: { titulo: 'Primer contacto en urgencias', portada: null } } });
    expect(service.startAttempt).not.toHaveBeenCalled();
  });

  it('si la ficha se cierra mientras se registra el consentimiento, no lleva al juego al resolverse (B4b, 7)', async () => {
    await render();
    let terminar: () => void = () => undefined;
    consent.recordForCase.mockImplementation(() => new Promise<void>(resolver => { terminar = resolver; }));
    button('Comenzar')!.click();
    fixture.destroy();
    terminar();
    await Promise.resolve();
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('con el consentimiento ya dado no lo vuelve a registrar ni muestra la línea de consentimiento', async () => {
    await render({}, undefined, { dado: true });
    expect(text(host())).not.toContain('confirmas que leíste el aviso');
    button('Comenzar')!.click();
    await fixture.whenStable();
    expect(consent.recordForCase).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalled();
  });

  it('una doble pulsación no registra ni navega dos veces', async () => {
    await render();
    let terminar!: () => void;
    consent.recordForCase.mockImplementation(() => new Promise<void>(resolve => { terminar = resolve; }));
    button('Comenzar')!.click();
    button('Comenzar')!.click();
    await fixture.whenStable();
    expect(consent.recordForCase).toHaveBeenCalledTimes(1);
    expect(button('Comenzar')!.getAttribute('aria-busy')).toBe('true');
    terminar();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  // Control negativo (mutación: navegar en `finally`): un consentimiento que no se registró NUNCA deja entrar.
  it('si el registro falla no navega: lo dice (por el anunciador) y ofrece «Reintentar», que lo vuelve a intentar', async () => {
    await render();
    consent.recordForCase.mockRejectedValueOnce(new Error('red'));
    button('Comenzar')!.click();
    await fixture.whenStable();
    expect(navigate).not.toHaveBeenCalled();
    expect(text(host().querySelector('.ficha__error'))).toContain(DRAFT_COPY.briefConsentError.text);
    expect(host().querySelector('.ficha__error')!.getAttribute('role')).toBeNull();
    expect(announce).toHaveBeenCalledWith(DRAFT_COPY.briefConsentError.text, 'assertive');
    button('Reintentar')!.click();
    await fixture.whenStable();
    expect(consent.recordForCase).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('un 409 (el aviso cambió) dice que hay que recargar y ofrece «Recargar», sin navegar', async () => {
    await render();
    consent.recordForCase.mockRejectedValueOnce(new ConsentNoticeStaleError('otra'));
    button('Comenzar')!.click();
    await fixture.whenStable();
    expect(text(host().querySelector('.ficha__error'))).toContain(DRAFT_COPY.briefConsentStale.text);
    expect(button('Recargar')).toBeDefined();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('con un intento abierto: «Continuar donde quedaste» va directo con ?intento=continuar', async () => {
    await render({ getActiveAttempt: () => of(abierto({ status: 'PAUSED' })) });
    expect(text(host().querySelector('.ficha__estado'))).toContain('Intento en pausa');
    expect(text(host().querySelector('.ficha__estado'))).toContain('Sala de espera');
    expect(button('Comenzar')).toBeUndefined();
    button('Continuar donde quedaste')!.click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/portal/simulador', 7], expect.objectContaining({ queryParams: { intento: 'continuar' } }));
  });

  // DP-26: el reemplazo viaja como permiso de un solo uso ligado al intento visto, NUNCA en la URL.
  it('«Empezar de nuevo» confirma la pérdida (RN-07) y entra con el permiso ligado a ESE intento, sin parámetro', async () => {
    await render({ getActiveAttempt: () => of(abierto()) }, undefined, { respuesta: 'proceed' });
    button('Empezar de nuevo')!.click();
    await fixture.whenStable();
    expect(consequence).toHaveBeenCalledWith(expect.objectContaining({
      title: DRAFT_COPY.newAttemptConsequence.title, consequence: DRAFT_COPY.newAttemptConsequence.text, proceedLabel: 'Iniciar nuevo intento',
    }));
    const [ruta, extras] = navigate.mock.calls[0];
    expect(ruta).toEqual(['/portal/simulador', 7]);
    expect(extras.queryParams).toBeUndefined();
    expect(extras.state.reemplazar).toEqual({ attemptId: 'intento-abierto' });
  });

  it('«Empezar de nuevo» con «Continuar» en la consecuencia no navega ni registra nada', async () => {
    await render({ getActiveAttempt: () => of(abierto()) }, undefined, { respuesta: 'continue' });
    button('Empezar de nuevo')!.click();
    await fixture.whenStable();
    expect(navigate).not.toHaveBeenCalled();
    expect(consent.recordForCase).not.toHaveBeenCalled();
  });

  it('un caso terminado ofrece «Ver tu recorrido» hacia la página del cierre', async () => {
    await render({ attemptHistory: () => of([
      { attemptId: 'viejo', caseVersionId: 7, status: 'COMPLETED', startedAt: '2026-11-01', endedAt: '2026-11-01' },
      { attemptId: 'nuevo', caseVersionId: 7, status: 'COMPLETED', startedAt: '2026-11-10', endedAt: '2026-11-10' },
      { attemptId: 'otro-caso', caseVersionId: 8, status: 'COMPLETED', startedAt: '2026-11-12', endedAt: '2026-11-12' },
    ] as StudentAttemptSummary[]) });
    expect(text(host().querySelector('.ficha__estado'))).toContain('Ya lo terminaste');
    expect(button('Ver tu recorrido')?.getAttribute('href')).toBe('/portal/simulador/7/cierre/nuevo');
  });

  it('mientras el intento abierto no se sabe, ofrece Comenzar (el juego ofrece reanudar si lo había)', async () => {
    const pendiente = new Subject<SimulationAttemptState | null>();
    await render({ getActiveAttempt: () => pendiente });
    expect(button('Comenzar')).toBeDefined();
    pendiente.next(abierto());
    await fixture.whenStable();
    expect(button('Continuar donde quedaste')).toBeDefined();
  });

  it('sin objetivos ni personajes no pinta secciones vacías y dice que falta lo demás', async () => {
    await render({ getCaseBrief: () => of(brief({ characters: [], learningObjectives: [] })) });
    expect(h2s()).toEqual(['Antes de leer', 'Cómo funciona esta práctica', 'Contexto', 'Tu entrada']);
    expect(text(host().querySelector('.brief-pending'))).toContain('Tu docente aún no ha redactado');
    expect(button('Comenzar')!.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('un caso que aún no abre deja «Comenzar» deshabilitado con su motivo, que dice cuándo abre', async () => {
    await render({}, { allowed: false, reason: 'NOT_YET_OPEN', opensAt: '2026-10-20T08:00:00' });
    const start = button('Comenzar')!;
    expect(start.getAttribute('aria-disabled')).toBe('true');
    const reason = document.getElementById(start.getAttribute('aria-describedby')!.split(' ').find(id => document.getElementById(id))!);
    expect(text(reason)).toMatch(/20 de oct/);
    expect(text(host().querySelector('.ficha__acceso'))).toContain('Aún no abre');
    start.click();
    await fixture.whenStable();
    expect(navigate).not.toHaveBeenCalled();
    expect(consent.recordForCase).not.toHaveBeenCalled();
  });

  it('un caso cerrado o bloqueado por la secuencia también explica por qué no se puede comenzar', async () => {
    await render({}, { allowed: false, reason: 'CLOSED', closesAt: '2026-10-05T23:59:00' });
    expect(text(host().querySelector('.ficha__acceso'))).toContain('Ya cerró');
    expect(button('Comenzar')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('403 de «no asignado»: lo dice sin mostrar nada del caso y deja volver a tus casos', async () => {
    await render({ getCaseBrief: () => failure(403, 'ACCESS_NOT_ASSIGNED') });
    expect(text(host())).toContain('Este caso no está asignado a tu cuenta');
    expect(host().querySelector('.brief-character')).toBeNull();
    expect(button('Comenzar')).toBeUndefined();
    expect(button('Volver a tus casos')?.getAttribute('href')).toBe('/portal/simulador');
  });

  it('404: el caso no existe o no está publicado, y no es un error de red', async () => {
    await render({ getCaseBrief: () => failure(404, 'NOT_FOUND') });
    expect(text(host())).toContain('No encontramos este caso');
    expect([...host().querySelectorAll('ui-error-state button')].map(text)).not.toContain('Reintentar');
    expect(button('Volver a tus casos')).toBeDefined();
  });

  it('error del servidor: «Reintentar» vuelve a pedir la ficha y, si responde, la pinta', async () => {
    let calls = 0;
    await render({ getCaseBrief: () => (++calls === 1 ? failure(500) : of(brief())) });
    const retry = [...host().querySelectorAll('ui-error-state button')].find(el => text(el).includes('Reintentar')) as HTMLElement;
    expect(retry).toBeDefined();
    retry.click();
    await fixture.whenStable();
    expect(calls).toBe(2);
    expect(text(host().querySelector('h1'))).toBe('Primer contacto en urgencias');
    expect(host().querySelector('ui-error-state')).toBeNull();
  });
});
