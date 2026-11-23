import { CaseValidation } from '../../core/models/simulation.model';
import { plural } from '../../shared/ui/labels';

/** El titular de la validación: cuántas cosas faltan (errores) y cuántos avisos hay; los avisos no bloquean. */
export function summarize(validation: CaseValidation | null): string {
  if (!validation) return '';
  const errors = validation.issues.filter(issue => issue.severity === 'error').length;
  const warnings = validation.issues.length - errors;
  const notes = warnings > 0 ? ` · ${plural(warnings, 'aviso')}` : '';
  if (errors > 0) return `${errors === 1 ? 'Falta 1 cosa' : `Faltan ${errors} cosas`} por corregir${notes}`;
  return `Sin errores de validación${notes}`;
}

const DAY_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Fecha en español de Colombia («10 de oct de 2026»). Un día sin hora («2026-10-10», lo que manda el servidor en la
 * constancia de revisión) se lee como ese día en la zona local: `new Date('2026-10-10')` es medianoche UTC y en Bogotá
 * mostraría el 9. Una fecha con hora y zona se lleva a la hora local; un texto que no es fecha se muestra tal cual.
 */
export function shortDate(value: string | null | undefined): string {
  if (!value) return 'una fecha sin registrar';
  const day = DAY_ONLY.exec(value);
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  // `es-CO` pinta «10 oct 2026» (y «sept» para septiembre: el punto lo quita la comparación de las pruebas).
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}
