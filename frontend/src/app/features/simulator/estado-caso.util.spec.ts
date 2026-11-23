import { CatalogItem, StudentAttemptSummary } from '../../core/models/simulation.model';
import { estadoCaso, ultimoRecorrido } from './estado-caso.util';

const caso: CatalogItem = { caseVersionId: 1, code: 'C1', title: 'Caso uno', description: '', order: 1, unlocked: true, completed: false, locked: false };
const segundo: CatalogItem = { ...caso, caseVersionId: 2, code: 'C2', title: 'Caso dos', order: 2, unlocked: false, locked: true };
const intento = (status: StudentAttemptSummary['status'], extra: Partial<StudentAttemptSummary> = {}): StudentAttemptSummary => ({
  attemptId: 'a', caseVersionId: 1, caseTitle: 'Caso uno', status, totalDurationSeconds: null, activeDurationSeconds: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null, ...extra,
});

describe('estadoCaso', () => {
  it('un intento abierto manda, incluso si el caso quedó bloqueado (RN-07)', () => {
    expect(estadoCaso({ ...caso, unlocked: false }, [intento('PAUSED')])).toMatchObject({ clave: 'en-pausa', etiqueta: 'En pausa', abierto: true });
    expect(estadoCaso(caso, [intento('IN_PROGRESS')])).toMatchObject({ clave: 'en-curso', etiqueta: 'En curso', abierto: true });
  });

  it('distingue terminado y sin empezar; un reemplazado no cuenta como empezado', () => {
    expect(estadoCaso(caso, [intento('COMPLETED')]).clave).toBe('terminado');
    expect(estadoCaso({ ...caso, completed: true }, []).clave).toBe('terminado');
    expect(estadoCaso(caso, [intento('REPLACED')]).clave).toBe('sin-empezar');
  });

  it('el bloqueo por secuencia nombra el caso anterior', () => {
    const estado = estadoCaso(segundo, [], [caso, segundo]);
    expect(estado).toMatchObject({ clave: 'bloqueado', etiqueta: 'Bloqueado' });
    expect(estado.detalle).toBe('Se abre al terminar «Caso uno».');
  });

  it('el bloqueo por ventana dice cuándo abre o cuándo cerró, con la fecha del servidor', () => {
    const abre = estadoCaso({ ...segundo, access: { allowed: false, reason: 'NOT_YET_OPEN', opensAt: '2026-12-03T08:00:00' } }, []);
    expect(abre.clave).toBe('aun-no-abre');
    expect(abre.etiqueta).toMatch(/^Se abre el .*2026/);
    const cierra = estadoCaso({ ...segundo, access: { allowed: false, reason: 'CLOSED', closesAt: '2026-10-03T08:00:00' } }, []);
    expect(cierra.clave).toBe('cerrado');
    expect(cierra.etiqueta).toMatch(/^Cerró el .*2026/);
  });

  it('sin fecha no inventa ninguna', () => {
    expect(estadoCaso({ ...segundo, access: { allowed: false, reason: 'NOT_YET_OPEN' } }, []).etiqueta).toBe('Aún no abre');
    expect(estadoCaso({ ...segundo, access: { allowed: false, reason: 'CLOSED' } }, []).etiqueta).toBe('Ya cerró');
  });
});

describe('ultimoRecorrido', () => {
  it('devuelve el intento revisable más reciente, del caso pedido', () => {
    const historial = [
      intento('COMPLETED', { attemptId: 'viejo', startedAt: '2026-09-01T10:00:00Z' }),
      intento('COMPLETED', { attemptId: 'nuevo', startedAt: '2026-09-05T10:00:00Z' }),
      intento('PAUSED', { attemptId: 'abierto', startedAt: '2026-09-09T10:00:00Z' }),
      intento('COMPLETED', { attemptId: 'otro', caseVersionId: 2, startedAt: '2026-09-10T10:00:00Z' }),
    ];
    expect(ultimoRecorrido(historial, 1)?.attemptId).toBe('nuevo');
    expect(ultimoRecorrido(historial)?.attemptId).toBe('otro');
    expect(ultimoRecorrido([intento('PAUSED')])).toBeNull();
  });
});
