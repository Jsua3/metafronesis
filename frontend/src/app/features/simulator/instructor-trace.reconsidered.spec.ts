import { readFileSync } from 'fs';
import { join } from 'path';

import { AttemptTimelineEntry } from '../../core/models/revision.model';
import { InstructorTraceComponent } from './instructor-trace.component';
import { RECONSIDERED_LABEL } from './reconsidered.util';

/**
 * L-02: la primera respuesta que el juego no aplicó (reintento) ya no se pinta como «Contraindicada» mientras el
 * contador de contraindicadas dice 0. Se ejercitan los ayudantes de presentación sobre el prototipo (el componente
 * inyecta servicios que aquí no hacen falta) y la plantilla como texto. F7-4: la insignia y el acento salen de la
 * biblioteca (tono de `ui-badge` y `data-accent`), no de clases de pixel art.
 */
const html = readFileSync(join(__dirname, 'instructor-trace.component.html'), 'utf-8');
const dialog = readFileSync(join(__dirname, 'trace-feedback-dialog.component.ts'), 'utf-8');
const panel = Object.create(InstructorTraceComponent.prototype) as InstructorTraceComponent;

const entry = (overrides: Partial<AttemptTimelineEntry>): AttemptTimelineEntry => ({
  atSeconds: 10, time: '00:10', type: 'DECISION_SELECTED', class: null, prohibited: false,
  label: 'Etiqueta', ...overrides,
});

const prohibitedRetry = entry({ type: 'PROHIBITED_DECISION_RETRY_REQUIRED', class: 'CONTRAINDICATED', prohibited: true });
const riskyRetry = entry({ type: 'DECISION_RETRY_REQUIRED', class: 'RISKY', prohibited: false });
const prohibitedRegistered = entry({ type: 'PROHIBITED_DECISION_SELECTED', class: 'CONTRAINDICATED', prohibited: true });

describe('panel del docente: respuestas reconsideradas (L-02)', () => {
  it('una fila de reintento lleva la etiqueta «Primera respuesta no aplicada (reintento)», sea contraindicada o con riesgo', () => {
    expect(panel.timelineEntryLabel(prohibitedRetry)).toBe(RECONSIDERED_LABEL);
    expect(panel.timelineEntryLabel(riskyRetry)).toBe(RECONSIDERED_LABEL);
  });

  it('una decisión prohibida registrada sigue siendo «Contraindicada» (el contador sí la cuenta)', () => {
    expect(panel.timelineEntryLabel(prohibitedRegistered)).toBe('Contraindicada');
  });

  it('la fila de reintento no se pinta de rojo ni con la insignia de contraindicación', () => {
    expect(panel.timelineEntryAccent(prohibitedRetry)).toBe('');
    expect(panel.timelineEntryTone(prohibitedRetry)).toBe('neutral');
    expect(panel.timelineEntryTone(riskyRetry)).toBe('neutral');
    expect(panel.timelineEntryAccent(prohibitedRegistered)).toBe('contraindicated');
    expect(panel.timelineEntryTone(prohibitedRegistered)).toBe('danger');
  });

  it('el texto de apoyo de la fila de reintento explica que no cuenta como decisión registrada', () => {
    expect(panel.timelineFeedback(prohibitedRetry)).toMatch(/no cuenta como decisión registrada/);
    expect(panel.timelineFeedback(prohibitedRetry)).not.toMatch(/contraindicado/);
    expect(panel.timelineFeedback(prohibitedRegistered)).toBe('Evento marcado como contraindicado en el recorrido del estudiante.');
  });

  it('la plantilla y el diálogo usan el tono propio de la fila y la plantilla muestra el contador de reconsideradas', () => {
    expect(html.match(/\[tone\]="timelineEntryTone\(entry\)"/g)?.length).toBe(1);
    expect(dialog.match(/\[tone\]="entryTone\(entry\)"/g)?.length).toBe(1);
    expect(html).toMatch(/@if \(item\.retries\) \{\s*<ui-badge>Reconsideradas: \{\{ item\.retries \}\}<\/ui-badge>/);
  });
});
