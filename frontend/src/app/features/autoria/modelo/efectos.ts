/**
 * Cambios pequeños y puros a lo que una respuesta mueve en el caso (`Respuesta.efectos`): los hitos que cumple, cómo se
 * mueve la persona y qué competencias evidencia. Cada función devuelve efectos nuevos y deja los anteriores como estaban.
 */
import type { RubricEvaluationView } from '../../../core/models/simulation.model';
import type { CompetenciaCaso, EfectosRespuesta } from './caso';

/** Quita lo que quedó vacío para que «sin efectos» sea siempre `{}`. */
function limpiar(efectos: EfectosRespuesta): EfectosRespuesta {
  const resultado: EfectosRespuesta = { ...efectos };
  if (!resultado.hitos?.length) delete resultado.hitos;
  if (resultado.competencias !== undefined && marcadas(resultado.competencias).length === 0) delete resultado.competencias;
  if (!resultado.persona) delete resultado.persona;
  return resultado;
}

const marcadas = (competencias: NonNullable<EfectosRespuesta['competencias']>): string[] =>
  Array.isArray(competencias) ? [...competencias] : Object.keys(competencias);

export function conHito(efectos: EfectosRespuesta, clave: string, cumple: boolean): EfectosRespuesta {
  const actuales = efectos.hitos ?? [];
  const hitos = cumple ? (actuales.includes(clave) ? actuales : [...actuales, clave]) : actuales.filter((h) => h !== clave);
  return limpiar({ ...efectos, hitos });
}

/** El paso de la persona que eligió la docente (modo propio): lo que no toca queda en cero. */
export function conPasoDePersona(efectos: EfectosRespuesta, paso: { bond?: number; activation?: number }): EfectosRespuesta {
  const actual = efectos.persona ?? {};
  return { ...efectos, persona: { bond: paso.bond ?? actual.bond ?? 0, activation: paso.activation ?? actual.activation ?? 0 } };
}

/** Modo automático: la respuesta no guarda ningún paso y el servidor usa el de su clase. */
export function sinPasoDePersona(efectos: EfectosRespuesta): EfectosRespuesta {
  const { persona: _persona, ...resto } = efectos;
  return resto;
}

/** Los códigos de las competencias que la respuesta evidencia. */
export function competenciasMarcadas(efectos: EfectosRespuesta): string[] {
  return efectos.competencias ? marcadas(efectos.competencias) : [];
}

export function conCompetencia(efectos: EfectosRespuesta, codigo: string, evidencia: boolean): EfectosRespuesta {
  const actuales = efectos.competencias;
  if (Array.isArray(actuales) || actuales === undefined) {
    const lista = actuales ?? [];
    return limpiar({ ...efectos, competencias: evidencia ? (lista.includes(codigo) ? lista : [...lista, codigo]) : lista.filter((c) => c !== codigo) });
  }
  // La respuesta ya traía un nivel por competencia: se conserva el de las que siguen.
  const niveles = { ...actuales };
  if (evidencia) niveles[codigo] = niveles[codigo] ?? null;
  else delete niveles[codigo];
  return limpiar({ ...efectos, competencias: niveles });
}

/** El código de una competencia en el catálogo: mayúsculas, sin tildes y con «_» (`Ética profesional` → `ETICA_PROFESIONAL`). */
export function codigoDeCompetencia(texto: string): string {
  const sinTildes = texto.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return sinTildes.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100).replace(/_+$/g, '');
}

/** Las competencias de la rúbrica del caso, cada una una vez y con su nombre (el primero que aparece). */
export function competenciasDeRubricas(rubricas: Pick<RubricEvaluationView, 'criteria'>[]): CompetenciaCaso[] {
  const vistas = new Map<string, CompetenciaCaso>();
  for (const rubrica of rubricas) {
    for (const criterio of rubrica.criteria) {
      const codigo = codigoDeCompetencia(criterio.competency ?? '');
      // La rúbrica «Competencias del programa» (RK-1) guarda el CÓDIGO del catálogo («ESCUCHA_ACTIVA»): a la vista va
      // entonces el título del criterio, que es el nombre de la competencia. Un nombre escrito a mano se deja como está.
      const esCodigo = criterio.competency.trim() === codigo && !!criterio.title?.trim();
      const nombre = esCodigo ? criterio.title.trim() : criterio.competency.trim();
      if (codigo && !vistas.has(codigo)) vistas.set(codigo, { codigo, nombre });
    }
  }
  return [...vistas.values()];
}
