import { Assignment } from '../../core/models/assignment.model';
import { SimulationCaseSummary } from '../../core/models/revision.model';

/**
 * Lo que la docente puede hacer ahora, en una o dos frases con su acción (P6). Va aparte de la pantalla para que se
 * pueda probar sin pintar nada y para que quien redacta los textos los revise sin abrir la plantilla.
 *
 * Reglas:
 * - Solo se dice lo que se SABE: una fuente que no se pudo leer (`null`) no produce ninguna frase, y nunca se
 *   declara «todo al día» con una fuente caída (eso lo decide la pantalla con `completo`).
 * - Los intentos por revisar mandan: son personas esperando una devolución. Después, un caso publicado que ningún grupo
 *   tiene: está listo y no lo ve nadie.
 * - Como mucho dos frases: más de dos es una lista de tareas, no un «qué sigue».
 */
export type AccionSiguiente =
  | { tipo: 'enlace'; etiqueta: string; ruta: string; parametros?: Record<string, string | number> }
  | { tipo: 'asignar'; caseVersionId: number; titulo: string };

export interface PasoSiguiente {
  id: 'revisar' | 'asignar' | 'crear-grupo';
  texto: string;
  accion: AccionSiguiente;
}

export interface EntradaLoSiguiente {
  /** Los casos publicados de la docente; `null` si no se pudieron leer. */
  publicados: readonly SimulationCaseSummary[] | null;
  /** TODAS las asignaciones de sus grupos; `null` si no se pudieron leer. */
  asignaciones: readonly Assignment[] | null;
  /** Cuántos grupos tiene; `null` si no se pudo leer. */
  grupos: number | null;
  /** Intentos terminados sin valoración; `null` si no se pudo leer. */
  porRevisar: number | null;
}

export const MAX_PASOS_SIGUIENTES = 2;

export function loSiguienteDocente(entrada: EntradaLoSiguiente): PasoSiguiente[] {
  const pasos: PasoSiguiente[] = [];

  if (entrada.porRevisar && entrada.porRevisar > 0) {
    const n = entrada.porRevisar;
    pasos.push({
      id: 'revisar',
      texto: n === 1 ? 'Hay 1 intento terminado por revisar.' : `Hay ${n} intentos terminados por revisar.`,
      accion: { tipo: 'enlace', etiqueta: 'Revisar', ruta: '/portal/docente/trazabilidad', parametros: { evaluacion: 'pendiente' } },
    });
  }

  if (entrada.publicados && entrada.asignaciones) {
    const asignados = new Set(entrada.asignaciones.map(asignacion => asignacion.caseVersionId));
    const sinAsignar = entrada.publicados.filter(caso => !asignados.has(caso.caseVersionId));
    if (sinAsignar.length) {
      const primero = sinAsignar[0];
      if (entrada.grupos === 0) {
        pasos.push({
          id: 'crear-grupo',
          texto: sinAsignar.length === 1
            ? `Tu caso «${primero.title}» está publicado, pero aún no tienes un grupo donde asignarlo.`
            : `Tienes ${sinAsignar.length} casos publicados, como «${primero.title}», y aún no tienes un grupo donde asignarlos.`,
          accion: { tipo: 'enlace', etiqueta: 'Crear un grupo', ruta: '/portal/grupos' },
        });
      } else {
        pasos.push({
          id: 'asignar',
          texto: sinAsignar.length === 1
            ? `Tu caso «${primero.title}» está publicado y no está asignado a ningún grupo.`
            : `Tienes ${sinAsignar.length} casos publicados sin asignar a ningún grupo, como «${primero.title}».`,
          accion: { tipo: 'asignar', caseVersionId: primero.caseVersionId, titulo: primero.title },
        });
      }
    }
  }

  return pasos.slice(0, MAX_PASOS_SIGUIENTES);
}
