import { Assignment } from '../../core/models/assignment.model';

/**
 * La secuencia en que un grupo hace sus casos (RN-04, RF-15). El servidor (`apps/progression/access.py`) ordena las
 * asignaciones activas del estudiante por su orden y le exige terminar cada caso para abrir el siguiente; lo que se
 * salta son los casos cuya ventana ya cerró (nadie los puede empezar) y los que están en pausa (no cuentan). Estas
 * funciones puras dicen eso en palabras al docente, con la misma regla, para que no se entere por el estudiante.
 */

/** Las asignaciones en el orden de la secuencia (el orden y, a igual orden, el caso: igual que el servidor). */
export function enSecuencia(asignaciones: readonly Assignment[]): Assignment[] {
  return [...asignaciones].sort((a, b) => a.sortOrder - b.sortOrder || a.caseId - b.caseId || a.caseVersionId - b.caseVersionId);
}

/** ¿Esta asignación hace esperar a las que le siguen? Activa y con la ventana sin cerrar. */
export function haceEsperar(asignacion: Assignment): boolean {
  return asignacion.active && asignacion.state !== 'CLOSED';
}

/**
 * El caso que los estudiantes deben terminar antes de empezar uno colocado AL FINAL de `asignaciones`: el último que hace
 * esperar. Basta con él porque cada caso exige a su vez terminar el anterior. `null` si el nuevo se podría empezar ya.
 */
export function previaDelUltimo(asignaciones: readonly Assignment[]): Assignment | null {
  return [...enSecuencia(asignaciones)].reverse().find(haceEsperar) ?? null;
}

/** El título con que se nombra una asignación; sin él (un servidor anterior) se dice sin inventar uno. */
export function tituloDe(asignacion: Assignment, titulos?: ReadonlyMap<number, string>): string {
  return asignacion.caseTitle?.trim() || titulos?.get(asignacion.caseVersionId) || 'el caso anterior';
}

/**
 * Lo que la docente debe saber al asignar un caso nuevo (va al final de la secuencia): cuándo lo podrán empezar sus
 * estudiantes. Con una apertura programada dice también que no abrirá antes de esa fecha.
 */
export function fraseDeSecuencia(previa: string | null, conApertura = false): string {
  if (previa) return `Tus estudiantes lo harán después de terminar «${previa}».`;
  return conApertura
    ? 'No hay otro caso por terminar antes: tus estudiantes podrán empezarlo cuando se abra.'
    : 'Tus estudiantes pueden empezarlo de inmediato.';
}

/** Una línea por fila de «Casos asignados»: cuándo se abre cada caso respecto de los anteriores. */
export function lineaDeSecuencia(ordenadas: readonly Assignment[], titulos?: ReadonlyMap<number, string>): string[] {
  return ordenadas.map((asignacion, indice) => {
    if (!asignacion.active) return 'En pausa: no cuenta en la secuencia.';
    if (asignacion.state === 'CLOSED') return 'Ya cerró: no hace esperar a los siguientes.';
    const previa = previaDelUltimo(ordenadas.slice(0, indice));
    return previa
      ? `Se abre al terminar «${tituloDe(previa, titulos)}».`
      : 'Primer caso: se puede empezar de inmediato.';
  });
}
