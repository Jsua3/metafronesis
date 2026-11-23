import { RECONSIDERED_LABEL, RECONSIDERED_TEACHER_HINT, isRetryEventType, reconsideredChip } from './reconsidered.util';

describe('reconsidered.util: primeras respuestas que el juego no aplicó', () => {
  it('reconoce los dos eventos de reintento y ninguna decisión registrada', () => {
    expect(isRetryEventType('DECISION_RETRY_REQUIRED')).toBe(true);
    expect(isRetryEventType('PROHIBITED_DECISION_RETRY_REQUIRED')).toBe(true);
    expect(isRetryEventType('prohibited_decision_retry_required')).toBe(true);
    expect(isRetryEventType('DECISION_SELECTED')).toBe(false);
    expect(isRetryEventType('PROHIBITED_DECISION_SELECTED')).toBe(false);
    expect(isRetryEventType(null)).toBe(false);
    expect(isRetryEventType(undefined)).toBe(false);
  });

  it('el chip del estudiante solo aparece con reintentos y lleva la cifra', () => {
    expect(reconsideredChip(0)).toBeNull();
    expect(reconsideredChip(undefined)).toBeNull();
    expect(reconsideredChip(1)).toBe('Reconsideradas: 1');
    expect(reconsideredChip(6)).toBe('Reconsideradas: 6');
  });

  it('la etiqueta del docente no dice «contraindicada» ni usa claves internas', () => {
    expect(RECONSIDERED_LABEL).toBe('Primera respuesta no aplicada (reintento)');
    expect(RECONSIDERED_LABEL).not.toMatch(/contraindicad/i);
    expect(RECONSIDERED_TEACHER_HINT).not.toMatch(/contraindicad|RETRY|PROHIBITED/);
    expect(RECONSIDERED_TEACHER_HINT).toMatch(/no cuenta como decisión registrada/);
  });
});
