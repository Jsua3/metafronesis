import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { InstructorApi } from '../../core/api/instructor.api';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  AttemptTrace, FormativeLevel, RecentAttempt, RubricCriterionView, RubricEvaluationView, RubricLevelOption,
} from '../../core/models/revision.model';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { InstructorTraceComponent } from './instructor-trace.component';
import { ReplaceAttemptDialogComponent } from './replace-attempt-dialog.component';
import { TraceFeedbackDialogComponent } from './trace-feedback-dialog.component';

/**
 * Traza del docente en el sistema de la biblioteca (plan visual F7-4): lista maestro-detalle, retroalimentación en un
 * diálogo (trampa de foco, foco inicial, Esc), «Selecciona un intento» solo si hay intentos, rúbrica por niveles
 * (un nivel por criterio, sin campo numérico) y la valoración formativa rotulada como tal (RN-09). La traza dice qué
 * hizo la persona (hitos, persona por escena, final con su razón, decisiones por clase) y no muestra puntaje ni
 * estrés; el perfil automático del sistema queda plegado hasta que el docente guarda su valoración. La prueba del
 * diálogo vive en `trace-feedback-dialog.component.spec.ts`.
 */
const attempt = (attemptId: string, overrides: Partial<RecentAttempt> = {}): RecentAttempt => ({
  attemptId, studentAlias: `Estudiante ${attemptId}`, caseTitle: `Caso ${attemptId}`, status: 'COMPLETED',
  startedAt: '2026-10-10T10:00:00Z', ...overrides,
});

// `competency` es el código que el servidor sirve en `criteria[]`: el mismo de `competencyLevels[].code`
// (`competency_code_of`: el del catálogo o el texto normalizado, p. ej. «Ética profesional» → ETICA_PROFESIONAL).
const criterion = (id: number, title: string, competency = 'ETICA_PROFESIONAL'): RubricCriterionView => ({
  id, competency, title, description: `Descripción de ${title}`, weight: 50, displayOrder: id,
});

const LEVELS: RubricLevelOption[] = [
  { value: 'EN_INICIO', label: 'En inicio', descriptor: 'Aún no muestra la conducta esperada.' },
  { value: 'EN_PROCESO', label: 'En proceso', descriptor: 'La muestra a veces y con apoyo.' },
  { value: 'LOGRADO', label: 'Logrado', descriptor: 'La muestra de forma sostenida.' },
  { value: 'DESTACADO', label: 'Destacado', descriptor: 'La muestra y además la fundamenta.' },
];

function rubricFixture(overrides: Partial<RubricEvaluationView> = {}): RubricEvaluationView {
  return {
    attemptId: 'a-1', rubricId: 7, rubricName: 'Rúbrica básica de desempeño', description: 'Evalúa el desempeño formativo.',
    criteria: [criterion(1, 'Ética profesional'), criterion(2, 'Ruta de atención', 'RUTA_DE_ATENCION')], scores: [], levels: LEVELS,
    overallLevel: null, comment: '', ...overrides,
  };
}

const SYSTEM_EVALUATION = {
  id: 90, rubricName: 'Valoración del sistema', origin: 'SISTEMA' as const, overallLevel: 'EN_PROCESO' as const, comment: null,
  evaluatedAt: '2026-10-10T11:00:00Z',
  competencyLevels: [
    { code: 'ETICA_PROFESIONAL', name: 'Ética profesional', level: 'EN_PROCESO' as const, basis: 'Dos decisiones recomendadas de tres.', evidence: [] },
    { code: 'RUTA_DE_ATENCION', name: 'Ruta de atención', level: null, basis: null, evidence: [] },
  ],
};

function traceFixture(id = 'a-1', overrides: Partial<AttemptTrace> = {}): AttemptTrace {
  return {
    attemptId: id, studentAlias: `Estudiante ${id}`, caseTitle: `Caso ${id}`, status: 'COMPLETED',
    startedAt: '2026-10-10T10:00:00Z', endedAt: '2026-10-10T10:25:00Z', totalDurationSeconds: 1500, activeSeconds: 1400,
    phaseDurations: [{ nodeId: 1, nodeTitle: 'Recepción', startedAt: '2026-10-10T10:00:00Z', endedAt: '2026-10-10T10:05:00Z', durationSeconds: 300 }],
    counts: { recommended: 3, acceptable: 1, risky: 1, contraindicated: 0 }, safeExitUsed: false,
    milestones: {
      done: [{ key: 'escucha', label: 'Escuchar sin interrumpir', decisive: false }],
      missing: [{ key: 'proteccion', label: 'Recomendar medidas de protección', decisive: true }],
    },
    personaPorEscena: [
      { nodeId: 1, nodeTitle: 'Recepción', bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
      { nodeId: 2, nodeTitle: 'Cierre', bond: 'OPEN', activation: 'CALM', label: 'se muestra abierta y serena' },
    ],
    ending: {
      key: 'con_brechas', title: 'Cierre con brechas', message: 'El caso se cerró con pasos pendientes.', tone: 'neutral',
      reason: ['Faltó recomendar medidas de protección.', 'Hubo una respuesta con riesgo.'],
    },
    timeline: [
      { atSeconds: 30, time: '00:30', type: 'DECISION_SELECTED', class: 'RECOMMENDED', prohibited: false, label: 'Escucha activa' },
    ],
    visitedNodeTitles: ['Recepción'], events: [], reflections: [], rubricEvaluations: [], world: {},
    systemEvaluation: null, systemEvaluationAvailable: false,
    ...overrides,
  } as unknown as AttemptTrace;
}

interface Api {
  recent: () => Observable<RecentAttempt[]>;
  trace: (id: string) => Observable<AttemptTrace>;
  rubric: (id: string) => Observable<RubricEvaluationView>;
  save: (...args: unknown[]) => Observable<RubricEvaluationView>;
}

describe('traza del docente en el sistema de la biblioteca (F7-4)', () => {
  let fixture: ComponentFixture<InstructorTraceComponent>;
  let api: Record<'recentAttempts' | 'attemptTrace' | 'rubric' | 'saveRubric' | 'replaceAttempt', ReturnType<typeof vi.fn>>;
  let dialog: { open: ReturnType<typeof vi.fn>; consequence: ReturnType<typeof vi.fn> };
  let notify: Record<'success' | 'error' | 'warning' | 'info', ReturnType<typeof vi.fn>>;

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const status = () => text(host().querySelector('[role="status"].ds-sr-only'));
  // La valoración vive en `app-rubrica-intento` (B5b); sus casos propios están en `revision/rubrica-intento.component.spec.ts`.
  const criteriaCards = () => [...host().querySelectorAll('.ri-criterio')];
  /**
   * Elige un nivel pulsándolo, como lo haría el docente (R2: la lista desplegable «Nivel logrado» pasó a botones de
   * opción). Con '' pulsa otra vez el elegido, que lo quita: el «Sin calificar» de antes.
   */
  const pick = (index: number, level: FormativeLevel | '') => {
    const radios = [...criteriaCards()[index].querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    (level ? radios.find(radio => radio.value === level) : radios.find(radio => radio.checked))?.click();
    fixture.detectChanges();
  };
  const fillLevels = (first: FormativeLevel = 'LOGRADO', second: FormativeLevel = 'EN_PROCESO') => {
    pick(0, first);
    pick(1, second);
  };
  const saveButton = () => [...host().querySelectorAll('button')]
    .find(button => text(button.querySelector('.ui-button__label')).startsWith('Guardar evaluación')) as HTMLButtonElement;

  async function render(overrides: Partial<Api> = {}, { stable = true, query = {} } = {}) {
    api = {
      recentAttempts: vi.fn(overrides.recent ?? (() => of([attempt('a-1'), attempt('a-2', { status: 'IN_PROGRESS' })]))),
      attemptTrace: vi.fn(overrides.trace ?? ((id: string) => of(traceFixture(id)))),
      rubric: vi.fn(overrides.rubric ?? (() => of(rubricFixture()))),
      saveRubric: vi.fn(overrides.save ?? (() => of(rubricFixture({ overallLevel: 'LOGRADO' })))),
      replaceAttempt: vi.fn(),
    };
    dialog = { open: vi.fn(), consequence: vi.fn() };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      imports: [InstructorTraceComponent],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: InstructorApi, useValue: api },
        { provide: AuthService, useValue: { currentUser: () => ({ role: 'PROFESOR' }) } },
        { provide: UiDialog, useValue: dialog },
        { provide: NotificationService, useValue: notify },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    fixture = TestBed.createComponent(InstructorTraceComponent);
    // En el documento: el menú «Más acciones» lleva el foco a sus ítems al abrirse.
    document.body.appendChild(fixture.nativeElement);
    if (stable) await fixture.whenStable();
    else fixture.detectChanges();
    fixture.detectChanges();
  }

  /** Lleva la evidencia a una pestaña (Recorrido, Decisiones o Reflexiones); el contenido se pinta al abrirla. */
  const tab = async (name: 'recorrido' | 'decisiones' | 'reflexiones') => {
    fixture.componentInstance.pestana.set(name);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  afterEach(() => {
    (fixture?.nativeElement as HTMLElement | undefined)?.remove();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // E1-2 (RN-07): reemplazar un intento ABIERTO es acción docente, con motivo y auditada
  // (`POST /api/instructor/attempts/{id}/replace`); el estudiante ya no puede forzar uno nuevo. F7 no lo construyó.
  // req: RN-07
  describe('reemplazo docente (E1-2)', () => {
    const openTrace = (status: string) => ({ trace: (id: string) => of(traceFixture(id, { status, endedAt: null })) });
    // B5b: «Reemplazar intento» deja de estar junto al título; va en «Más acciones», en rojo (es una acción de peso).
    const moreActions = () => host().querySelector<HTMLButtonElement>('.tr-mas .ui-menu__trigger');
    const replace = async () => {
      moreActions()!.click();
      await fixture.whenStable();
      const item = [...host().querySelectorAll<HTMLElement>('.tr-mas [role="menuitem"]')]
        .find(element => text(element.querySelector('.ui-menu__label')) === 'Reemplazar intento')!;
      expect(item.classList).toContain('ui-menu__item--danger');
      item.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('solo un intento abierto (en curso o en pausa) ofrece «Reemplazar intento», dentro de «Más acciones»', async () => {
      await render();
      expect(moreActions()).toBeNull();
      for (const state of ['IN_PROGRESS', 'PAUSED']) {
        fixture.nativeElement.remove();
        TestBed.resetTestingModule();
        await render(openTrace(state));
        expect(moreActions(), state).not.toBeNull();
      }
    });

    it('pide el motivo en un diálogo; con motivo, reemplaza, recarga la traza y lo anuncia', async () => {
      await render(openTrace('IN_PROGRESS'));
      api.replaceAttempt.mockReturnValue(of({ attemptId: 'a-1', status: 'REPLACED', reason: 'Se trabó el mundo', replacedAt: '2026-10-14T10:00:00Z' }));
      dialog.open.mockReturnValue({ closed: of('Se trabó el mundo') });
      await replace();

      expect(dialog.open).toHaveBeenCalledWith(ReplaceAttemptDialogComponent, expect.objectContaining({
        data: expect.objectContaining({ studentAlias: 'Estudiante a-1', caseTitle: 'Caso a-1' }),
      }));
      expect(api.replaceAttempt).toHaveBeenCalledWith('a-1', 'Se trabó el mundo');
      expect(api.attemptTrace).toHaveBeenCalledTimes(2);
      // Se anuncia UNA vez, por el aviso del sistema; la región de estado de la pantalla queda para lo suyo.
      expect(notify.success).toHaveBeenCalledWith(expect.stringContaining('Intento reemplazado'));
      expect(status()).not.toContain('Intento reemplazado');
    });

    it('si se cancela el diálogo no se envía nada', async () => {
      await render(openTrace('PAUSED'));
      dialog.open.mockReturnValue({ closed: of(undefined) });
      await replace();
      expect(api.replaceAttempt).not.toHaveBeenCalled();
    });

    it('si el intento ya se cerró (409), lo dice y no recarga a ciegas', async () => {
      await render(openTrace('IN_PROGRESS'));
      api.replaceAttempt.mockReturnValue(throwError(() => new HttpErrorResponse({
        status: 409, error: { success: false, code: 'ATTEMPT_NOT_OPEN', message: 'El intento ya está cerrado y no puede reemplazarse.' },
      })));
      dialog.open.mockReturnValue({ closed: of('motivo') });
      await replace();
      expect(notify.error).toHaveBeenCalledWith('El intento ya está cerrado y no puede reemplazarse.');
    });

    // Revisión de F7b: el resultado del reemplazo no se queda en la región de estado, donde tapaba los avisos de la
    // rúbrica (WCAG 4.1.3) y se repetía en cada recarga de la traza.
    it('tras un reemplazo, un fallo al guardar la rúbrica sí llega a la región de estado', async () => {
      await render({ ...openTrace('IN_PROGRESS'), save: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
      api.replaceAttempt.mockReturnValue(of({ attemptId: 'a-1', status: 'REPLACED', reason: 'x', replacedAt: '2026-10-14T10:00:00Z' }));
      dialog.open.mockReturnValue({ closed: of('Se trabó el mundo') });
      await replace();

      fillLevels();
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(status()).toContain('No fue posible guardar la evaluación');
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('estados y maestro-detalle', () => {
    it('un solo h1, la región de estado siempre presente y sin restos del diseño anterior', async () => {
      await render();
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Revisión formativa del intento');
      expect(host().querySelector('[role="status"].ds-sr-only')).not.toBeNull();
      // El arte nuevo de la cabecera (la viñeta del simulador, decorativa) usa piezas `ui-pieza-pixel`: no es un resto.
      const restos = [...host().querySelectorAll('[class*="pixel-"], mat-progress-bar, mat-icon[aria-label], .feedback-modal')]
        .filter(el => !el.closest('ui-vineta'));
      expect(restos).toHaveLength(0);
      expect(host().querySelector('ui-vineta')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('sin intentos: el vacío de la lista dice qué pasa y NO aparece «Selecciona un intento»', async () => {
      await render({ recent: () => of([]) });
      expect(text(host().querySelector('.tr-list ui-empty-state'))).toContain('No hay intentos recientes para tus grupos');
      expect(text(host())).not.toContain('Selecciona un intento');
      expect(api.attemptTrace).not.toHaveBeenCalled();
    });

    it('con intentos abre el más reciente y muestra su detalle (sin «Selecciona un intento»)', async () => {
      await render();
      expect(api.attemptTrace).toHaveBeenCalledWith('a-1');
      expect(text(host().querySelector('.tr-overview h2'))).toBe('Caso a-1');
      expect(text(host())).not.toContain('Selecciona un intento');
      const items = [...host().querySelectorAll('.tr-attempt')];
      expect(items).toHaveLength(2);
      expect(items[0].getAttribute('aria-current')).toBe('true');
      expect(items[1].getAttribute('aria-current')).toBeNull();
      expect(text(items[1])).toContain('Estudiante a-2');
      expect(text(items[1])).toContain('En curso');
      // La lista dice quién, qué caso y cuándo: ningún puntaje ni estrés.
      expect(text(items[0])).not.toMatch(/Puntaje|Estrés/i);
    });

    it('elegir otro intento abre ese y mueve la marca de seleccionado', async () => {
      await render();
      (host().querySelectorAll('.tr-attempt')[1] as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.attemptTrace).toHaveBeenLastCalledWith('a-2');
      const items = [...host().querySelectorAll('.tr-attempt')];
      expect(items[0].getAttribute('aria-current')).toBeNull();
      expect(items[1].getAttribute('aria-current')).toBe('true');
      expect(text(host().querySelector('.tr-overview h2'))).toBe('Caso a-2');
    });

    it('con intentos pero ninguno abierto aún, la pantalla invita a elegir uno', async () => {
      await render({ trace: () => new Subject<AttemptTrace>() }, { stable: false });
      fixture.componentInstance.trace.set(null);
      fixture.componentInstance.selectedAttemptId.set(null);
      fixture.componentInstance.loadingTrace.set(false);
      fixture.detectChanges();
      expect(text(host().querySelector('.tr-detail ui-empty-state'))).toContain('Selecciona un intento');
    });

    it('si la lista falla: UN error con «Reintentar» que la vuelve a pedir', async () => {
      let calls = 0;
      await render({ recent: () => (++calls === 1 ? throwError(() => new HttpErrorResponse({ status: 500 })) : of([attempt('a-1')])) });
      const errors = host().querySelectorAll('ui-error-state');
      expect(errors).toHaveLength(1);
      (errors[0].querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(calls).toBe(2);
      expect(host().querySelector('ui-error-state')).toBeNull();
      expect(host().querySelectorAll('.tr-attempt')).toHaveLength(1);
    });

    it('si falla la traza de un intento: el error vive en el detalle, la lista sigue ahí y «Reintentar» la vuelve a pedir', async () => {
      let calls = 0;
      await render({ trace: id => (++calls === 1 ? throwError(() => new HttpErrorResponse({ status: 500 })) : of(traceFixture(id))) });
      const error = host().querySelector('.tr-detail ui-error-state')!;
      expect(error).not.toBeNull();
      expect(host().querySelectorAll('.tr-attempt')).toHaveLength(2);

      (error.querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(calls).toBe(2);
      expect(text(host().querySelector('.tr-overview h2'))).toBe('Caso a-1');
    });

    it('mientras carga la traza: esqueleto con aria-busy y el estado leído', async () => {
      vi.useFakeTimers();
      await render({ trace: () => new Subject<AttemptTrace>() }, { stable: false });
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      expect(host().querySelector('.tr-detail [aria-busy="true"]')).not.toBeNull();
      expect(host().querySelectorAll('.tr-detail ui-skeleton').length).toBeGreaterThan(0);
      expect(status()).toBe('Cargando la trazabilidad…');
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('retroalimentación en un diálogo', () => {
    // B5b: las ocho tarjetas pasan a una banda de seis cifras sin los «Ver retroalimentación» repetidos; la evaluación
    // va como insignia en la cabecera y el tiempo en una línea («Tiempo activo»). Cada cifra sigue abriendo su panel.
    it('cada cifra de la banda es un botón que abre el diálogo de la biblioteca con su panel', async () => {
      await render();
      const cards = [...host().querySelectorAll('.tr-metric')] as HTMLButtonElement[];
      expect(cards.map(card => text(card.querySelector('.ui-stat__label')))).toEqual([
        'Decisiones', 'Recomendadas', 'Aceptables', 'Con riesgo', 'Contraindicadas', 'Reflexiones',
      ]);
      // Son conteos de hechos por clase de respuesta (3 + 1 + 1 + 0), no una medida.
      expect(cards.map(card => text(card.querySelector('.ui-stat__value')))).toEqual(['5', '3', '1', '1', '0', '0']);
      expect(text(host().querySelector('.tr-overview'))).toContain('Tiempo activo: 23 min');
      expect(cards.some(card => text(card).includes('Ver retroalimentación'))).toBe(false);
      expect(cards.every(card => card.getAttribute('aria-haspopup') === 'dialog')).toBe(true);

      cards[1].click();
      expect(dialog.open).toHaveBeenCalledTimes(1);
      const [component, options] = dialog.open.mock.calls[0];
      expect(component).toBe(TraceFeedbackDialogComponent);
      expect(options.size).toBe('lg');
      expect(options.data.panel.key).toBe('RECOMMENDED');
      expect(options.data.panel.title).toBe('Decisiones recomendadas');
    });

    it('ningún panel usa el vocabulario clínico (VD-24): el vacío de decisiones es educativo', async () => {
      await render({ trace: id => of(traceFixture(id, { events: [], timeline: [] })) });
      const cards = [...host().querySelectorAll('.tr-metric')] as HTMLButtonElement[];
      cards[0].click();
      const panel = dialog.open.mock.calls[0][1].data.panel;
      expect(panel.emptyMessage).toBe('Este intento aún no tiene decisiones guardadas.');
      expect(JSON.stringify(panel).toLowerCase()).not.toContain('clínic');
    });

    it('«Ver retroalimentación» de la línea de tiempo y de las reflexiones abren su panel', async () => {
      await render();
      // B5b: cada botón vive en su pestaña de la evidencia (Decisiones y Reflexiones).
      const feedbackButton = (panel: string) => [...host().querySelectorAll<HTMLButtonElement>(panel + ' button')]
        .find(button => text(button.querySelector('.ui-button__label')) === 'Ver retroalimentación')!;
      await tab('decisiones');
      feedbackButton('.tr-events-section').click();
      await tab('reflexiones');
      feedbackButton('.tr-reflections').click();
      expect(dialog.open.mock.calls.map(call => call[1].data.panel.key)).toEqual(['RECORRIDO', 'REFLECTIONS']);
    });
  });

  // req: modelo de métricas
  describe('sin puntaje ni estrés', () => {
    it('la traza no muestra puntaje, estrés, impactos ni porcentajes: ni en el detalle, ni en la lista, ni en los paneles', async () => {
      await render();
      expect(text(host())).not.toMatch(/Puntaje|Estrés|Impacto|\d+\s?%/i);
      expect(host().querySelectorAll('input[type="number"]')).toHaveLength(0);

      for (const card of [...host().querySelectorAll('.tr-metric')] as HTMLButtonElement[]) card.click();
      const panels = dialog.open.mock.calls.map(call => JSON.stringify(call[1].data.panel));
      expect(panels.length).toBeGreaterThan(0);
      expect(panels.join(' ')).not.toMatch(/puntaje|estrés|impacto|scoreDelta|stressDelta/i);
    });

    it('la línea de tiempo dice la clase en palabras y nada más (sin deltas)', async () => {
      await render();
      const event = host().querySelector('.tr-event')!;
      expect(text(event.querySelector('ui-badge'))).toBe('Recomendada');
      expect(event.getAttribute('data-accent')).toBe('recommended');
      expect(text(event.querySelector('small'))).toBe('00:30');
    });
  });

  // req: RN-09, modelo de métricas
  // B5b: van en la pestaña «Recorrido» de la evidencia, con títulos de nivel 3 (la columna ya tiene su h2).
  describe('hitos, persona por escena y final', () => {
    it('«Hitos» separa los cumplidos de los que faltaron y marca «clave» el que decide el final', async () => {
      await render();
      await tab('recorrido');
      const section = host().querySelector('.tr-milestones')!;
      expect(text(section.querySelector('h3'))).toBe('Hitos');
      const groups = [...section.querySelectorAll('.tr-milestone-groups > div')];
      expect(text(groups[0])).toContain('Cumplidos');
      expect(text(groups[0])).toContain('Escuchar sin interrumpir');
      expect(groups[0].querySelector('ui-badge')).toBeNull();
      expect(text(groups[1])).toContain('Faltaron');
      expect(text(groups[1])).toContain('Recomendar medidas de protección');
      expect(text(groups[1].querySelector('ui-badge'))).toBe('clave');
    });

    it('un caso sin hitos lo dice en vez de dejar el bloque vacío', async () => {
      await render({ trace: id => of(traceFixture(id, { milestones: { done: [], missing: [] } })) });
      await tab('recorrido');
      expect(text(host().querySelector('.tr-milestones'))).toContain('Este caso no declara hitos.');
    });

    it('«La persona por escena» lista cada escena con la frase de cómo se mostró la persona', async () => {
      await render();
      await tab('recorrido');
      const items = [...host().querySelectorAll('.tr-persona-list li')].map(text);
      expect(items).toEqual(['Recepción → se muestra cautelosa y tensa', 'Cierre → se muestra abierta y serena']);
    });

    it('el final lleva su título, su mensaje y la razón en palabras', async () => {
      await render();
      await tab('recorrido');
      const ending = host().querySelector('.tr-ending')!;
      expect(text(ending)).toContain('Cierre con brechas');
      expect(text(ending)).toContain('El caso se cerró con pasos pendientes.');
      expect([...ending.querySelectorAll('.tr-reason-list li')].map(text)).toEqual([
        'Faltó recomendar medidas de protección.', 'Hubo una respuesta con riesgo.',
      ]);
    });

    it('un intento sin final (no se completó) no inventa uno', async () => {
      await render({ trace: id => of(traceFixture(id, { ending: null, status: 'IN_PROGRESS', endedAt: null })) });
      await tab('recorrido');
      expect(host().querySelector('.tr-ending')).toBeNull();
    });
  });

  // req: RN-09, modelo de métricas
  describe('la valoración del sistema, plegada hasta que el docente guarda la suya', () => {
    const systemSection = () => host().querySelector('.tr-system');

    it('mientras el docente no guarda la suya no hay perfil: solo se avisa que se mostrará después', async () => {
      await render({ trace: id => of(traceFixture(id, { systemEvaluation: null, systemEvaluationAvailable: true })) });
      expect(text(systemSection())).toContain('La valoración del sistema se mostrará cuando registres tu propia valoración.');
      expect(systemSection()!.querySelector('table')).toBeNull();
      expect(text(host())).not.toContain('Dos decisiones recomendadas de tres.');
    });

    it('si el caso no declara competencias, una nota llana lo dice y enlaza al editor (V5)', async () => {
      await render({ trace: id => of(traceFixture(id, {
        systemEvaluation: null, systemEvaluationAvailable: false, competenciesDeclared: false, caseVersionId: 21,
      })) });
      expect(text(systemSection())).toContain('Este caso todavía no declara qué competencia evidencia cada respuesta');
      expect(systemSection()!.querySelector('a')?.getAttribute('href')).toBe('/portal/casos/21/editor');
      expect(systemSection()!.querySelector('table')).toBeNull();
    });

    it('si el sistema no tiene valoración que mostrar, la sección no aparece', async () => {
      await render({ trace: id => of(traceFixture(id, { systemEvaluation: null, systemEvaluationAvailable: false })) });
      expect(systemSection()).toBeNull();
    });

    it('con la valoración presente se muestra junto a la del docente, competencia por competencia', async () => {
      await render({
        trace: id => of(traceFixture(id, { systemEvaluation: SYSTEM_EVALUATION, systemEvaluationAvailable: true })),
        rubric: () => of(rubricFixture({
          scores: [{ criterionId: 1, level: 'LOGRADO', comment: null, evidence: {} }], overallLevel: 'LOGRADO',
        })),
      });
      const table = systemSection()!.querySelector('table')!;
      expect([...table.querySelectorAll('thead th')].map(text)).toEqual([
        'Competencia', 'Tu valoración', 'Valoración del sistema', 'Con qué se calculó',
      ]);
      const rows = [...table.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('th, td')].map(text));
      expect(rows).toEqual([
        ['Ética profesional', 'Logrado', 'En proceso', 'Dos decisiones recomendadas de tres.'],
        ['Ruta de atención', 'Pendiente', 'Sin evidencia', '—'],
      ]);
    });

    it('un criterio sin código de competencia (el servidor lo manda vacío) no se empareja: «Sin criterio equivalente»', async () => {
      await render({
        trace: id => of(traceFixture(id, { systemEvaluation: SYSTEM_EVALUATION, systemEvaluationAvailable: true })),
        rubric: () => of(rubricFixture({
          criteria: [criterion(1, 'Ética profesional', ''), criterion(2, 'Ruta de atención', 'RUTA_DE_ATENCION')],
          scores: [{ criterionId: 1, level: 'LOGRADO', comment: null, evidence: {} }],
        })),
      });
      const rows = [...systemSection()!.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('th, td')].map(text));
      expect(rows[0].slice(0, 3)).toEqual(['Ética profesional', 'Sin criterio equivalente', 'En proceso']);
      expect(rows[1].slice(0, 2)).toEqual(['Ruta de atención', 'Pendiente']);
    });

    it('al guardar su valoración, el docente recibe la traza de nuevo y el perfil aparece', async () => {
      let calls = 0;
      await render({
        trace: id => of(++calls === 1
          ? traceFixture(id, { systemEvaluation: null, systemEvaluationAvailable: true })
          : traceFixture(id, { systemEvaluation: SYSTEM_EVALUATION, systemEvaluationAvailable: true })),
      });
      expect(systemSection()!.querySelector('table')).toBeNull();

      fillLevels();
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(calls).toBe(2);
      expect(systemSection()!.querySelector('table')).not.toBeNull();
      expect(text(systemSection())).not.toContain('se mostrará cuando registres');
    });

    it('dos intentos de la misma persona en el mismo caso se distinguen por su número', async () => {
      await render({ recent: () => of([
        attempt('a-2', { studentAlias: 'Misma', startedAt: '2026-10-11T10:00:00Z' }), attempt('a-1', { studentAlias: 'Misma' }), attempt('a-3', { studentAlias: 'Otra' }),
      ].map(item => ({ ...item, caseTitle: 'Mismo caso' }))) });
      expect(fixture.componentInstance.numeroIntento()).toEqual({ 'a-1': 'Intento 1 de 2', 'a-2': 'Intento 2 de 2' });
      expect(text(host().querySelector('.tr-attempt__case'))).toContain('Intento 2 de 2');
    });

    it('al entregar, el intento deja de contar «Por revisar» y «Siguiente» no vuelve a él (dos entregas seguidas)', async () => {
      await render({ recent: () => of([
        attempt('a-1', { evaluationStatus: 'PENDIENTE' }), attempt('a-2', { evaluationStatus: 'PENDIENTE' }),
      ]) });
      const trace = fixture.componentInstance;
      const porRevisar = () => trace.attempts().filter(item => trace.porRevisar(item)).map(item => item.attemptId);
      expect(trace.selectedAttemptId()).toBe('a-1');

      fillLevels();
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(porRevisar()).toEqual(['a-2']);
      expect(trace.selectedAttemptId()).toBe('a-1');

      trace.abrirSiguientePendiente();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(trace.selectedAttemptId()).toBe('a-2');
      fillLevels();
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(porRevisar()).toEqual([]);
      trace.abrirSiguientePendiente();
      expect(trace.selectedAttemptId()).toBe('a-2');
    });
  });

  // req: SIEP-CU-04, RNF-04 (revisión de F7)
  describe('arreglos de la revisión de F7', () => {
    it('un ?intento= fuera de la lista falla en el detalle con «Reintentar» que pide ESE mismo intento', async () => {
      let calls = 0;
      await render({
        trace: id => (++calls === 1 ? throwError(() => new HttpErrorResponse({ status: 500 })) : of(traceFixture(id))),
      }, { query: { intento: 'a-viejo' } });

      expect(api.attemptTrace).toHaveBeenCalledWith('a-viejo');
      const error = host().querySelector('.tr-detail ui-error-state')!;
      expect(error).not.toBeNull();

      (error.querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(api.attemptTrace).toHaveBeenLastCalledWith('a-viejo');
      expect(text(host().querySelector('.tr-overview h2'))).toBe('Caso a-viejo');
    });

    it('un ?intento= que no existe (404) lo dice en el detalle sin ofrecer reintentar algo que no va a aparecer', async () => {
      await render({ trace: () => throwError(() => new HttpErrorResponse({ status: 404 })) }, { query: { intento: 'a-borrado' } });

      const error = host().querySelector('.tr-detail ui-error-state')!;
      expect(error).not.toBeNull();
      expect(error.querySelector('button')).toBeNull();
      expect(host().querySelectorAll('.tr-attempt')).toHaveLength(2);
    });

    // B5b: el estado de la evaluación es una insignia de la cabecera del intento (la tarjeta «Evaluación» se fue).
    it('la cabecera solo dice «Valoración aplicada» con una evaluación concluida: una a medias es «pendiente»', async () => {
      const partial = { id: 1, rubricName: 'Rúbrica', overallLevel: null, comment: null, evaluatedAt: '2026-10-10T11:00:00Z' };
      await render({ trace: id => of(traceFixture(id, { rubricEvaluations: [partial] })) });
      expect(text(host().querySelector('.tr-estado-valoracion'))).toBe('Valoración pendiente');
    });

    it('con una evaluación concluida la cabecera dice «Valoración aplicada»', async () => {
      const done = { id: 1, rubricName: 'Rúbrica', overallLevel: 'LOGRADO' as const, comment: null, evaluatedAt: '2026-10-10T11:00:00Z' };
      await render({ trace: id => of(traceFixture(id, { rubricEvaluations: [done] })) });
      expect(text(host().querySelector('.tr-estado-valoracion'))).toBe('Valoración aplicada');
    });

    it('la rúbrica de un intento que se abandonó no pisa la del abierto', async () => {
      const slowRubric = new Subject<RubricEvaluationView>();
      const rubrics: Record<string, Observable<RubricEvaluationView>> = {
        'a-1': slowRubric,
        'a-2': of(rubricFixture({ rubricId: 99, rubricName: 'Rúbrica del segundo' })),
      };
      await render({ rubric: id => rubrics[id] });
      (host().querySelectorAll('.tr-attempt')[1] as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.componentInstance.rubric()?.rubricName).toBe('Rúbrica del segundo');

      slowRubric.next(rubricFixture({ rubricId: 7, rubricName: 'Rúbrica del primero' }));
      slowRubric.complete();
      fixture.detectChanges();

      expect(fixture.componentInstance.rubric()?.rubricName).toBe('Rúbrica del segundo');
      expect(fixture.componentInstance.selectedAttemptId()).toBe('a-2');
    });

    it('el mensaje de un fallo al guardar se anuncia en la región de estado de la pantalla', async () => {
      await render({ save: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
      fillLevels();
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(status()).toContain('No fue posible guardar la evaluación');
    });
  });

  // req: SIEP-CU-04, RNF-04 · DISENO §5.3 (bloque B5b): evidencia y valoración a la vez.
  describe('revisión en tres columnas (B5b)', () => {
    const timeline = [
      { atSeconds: 10, time: '00:10', type: 'ROOM_ENTERED', class: null, prohibited: false, label: 'Puerta hacia sala hospital-sala-escucha' },
      { atSeconds: 30, time: '00:30', type: 'DECISION_SELECTED', class: 'RECOMMENDED', prohibited: false, label: 'Escucha activa' },
      { atSeconds: 50, time: '00:50', type: 'TOOL_USED', class: null, prohibited: false, label: 'Herramienta aplicada: PAP' },
      { atSeconds: 70, time: '01:10', type: 'DECISION_RETRY_REQUIRED', class: 'RISKY', prohibited: false, label: 'Primera respuesta' },
      { atSeconds: 90, time: '01:30', type: 'DECISION_SELECTED', class: 'ACCEPTABLE', prohibited: false, label: 'Aplicar la ruta' },
    ];
    const withTimeline = { trace: (id: string) => of(traceFixture(id, { timeline } as Partial<AttemptTrace>)) };
    const rows = () => [...host().querySelectorAll<HTMLElement>('.tr-event')];

    it('la bandeja, la evidencia y la valoración están en la misma pantalla, con «Guardar evaluación» en la valoración', async () => {
      await render();
      expect(host().querySelector('.tr-bandeja .tr-attempt')).not.toBeNull();
      expect(host().querySelector('.tr-evidencia .tr-overview')).not.toBeNull();
      expect(host().querySelector('.tr-valoracion app-rubrica-intento')).not.toBeNull();
      expect(host().querySelector('.tr-valoracion .ri__pie')?.contains(saveButton())).toBe(true);
    });

    it('la línea de tiempo muestra solo las decisiones; el interruptor suma los eventos del sistema sin claves', async () => {
      await render(withTimeline);
      expect(rows().map(row => text(row.querySelector('.tr-event__texto')))).toEqual(['Escucha activa', 'Primera respuesta', 'Aplicar la ruta']);

      const toggle = host().querySelector<HTMLInputElement>('.tr-interruptor input[role="switch"]')!;
      expect(toggle.checked).toBe(false);
      toggle.click();
      await fixture.whenStable();
      fixture.detectChanges();
      const texts = rows().map(row => text(row.querySelector('.tr-event__texto')));
      expect(texts).toHaveLength(5);
      expect(texts[0]).toBe('Entró en la sala de escucha (hospital)');
      expect(text(host().querySelector('.tr-events'))).not.toContain('hospital-sala-escucha');
    });

    it('cada decisión registrada lleva su número de orden como id estable, con o sin eventos del sistema', async () => {
      await render(withTimeline);
      const ids = () => rows().map(row => row.id || null);
      expect(ids()).toEqual(['decision-1', null, 'decision-2']);
      expect(rows()[0].getAttribute('data-decision')).toBe('1');
      expect(text(rows()[0])).toContain('Decisión 1');

      fixture.componentInstance.mostrarEventos.set(true);
      fixture.detectChanges();
      expect(ids()).toEqual([null, 'decision-1', null, null, 'decision-2']);
    });

    // R2: el cableado de la valoración con la evidencia (sus casos propios están en la prueba de rubrica-intento).
    it('enfocar un criterio resalta sus decisiones y una ficha de evidencia lleva a la decisión en «Decisiones»', async () => {
      const evidenceByCompetency = [{
        code: 'ETICA_PROFESIONAL', name: 'Intervención técnica y ética',
        items: [{ order: 2, nodeTitle: 'Sala de escucha', optionText: 'Aplicar la ruta', class: 'ACCEPTABLE', atSeconds: 90 }],
      }];
      await render({ trace: (id: string) => of(traceFixture(id, { timeline, evidenceByCompetency } as Partial<AttemptTrace>)) });
      const resaltadas = () => rows().filter(row => row.classList.contains('tr-event--resaltada')).map(row => row.id);
      expect(resaltadas()).toEqual([]);

      const ficha = host().querySelector<HTMLButtonElement>('.ri-criterio .ri-ficha')!;
      ficha.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      fixture.detectChanges();
      expect(resaltadas()).toEqual(['decision-2']);

      fixture.componentInstance.pestana.set('recorrido');
      fixture.detectChanges();
      ficha.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.componentInstance.pestana()).toBe('decisiones');
      expect(host().querySelector('#decision-2')?.classList).toContain('tr-event--destino');
      expect(host().querySelector('#decision-2')?.getAttribute('tabindex')).toBe('-1');
    });

    it('la bandeja filtra «Por revisar» (sin BK-3: los terminados, con una nota) y «En curso»', async () => {
      await render();
      const items = () => [...host().querySelectorAll('.tr-attempt')].map(text);
      expect(items()).toHaveLength(2);

      fixture.componentInstance.filtro.set('por-revisar');
      fixture.detectChanges();
      expect(items()).toHaveLength(1);
      expect(items()[0]).toContain('Estudiante a-1');
      expect(text(host().querySelector('.tr-bandeja'))).toContain('el servidor no dice cuáles ya valoraste');

      fixture.componentInstance.filtro.set('en-curso');
      fixture.detectChanges();
      expect(items()).toHaveLength(1);
      expect(items()[0]).toContain('Estudiante a-2');
    });

    it('con BK-3, «Por revisar» es la valoración pendiente; «Ver todos» del Inicio abre la bandeja ahí y en el primero', async () => {
      await render({
        recent: () => of([
          attempt('a-1', { evaluationStatus: 'APLICADA' }),
          attempt('a-2', { evaluationStatus: 'PENDIENTE' }),
          attempt('a-3', { status: 'IN_PROGRESS', evaluationStatus: 'NO_APLICA' }),
        ]),
      }, { query: { evaluacion: 'pendiente' } });
      expect(fixture.componentInstance.filtro()).toBe('por-revisar');
      expect([...host().querySelectorAll('.tr-attempt')].map(text).join(' ')).toContain('Estudiante a-2');
      expect(host().querySelectorAll('.tr-attempt')).toHaveLength(1);
      expect(api.attemptTrace).toHaveBeenCalledWith('a-2');
      expect(text(host().querySelector('.tr-bandeja'))).not.toContain('el servidor no dice');
    });

    it('sin cambios se sale sin preguntar; con cambios sin guardar, se pregunta antes de salir o de cambiar de intento', async () => {
      await render();
      const component = fixture.componentInstance;
      expect(component.canLeave()).toBe(true);

      pick(0, 'LOGRADO');
      expect(component.hayCambios()).toBe(true);
      dialog.consequence.mockResolvedValue('continue');
      expect(await component.canLeave()).toBe(false);

      (host().querySelectorAll('.tr-attempt')[1] as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(dialog.consequence).toHaveBeenCalledTimes(2);
      expect(api.attemptTrace).not.toHaveBeenCalledWith('a-2');

      dialog.consequence.mockResolvedValue('proceed');
      (host().querySelectorAll('.tr-attempt')[1] as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(api.attemptTrace).toHaveBeenLastCalledWith('a-2');
    });

    it('al guardar con éxito ya no hay cambios que avisar y se recargan la rúbrica y la traza', async () => {
      await render();
      fillLevels();
      expect(fixture.componentInstance.hayCambios()).toBe(true);
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.componentInstance.hayCambios()).toBe(false);
      expect(api.rubric).toHaveBeenCalledTimes(2);
      expect(api.attemptTrace.mock.calls.filter(call => call[0] === 'a-1').length).toBeGreaterThanOrEqual(2);
    });

    it('cerrar la pestaña con cambios sin guardar pide confirmación al navegador', async () => {
      await render();
      const quiet = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(quiet);
      expect(quiet.defaultPrevented).toBe(false);
      pick(1, 'DESTACADO');
      const dirty = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(dirty);
      expect(dirty.defaultPrevented).toBe(true);
    });

    it('no hay claves del sistema en mayúsculas a la vista (ni de competencias en la valoración del sistema)', async () => {
      await render({
        trace: id => of(traceFixture(id, {
          systemEvaluation: { ...SYSTEM_EVALUATION, competencyLevels: [{ ...SYSTEM_EVALUATION.competencyLevels[0], name: '' }] },
          systemEvaluationAvailable: true,
        })),
      });
      expect(text(host().querySelector('.tr-system tbody th'))).toBe('Etica profesional');
      expect(text(host())).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b/);
    });
  });

  // req: RN-09
  describe('la valoración formativa no llega al estudiante (RN-09)', () => {
    it('ninguna vista del estudiante lee la evaluación de rúbrica, su nivel ni su total', () => {
      const studentViews = [
        'attempt-outcome.component.ts',
        'simulation-catalog.component.ts',
        'simulation-catalog.component.html',
        'estado-caso.util.ts',
        '../dashboard/student-dashboard.component.ts',
        '../dashboard/student-dashboard.component.html',
        '../dashboard/student-dashboard.util.ts',
      ];
      // Las vistas del estudiante llegan con su carril: las que aún no existen en esta rama se saltan.
      for (const file of studentViews.filter(candidate => existsSync(join(__dirname, candidate)))) {
        const source = readFileSync(join(__dirname, file), 'utf-8');
        expect(source, file).not.toMatch(/overallLevel|RubricEvaluationView|rubricEvaluations|formativeValuationLabel|Valoración formativa/);
      }
    });
  });
});
