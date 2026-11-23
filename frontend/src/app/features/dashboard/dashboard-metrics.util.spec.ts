import { StudentAttemptSummary } from '../../core/models/simulation.model';
import {
  attemptStateLabel,
  completedAttemptCount,
  metricDisplay,
  totalActiveSeconds
} from './dashboard-metrics.util';

function attempt(partial: Partial<StudentAttemptSummary>): StudentAttemptSummary {
  return {
    attemptId: 'a', caseVersionId: 1, caseTitle: 'Caso', status: 'COMPLETED', totalDurationSeconds: null,
    activeDurationSeconds: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null,
    ...partial,
  };
}

describe('dashboard-metrics.util', () => {
  it('metricDisplay muestra el 0 como 0 y respeta los textos', () => {
    expect(metricDisplay(0)).toBe('0');
    expect(metricDisplay(12)).toBe('12');
    expect(metricDisplay('Sin datos')).toBe('Sin datos');
  });

  it('completedAttemptCount solo cuenta los intentos COMPLETED', () => {
    const history = [
      attempt({ status: 'COMPLETED' }),
      attempt({ status: 'SAFE_EXITED' }),
      attempt({ status: 'PAUSED' }),
      attempt({ status: 'IN_PROGRESS' }),
      attempt({ status: 'COMPLETED' }),
    ];
    expect(completedAttemptCount(history)).toBe(2);
  });

  it('totalActiveSeconds suma solo los tiempos informados', () => {
    expect(totalActiveSeconds([])).toBeNull();
    expect(totalActiveSeconds([attempt({ activeDurationSeconds: null })])).toBeNull();
    expect(totalActiveSeconds([
      attempt({ activeDurationSeconds: 300 }),
      attempt({ activeDurationSeconds: null, totalDurationSeconds: 86_400 }),
      attempt({ activeDurationSeconds: 120 }),
    ])).toBe(420);
  });

  it('completedAttemptCount sirve también para intentos que solo traen el estado', () => {
    expect(completedAttemptCount([
      { status: 'COMPLETED' },
      { status: 'SAFE_EXITED' },
      { status: 'IN_PROGRESS' },
    ])).toBe(1);
    expect(completedAttemptCount([])).toBe(0);
  });

  it('attemptStateLabel distingue interrumpido de completado', () => {
    expect(attemptStateLabel('COMPLETED')).toBe('Completado');
    expect(attemptStateLabel('COMPLETADO')).toBe('Completado');
    expect(attemptStateLabel('SAFE_EXITED')).toBe('Interrumpido');
    expect(attemptStateLabel('PAUSED')).toBe('En pausa');
    expect(attemptStateLabel('EN_PAUSA')).toBe('En pausa');
    expect(attemptStateLabel('PENDIENTE')).toBe('Pendiente');
    expect(attemptStateLabel('IN_PROGRESS')).toBe('En curso');
    expect(attemptStateLabel('EN_PROGRESO')).toBe('En curso');
  });

  it('attemptStateLabel no confunde un intento reemplazado con uno en curso', () => {
    expect(attemptStateLabel('REPLACED')).toBe('Reemplazado');
  });
});
