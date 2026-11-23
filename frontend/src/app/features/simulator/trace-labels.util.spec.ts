import { AttemptTimelineEntry, TraceEvent } from '../../core/models/revision.model';
import { responseClassWord } from './outcome-text.util';
import { RECONSIDERED_LABEL } from './reconsidered.util';
import {
  decisionFeedback, esDecisionRegistrada, esFilaDeDecision, eventTypeLabel, formativeLevelLabel, formativeLevelTone,
  haceCuanto, nombreDeCompetencia, nombreDeSala, responseClassAccent, responseClassLabel, responseClassTone, textoDeFila,
  timelineEntryAccent, timelineEntryLabel, timelineEntryTone, timelineFeedback,
} from './trace-labels.util';

/**
 * Rótulos de la traza docente por clase de respuesta (modelo de métricas). La palabra de cada clase tiene UNA fuente
 * (`responseClassWord`, la misma del cierre del estudiante): aquí se comprueba que la traza no la copia ni la cambia.
 */
const CLASSES = ['RECOMMENDED', 'ACCEPTABLE', 'RISKY', 'CONTRAINDICATED'] as const;

const entry = (overrides: Partial<AttemptTimelineEntry> = {}): AttemptTimelineEntry => ({
  atSeconds: 10, time: '00:10', type: 'DECISION_SELECTED', class: null, prohibited: false, label: 'x', ...overrides,
});

const event = (overrides: Partial<TraceEvent> = {}): TraceEvent => ({
  type: 'DECISION_SELECTED', class: null, nodeTitle: null, decisionText: null, detail: null, occurredAt: '2026-10-10T10:00:00Z',
  ...overrides,
});

describe('rótulos de la traza docente', () => {
  it('las cuatro clases salen con las palabras de siempre y vienen de la misma fuente que el cierre del estudiante', () => {
    expect(CLASSES.map(responseClassLabel)).toEqual(['Recomendada', 'Aceptable', 'Con riesgo', 'Contraindicada']);
    for (const responseClass of CLASSES) expect(responseClassLabel(responseClass)).toBe(responseClassWord(responseClass));
  });

  it('una clase desconocida o ausente no inventa una palabra: dice «Decisión»', () => {
    expect(responseClassLabel(null)).toBe('Decisión');
    expect(responseClassLabel('ADEQUATE')).toBe('Decisión');
  });

  it('cada clase tiene su tono y su acento, y lo ausente queda neutro y sin acento', () => {
    expect(CLASSES.map(responseClassTone)).toEqual(['success', 'info', 'warning', 'danger']);
    expect(CLASSES.map(responseClassAccent)).toEqual(['recommended', 'acceptable', 'risky', 'contraindicated']);
    expect(responseClassTone(null)).toBe('neutral');
    expect(responseClassAccent('ADEQUATE')).toBe('');
  });

  it('un evento sin clase se nombra por su tipo', () => {
    expect(eventTypeLabel('REFLECTION_SAVED')).toBe('Reflexión');
    expect(eventTypeLabel('TOOL_USED')).toBe('Recurso');
    expect(eventTypeLabel('ROOM_ENTERED')).toBe('Evento');
  });

  it('el texto de apoyo de una decisión depende de su clase y nunca habla de puntaje ni de estrés', () => {
    const texts = CLASSES.map(responseClass => decisionFeedback(event({ class: responseClass })));
    expect(new Set(texts).size).toBe(4);
    expect(decisionFeedback(event({ type: 'PROHIBITED_DECISION_SELECTED', class: null }))).toContain('Conducta contraindicada');
    expect(texts.join(' ')).not.toMatch(/puntaje|estrés|impacto/i);
  });

  it('la línea de tiempo: la fila lleva la palabra de su clase; contraindicada si está marcada; el reintento, aparte', () => {
    expect(timelineEntryLabel(entry({ class: 'RISKY' }))).toBe('Con riesgo');
    expect(timelineEntryLabel(entry({ class: 'CONTRAINDICATED', prohibited: true }))).toBe('Contraindicada');
    expect(timelineEntryLabel(entry({ type: 'TOOL_USED' }))).toBe('Recurso');
    expect(timelineEntryLabel(entry({ type: 'DECISION_RETRY_REQUIRED', class: 'RISKY' }))).toBe(RECONSIDERED_LABEL);
    expect(timelineEntryTone(entry({ class: 'ACCEPTABLE' }))).toBe('info');
    expect(timelineEntryAccent(entry({ class: 'RECOMMENDED' }))).toBe('recommended');
    expect(timelineEntryAccent(entry({ type: 'PROHIBITED_DECISION_RETRY_REQUIRED', class: 'CONTRAINDICATED', prohibited: true }))).toBe('');
    expect(CLASSES.map(responseClass => timelineFeedback(entry({ class: responseClass }))).join(' ')).not.toMatch(/puntaje|estrés/i);
  });

  it('los niveles formativos de la valoración siguen siendo palabras sin nota', () => {
    expect(['EN_INICIO', 'EN_PROCESO', 'LOGRADO', 'DESTACADO'].map(formativeLevelLabel)).toEqual(['En inicio', 'En proceso', 'Logrado', 'Destacado']);
    expect(formativeLevelLabel(null)).toBe('Pendiente');
    expect(formativeLevelTone('EN_INICIO')).toBe('neutral');
  });

  // Revisión en columnas (B5b): la línea de tiempo muestra decisiones por defecto y sin claves del sistema a la vista.
  describe('revisión en columnas (B5b)', () => {
    it('decisión es la registrada y la reconsiderada; puertas, recursos y reemplazos son eventos del sistema', () => {
      for (const type of ['DECISION_SELECTED', 'PROHIBITED_DECISION_SELECTED', 'DECISION_RETRY_REQUIRED']) {
        expect(esFilaDeDecision({ type }), type).toBe(true);
      }
      for (const type of ['ROOM_ENTERED', 'TOOL_USED', 'ATTEMPT_REPLACED', 'SAFE_EXIT_REQUESTED']) {
        expect(esFilaDeDecision({ type }), type).toBe(false);
      }
      expect(esDecisionRegistrada({ type: 'DECISION_SELECTED' })).toBe(true);
      expect(esDecisionRegistrada({ type: 'DECISION_RETRY_REQUIRED' })).toBe(false);
    });

    it('una puerta se dice con el nombre de la sala, y una clave desconocida no se muestra', () => {
      expect(nombreDeSala('hospital-sala-escucha')).toBe('la sala de escucha (hospital)');
      expect(nombreDeSala('comisaria-recepcion')).toBe('la recepción (comisaría)');
      expect(nombreDeSala('nave-espacial')).toBeNull();
      expect(textoDeFila({ label: 'Puerta hacia sala comisaria-consultorio' })).toBe('Entró en el consultorio (comisaría)');
      expect(textoDeFila({ label: 'Puerta hacia sala nave-x' })).toBe('Cambió de sala');
      expect(textoDeFila({ label: 'Escucha activa' })).toBe('Escucha activa');
      expect(textoDeFila({ label: '' })).toBe('Evento registrado');
    });

    it('las claves de competencia en mayúsculas se dicen en palabras', () => {
      expect(nombreDeCompetencia(null, 'MARCO_NORMATIVO')).toBe('Marco normativo');
      expect(nombreDeCompetencia('MARCO_NORMATIVO', 'MARCO_NORMATIVO')).toBe('Marco normativo');
      expect(nombreDeCompetencia('Ética profesional', 'ETICA_PROFESIONAL')).toBe('Ética profesional');
      expect(nombreDeCompetencia('', '')).toBe('Competencia');
    });

    it('cuándo pasó, en palabras', () => {
      const ahora = Date.parse('2026-11-21T12:00:00Z');
      expect(haceCuanto('2026-11-19T12:00:00Z', ahora)).toBe('hace 2 días');
      expect(haceCuanto('2026-11-21T09:00:00Z', ahora)).toBe('hace 3 horas');
      expect(haceCuanto('2026-11-21T11:59:40Z', ahora)).toBe('hace un momento');
      expect(haceCuanto(null, ahora)).toBe('');
    });
  });
});
