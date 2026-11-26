import { Assignment } from '../../core/models/assignment.model';
import { SimulationCaseSummary } from '../../core/models/revision.model';
import { loSiguienteDocente } from './lo-siguiente.util';

const caso = (id: number, title: string) => ({ caseVersionId: id, title, status: 'PUBLISHED' }) as SimulationCaseSummary;
const asignacion = (caseVersionId: number) => ({ id: caseVersionId * 10, caseVersionId, active: true }) as Assignment;
const base = { publicados: [caso(9, 'Violencia en el aula')], asignaciones: [] as Assignment[], grupos: 2, porRevisar: 0 };

describe('«Lo siguiente» del docente', () => {
  it('un caso publicado que ningún grupo tiene se dice con su nombre y se ofrece asignarlo', () => {
    const pasos = loSiguienteDocente(base);
    expect(pasos).toHaveLength(1);
    expect(pasos[0].texto).toBe('Tu caso «Violencia en el aula» está publicado y no está asignado a ningún grupo.');
    expect(pasos[0].accion).toEqual({ tipo: 'asignar', caseVersionId: 9, titulo: 'Violencia en el aula' });
  });

  it('un caso ya asignado (aunque esté en pausa o cerrado) no se vuelve a ofrecer', () => {
    expect(loSiguienteDocente({ ...base, asignaciones: [asignacion(9)] })).toEqual([]);
  });

  it('con varios casos sin asignar los cuenta y nombra el primero', () => {
    const pasos = loSiguienteDocente({ ...base, publicados: [caso(9, 'Caso A'), caso(10, 'Caso B'), caso(11, 'Caso C')], asignaciones: [asignacion(10)] });
    expect(pasos[0].texto).toBe('Tienes 2 casos publicados sin asignar a ningún grupo, como «Caso A».');
    expect(pasos[0].accion).toMatchObject({ tipo: 'asignar', caseVersionId: 9 });
  });

  it('sin grupos no ofrece asignar: lleva a crear el primero', () => {
    const pasos = loSiguienteDocente({ ...base, grupos: 0 });
    expect(pasos[0].id).toBe('crear-grupo');
    expect(pasos[0].texto).toContain('aún no tienes un grupo');
    expect(pasos[0].accion).toEqual({ tipo: 'enlace', etiqueta: 'Crear un grupo', ruta: '/portal/grupos' });
  });

  it('los intentos por revisar van primero, en singular y plural, y llevan a la bandeja filtrada', () => {
    const uno = loSiguienteDocente({ ...base, porRevisar: 1 });
    expect(uno[0].texto).toBe('Hay 1 intento terminado por revisar.');
    const varios = loSiguienteDocente({ ...base, porRevisar: 3 });
    expect(varios.map(paso => paso.id)).toEqual(['revisar', 'asignar']);
    expect(varios[0].texto).toBe('Hay 3 intentos terminados por revisar.');
    expect(varios[0].accion).toEqual({ tipo: 'enlace', etiqueta: 'Revisar', ruta: '/portal/docente/trazabilidad', parametros: { evaluacion: 'pendiente' } });
  });

  it('nunca dice una cosa que no sabe: una fuente caída no produce frase', () => {
    expect(loSiguienteDocente({ publicados: null, asignaciones: [], grupos: 1, porRevisar: null })).toEqual([]);
    expect(loSiguienteDocente({ publicados: [caso(9, 'A')], asignaciones: null, grupos: 1, porRevisar: null })).toEqual([]);
    // Con las asignaciones caídas, sigue diciendo lo que sí sabe (lo por revisar).
    expect(loSiguienteDocente({ publicados: [caso(9, 'A')], asignaciones: null, grupos: 1, porRevisar: 2 }).map(paso => paso.id)).toEqual(['revisar']);
  });

  it('sin nada pendiente devuelve una lista vacía', () => {
    expect(loSiguienteDocente({ ...base, publicados: [] })).toEqual([]);
  });
});
