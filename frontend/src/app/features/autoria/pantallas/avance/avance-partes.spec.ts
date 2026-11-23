import type { Generation } from '../../../../core/models/generacion.model';
import { partesDeLaGeneracion } from './avance-partes';

const ESCENAS = [
  { clave: 'recepcion', titulo: 'Recepción', final: false },
  { clave: 'consulta', titulo: 'Primera escucha', final: false },
  { clave: 'cierre', titulo: 'Cierre', final: true },
];

function generacion(cambios: Partial<Generation>): Generation {
  return {
    id: 'g-1', lugarId: 'universidad', descripcion: 'Una estudiante llega a Bienestar.', status: 'skeleton_ready',
    skeleton: { titulo: 'Caso de prueba', escenas: ESCENAS },
    scenes: ESCENAS.map((e) => ({ clave: e.clave, titulo: e.titulo, state: 'done', error: null })),
    repairRounds: 0, repair: null, lastError: null, caseVersionId: null, issues: [], callsUsed: 4, callsLimit: 20,
    createdAt: '2026-11-20T15:00:00Z', updatedAt: '2026-11-20T15:01:00Z',
    ...cambios,
  };
}

const estados = (g: Generation, reintentando: string | null, etapa: Parameters<typeof partesDeLaGeneracion>[0]['etapa']) =>
  Object.fromEntries(partesDeLaGeneracion({ g, error: null, etapa, trabajando: true, reintentando, rondasVistas: {} })
    .map((p) => [p.clave, p.estado]));

describe('partesDeLaGeneracion: lo que pidió «Reintentar» no sobrevive a su etapa', () => {
  it('el reintento de la revisión la marca en curso mientras la generación sigue lista para revisarse', () => {
    expect(estados(generacion({ status: 'scenes_ready' }), 'reglas', null)['reglas']).toBe('en-curso');
  });

  it('si la revisión reintentada pidió corregir, solo la corrección está en curso (la revisión vuelve a pendiente)', () => {
    const g = generacion({
      status: 'needs_repair', repairRounds: 1,
      repair: { round: 1, scenes: ['consulta'], issues: { consulta: [] } },
      scenes: ESCENAS.map((e) => ({ clave: e.clave, titulo: e.titulo, state: e.clave === 'consulta' ? 'pending' : 'done', error: null })),
    });
    const porParte = estados(g, 'reglas', { tipo: 'reparando', ronda: 1, titulo: 'Primera escucha', claves: ['consulta'] });

    expect(porParte['reglas']).toBe('pendiente');
    expect(porParte['reparacion-1']).toBe('en-curso');
    expect(Object.values(porParte).filter((e) => e === 'en-curso')).toHaveLength(1);
  });

  it('una etapa de revisión vieja tampoco la marca en curso fuera de `scenes_ready`', () => {
    const g = generacion({ status: 'imported', caseVersionId: 7 });
    expect(estados(g, null, { tipo: 'reglas' })['reglas']).toBe('hecha');
    const fallida = generacion({ status: 'needs_repair', repairRounds: 1, repair: { round: 1, scenes: ['consulta'], issues: {} } });
    expect(estados(fallida, null, { tipo: 'reglas' })['reglas']).toBe('pendiente');
  });
});


it('una falta DSL.OCL-14 de la generación aparece con su mensaje en la revisión de las reglas', () => {
  const mensaje = 'La pieza está fuera de la sala.';
  const g = generacion({
    status: 'imported', caseVersionId: 7,
    issues: [{ code: 'DSL.OCL-14', severity: 'error', message: mensaje, path: 'x-siep.escenas[0].mapa' }],
  });
  const reglas = partesDeLaGeneracion({ g, error: null, etapa: null, trabajando: false, reintentando: null, rondasVistas: {} })
    .find((parte) => parte.clave === 'reglas');
  expect(reglas?.faltas).toEqual([mensaje]);
});
