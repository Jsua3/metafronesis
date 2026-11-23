import type { RubricEvaluationView } from '../../../core/models/simulation.model';
import {
  codigoDeCompetencia, competenciasDeRubricas, competenciasMarcadas, conCompetencia, conHito, conPasoDePersona, sinPasoDePersona,
} from './efectos';

describe('lo que una respuesta mueve: hitos, persona y competencias', () => {
  it('marca y desmarca un hito sin tocar lo demás', () => {
    const marcado = conHito({ persona: { bond: 1 } }, 'valorar_el_riesgo', true);
    expect(marcado).toEqual({ persona: { bond: 1 }, hitos: ['valorar_el_riesgo'] });
    expect(conHito(marcado, 'valorar_el_riesgo', true).hitos).toEqual(['valorar_el_riesgo']); // sin repetirlo
    expect(conHito(marcado, 'valorar_el_riesgo', false)).toEqual({ persona: { bond: 1 } });
  });

  it('en modo propio guarda el paso que eligió la docente; lo que no tocó queda en cero', () => {
    expect(conPasoDePersona({}, { bond: 1 })).toEqual({ persona: { bond: 1, activation: 0 } });
    expect(conPasoDePersona({ persona: { bond: 1, activation: 0 } }, { activation: -1 })).toEqual({ persona: { bond: 1, activation: -1 } });
  });

  it('en modo automático no se guarda ningún paso', () => {
    expect(sinPasoDePersona({ hitos: ['a'], persona: { bond: -1, activation: 1 } })).toEqual({ hitos: ['a'] });
  });

  it('marca y desmarca una competencia (una lista de códigos)', () => {
    const una = conCompetencia({}, 'ETICA_PROFESIONAL', true);
    expect(una.competencias).toEqual(['ETICA_PROFESIONAL']);
    const dos = conCompetencia(una, 'ESCUCHA_ACTIVA', true);
    expect(competenciasMarcadas(dos)).toEqual(['ETICA_PROFESIONAL', 'ESCUCHA_ACTIVA']);
    expect(conCompetencia(dos, 'ETICA_PROFESIONAL', false)).toEqual({ competencias: ['ESCUCHA_ACTIVA'] });
    expect(conCompetencia({ competencias: ['A'] }, 'A', false)).toEqual({});
  });

  it('si la respuesta ya traía niveles por competencia, los conserva al marcar otra', () => {
    const conNiveles = { competencias: { ETICA: 'LOGRADO' as const, ESCUCHA: null } };
    expect(competenciasMarcadas(conNiveles)).toEqual(['ETICA', 'ESCUCHA']);
    expect(conCompetencia(conNiveles, 'NUEVA', true).competencias).toEqual({ ETICA: 'LOGRADO', ESCUCHA: null, NUEVA: null });
    expect(conCompetencia(conNiveles, 'ETICA', false).competencias).toEqual({ ESCUCHA: null });
  });
});

describe('las competencias del caso salen de su rúbrica', () => {
  const rubrica = (competencias: string[]): RubricEvaluationView => ({
    rubricId: 1, rubricName: 'Rúbrica', description: null, scores: [], comment: null,
    criteria: competencias.map((competency, i) => ({ id: i + 1, competency, title: `Criterio ${i}`, description: null, displayOrder: i })),
  });

  it('el código es el del catálogo: mayúsculas, sin tildes y con «_»', () => {
    expect(codigoDeCompetencia('Ética profesional')).toBe('ETICA_PROFESIONAL');
    expect(codigoDeCompetencia('  Comunicación   empática!  ')).toBe('COMUNICACION_EMPATICA');
    expect(codigoDeCompetencia('???')).toBe('');
  });

  it('lista cada competencia una vez, con su nombre, y salta las que no tienen código', () => {
    expect(competenciasDeRubricas([rubrica(['Ética profesional', 'Escucha activa']), rubrica(['ética profesional', '??'])])).toEqual([
      { codigo: 'ETICA_PROFESIONAL', nombre: 'Ética profesional' },
      { codigo: 'ESCUCHA_ACTIVA', nombre: 'Escucha activa' },
    ]);
  });

  it('E5 · si el criterio guarda el código del catálogo (rúbrica de las competencias del programa), se muestra su título', () => {
    const programa: RubricEvaluationView = {
      rubricId: 2, rubricName: 'Competencias del programa', description: null, scores: [], comment: null,
      criteria: [{ id: 1, competency: 'ESCUCHA_ACTIVA', title: 'Escucha activa', description: null, displayOrder: 1 }],
    };
    expect(competenciasDeRubricas([programa])).toEqual([{ codigo: 'ESCUCHA_ACTIVA', nombre: 'Escucha activa' }]);
  });
});
