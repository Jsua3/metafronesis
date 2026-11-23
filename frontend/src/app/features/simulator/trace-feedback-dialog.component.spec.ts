import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AttemptTimelineEntry, TraceEvent } from '../../core/models/revision.model';
import { RECONSIDERED_LABEL } from './reconsidered.util';
import { FeedbackPanelView, TraceFeedbackDialogComponent } from './trace-feedback-dialog.component';

/**
 * Diálogo de retroalimentación de la traza docente (plan visual F7-4): muestra las nueve lecturas del intento con los
 * componentes de la biblioteca. La trampa de foco, Esc y el retorno del foco son del diálogo de la biblioteca
 * (`ui-dialog.spec.ts`); aquí se prueba lo que cada lectura dice.
 */
const emptyPanel = (overrides: Partial<FeedbackPanelView>): FeedbackPanelView => ({
  key: 'TOTAL', title: 'Todas las decisiones del intento', intro: 'Resumen completo.', decisions: [], timeline: [],
  reflections: [], evaluations: [], emptyTitle: 'Sin decisiones registradas', emptyMessage: 'Este intento aún no tiene decisiones guardadas.',
  missingNodes: [], ...overrides,
});

const decision = (overrides: Partial<TraceEvent> = {}): TraceEvent => ({
  type: 'DECISION_SELECTED', class: 'RECOMMENDED', nodeTitle: 'Recepción', decisionText: 'Escuchar sin interrumpir',
  detail: null, occurredAt: '2026-10-10T10:00:00Z', ...overrides,
});

const entry = (overrides: Partial<AttemptTimelineEntry> = {}): AttemptTimelineEntry => ({
  atSeconds: 30, time: '00:30', type: 'DECISION_SELECTED', class: 'RISKY', prohibited: false,
  label: 'Interrumpir', ...overrides,
});

describe('diálogo de retroalimentación de la traza (F7-4)', () => {
  let fixture: ComponentFixture<TraceFeedbackDialogComponent>;
  let close: ReturnType<typeof vi.fn>;

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function open(panel: FeedbackPanelView) {
    close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: DialogRef, useValue: { close, containerInstance: undefined } },
        { provide: DIALOG_DATA, useValue: { panel } },
      ],
    });
    fixture = TestBed.createComponent(TraceFeedbackDialogComponent);
    await fixture.whenStable();
  }

  afterEach(() => TestBed.resetTestingModule());

  // req: RNF-04, BLOQUE-H
  it('titula el diálogo con el panel, lo describe con su introducción y «Cerrar» lo cierra', async () => {
    await open(emptyPanel({ decisions: [decision()] }));
    expect(text(host().querySelector('.ui-dialog-frame__title'))).toBe('Todas las decisiones del intento');
    expect(text(host().querySelector('.ui-dialog-frame__description'))).toBe('Resumen completo.');

    const closeButton = [...host().querySelectorAll('button')].find(button => text(button) === 'Cerrar')!;
    closeButton.click();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('las decisiones salen con su clase en una insignia con texto y su escenario, sin puntaje ni estrés', async () => {
    await open(emptyPanel({
      decisions: [
        decision(), decision({ class: 'RISKY', decisionText: 'Interrumpir' }),
        decision({ class: 'ACCEPTABLE', decisionText: 'Callar' }), decision({ class: 'CONTRAINDICATED', decisionText: 'Culpar' }),
      ],
    }));
    const cards = [...host().querySelectorAll('.tf-card')];
    expect(cards).toHaveLength(4);
    expect(cards.map(card => text(card.querySelector('ui-badge')))).toEqual(['Recomendada', 'Con riesgo', 'Aceptable', 'Contraindicada']);
    expect(cards.map(card => card.getAttribute('data-accent'))).toEqual(['recommended', 'risky', 'acceptable', 'contraindicated']);
    expect(text(cards[0])).toContain('Escuchar sin interrumpir');
    expect(text(cards[0])).toContain('Escenario: Recepción');
    expect(text(host())).not.toMatch(/Impacto|Puntaje|Estrés|\d+\s?%/);
  });

  it('el texto de apoyo de una decisión sin clase ya no usa el vocabulario clínico (VD-24)', async () => {
    await open(emptyPanel({ decisions: [decision({ class: null, type: 'DECISION_SELECTED' })] }));
    expect(text(host())).toContain('Revisar el contexto del escenario y la justificación de la decisión.');
    expect(text(host()).toLowerCase()).not.toContain('clínic');
  });

  it('la línea de tiempo: un reintento sale con su etiqueta y sin tono de contraindicada', async () => {
    await open(emptyPanel({
      key: 'RECORRIDO',
      timeline: [
        entry({ type: 'PROHIBITED_DECISION_RETRY_REQUIRED', class: 'CONTRAINDICATED', prohibited: true, label: 'Primera respuesta' }),
        entry({ type: 'PROHIBITED_DECISION_SELECTED', class: 'CONTRAINDICATED', prohibited: true, label: 'Respuesta registrada' }),
        entry({ class: 'RECOMMENDED', label: 'Paso adecuado' }),
      ],
    }));
    const cards = [...host().querySelectorAll('.tf-card')];
    expect(text(cards[0].querySelector('ui-badge'))).toBe(RECONSIDERED_LABEL);
    expect(cards[0].getAttribute('data-accent')).toBe('');
    expect(text(cards[0])).toContain('no cuenta como decisión registrada');
    expect(text(cards[1].querySelector('ui-badge'))).toBe('Contraindicada');
    expect(cards[1].getAttribute('data-accent')).toBe('contraindicated');
    expect(text(cards[2])).toContain('Paso adecuado dentro del recorrido simulado.');
    expect(text(host()).toLowerCase()).not.toContain('clínic');
  });

  it('las reflexiones salen con su escenario y una insignia si están bloqueadas', async () => {
    await open(emptyPanel({
      key: 'REFLECTIONS',
      reflections: [
        { nodeId: 1, nodeTitle: 'Recepción', text: 'Me costó escuchar', locked: true },
        { nodeId: 2, nodeTitle: 'Cierre', text: '', locked: false },
      ],
    }));
    const cards = [...host().querySelectorAll('.tf-card')];
    expect(text(cards[0])).toContain('Recepción');
    expect(text(cards[0])).toContain('Me costó escuchar');
    expect(text(cards[0].querySelector('ui-badge'))).toBe('Bloqueada');
    expect(text(cards[1])).toContain('Sin texto registrado.');
  });

  // req: RN-09
  it('las evaluaciones se rotulan «Valoración formativa» con el nivel y nunca llevan un número', async () => {
    await open(emptyPanel({
      key: 'EVALUATION',
      evaluations: [
        { id: 1, rubricName: 'Rúbrica básica', overallLevel: 'LOGRADO', comment: 'Buen trabajo', evaluatedAt: '2026-10-10T11:00:00Z' },
        { id: 2, rubricName: 'Rúbrica extra', overallLevel: 'DESTACADO', comment: null, evaluatedAt: '2026-10-10T12:00:00Z' },
        { id: 3, rubricName: 'Rúbrica a medias', overallLevel: null, comment: null, evaluatedAt: '2026-10-10T13:00:00Z' },
      ],
    }));
    const cards = [...host().querySelectorAll('.tf-card')];
    expect(text(cards[0])).toContain('Valoración formativa:');
    expect(text(cards[0])).toMatch(/Evaluada: .*2026/);
    expect(text(cards[0].querySelector('ui-badge'))).toBe('Logrado');
    expect(text(cards[0])).not.toContain('Puntaje total');
    expect(cards.every(card => card.querySelector('strong') === null)).toBe(true);
    expect(text(cards[1])).not.toMatch(/\d,\d/);
    expect(text(cards[1].querySelector('ui-badge'))).toBe('Destacado');
    expect(text(cards[2].querySelector('ui-badge'))).toBe('Pendiente');
  });

  it('el tiempo muestra su introducción una sola vez, sin repetir un encabezado', async () => {
    await open(emptyPanel({ key: 'TIME', title: 'Tiempo del intento', intro: 'Duración registrada: 25 min 0 s.' }));
    expect(text(host()).match(/Duración registrada: 25 min 0 s\./g)).toHaveLength(1);
    expect(host().querySelector('h3')).toBeNull();
  });

  it('sin datos: el vacío dice por qué y, en las bitácoras, qué escenarios quedaron sin reflexión', async () => {
    await open(emptyPanel({
      key: 'REFLECTIONS', emptyTitle: 'Sin reflexiones registradas',
      emptyMessage: 'La bitácora es opcional por escenario.', missingNodes: ['Recepción', 'Cierre'],
    }));
    const empty = host().querySelector('.tf-empty')!;
    expect(text(empty)).toContain('Sin reflexiones registradas');
    expect(text(empty)).toContain('La bitácora es opcional por escenario.');
    expect([...empty.querySelectorAll('.tf-missing li')].map(item => text(item))).toEqual(['Recepción', 'Cierre']);
  });
});
