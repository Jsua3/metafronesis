/**
 * Funciones puras de la pantalla «Rúbrica» del caso (EDITOR.md §5.3): en qué estado está la rúbrica de la versión y cómo
 * se pinta cada criterio con las respuestas que lo evidencian. Separadas del componente para probarlas sin montarlo.
 */
import type { RubricAdmin } from '../../../../core/api/rubric.service';
import { codigoDeCompetencia } from '../../modelo/efectos';
import type { FichaDeRespuesta } from '../evaluacion/fichas-de-respuestas.component';

/** Un criterio de la rúbrica tal como lo usa la pantalla. */
export interface CriterioDeRubrica {
  /** El código de su competencia (el que marcan las respuestas). */
  codigo: string;
  titulo: string;
  /** El nombre o el código de la competencia, como lo guardó el servidor. */
  competencia: string;
  /** El peso en por ciento; `null` si no se conoce (sin servidor). */
  peso: number | null;
  descripcion: string;
}

/** La rúbrica que tiene el caso, reducida a lo que se pinta. */
export interface RubricaDelCaso {
  id: number;
  nombre: string;
  criterios: CriterioDeRubrica[];
}

/** Los estados de la pantalla (State): uno a la vez, cada uno con lo que necesita. */
export type VistaRubrica =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'sin-rubrica' }
  | { tipo: 'propia' | 'compartida' | 'predeterminada'; rubrica: RubricaDelCaso };

/** Un criterio con las respuestas que lo evidencian. */
export interface CriterioVista extends CriterioDeRubrica {
  evidencias: FichaDeRespuesta[];
}

/**
 * Qué rúbrica es la del caso, por lo que dice el servidor (RK-3): la PROPIA lleva `caseVersion` de esta versión; la
 * predeterminada, `isDefault`; cualquier otra es una rúbrica compartida asignada (los casos anteriores a RK-1).
 */
export function tipoDeRubrica(rubrica: RubricAdmin, caseVersionId: number): VistaRubrica {
  const tipo = rubrica.caseVersion?.id === caseVersionId ? 'propia' : rubrica.isDefault ? 'predeterminada' : 'compartida';
  const criterios = (rubrica.criteria ?? [])
    .filter((c) => c.active)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((c) => ({
      codigo: codigoDeCompetencia(c.competency || c.title),
      titulo: c.title.trim(),
      competencia: (c.competency ?? '').trim(),
      peso: Number.isFinite(Number(c.weight)) ? Math.round(Number(c.weight) * 100) / 100 : null,
      descripcion: (c.description ?? '').trim(),
    }));
  return { tipo, rubrica: { id: rubrica.id, nombre: rubrica.name, criterios } };
}

/** Cada criterio con las respuestas que marcan su competencia (las fichas de «Dónde se evidencia»). */
export function criteriosDe(rubrica: RubricaDelCaso, evidencias: ReadonlyMap<string, FichaDeRespuesta[]>): CriterioVista[] {
  return rubrica.criterios.map((c) => ({ ...c, evidencias: evidencias.get(c.codigo) ?? [] }));
}

/** «25 %» (con coma decimal si hace falta): el peso se dice como en la biblioteca de rúbricas. */
export function pesoEnPalabras(peso: number | null): string {
  if (peso === null) return '';
  return `${String(peso).replace('.', ',')} %`;
}
