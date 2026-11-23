/** Fecha en español de Colombia con hora («2 sept, 3:00 p. m.»); el texto crudo si no es una fecha. */
function formatDate(value: string, withTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO', withTime
    ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * La ventana de una asignación en pantalla (plan visual F10-5; C7, RF-14, RF-15). Los campos `datetime-local` no llevan zona:
 * se mandan como un instante ISO 8601 (UTC), así el servidor la lleva a la hora de Bogotá sea cual sea la zona de quien la
 * escribe, y lo que el servidor devuelve se muestra y se edita en la hora del navegador.
 */

/** El valor de un campo `datetime-local` como instante ISO 8601; vacío o inválido, `null` («sin fecha»). */
export function toWindowIso(local: string): string | null {
  const value = local.trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Lo que devuelve el servidor (ISO con desfase) como valor de un campo `datetime-local`, en la hora del navegador. */
export function fromWindowIso(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** El error de una ventana con dos fechas: el cierre debe ser posterior a la apertura. Con una sola o ninguna, no hay error. */
export function windowError(opens: string, closes: string): string | null {
  const start = toWindowIso(opens);
  const end = toWindowIso(closes);
  if (!start || !end) return null;
  return new Date(end).getTime() <= new Date(start).getTime() ? 'El cierre debe ser posterior a la apertura.' : null;
}

/** La ventana con palabras: cuándo abre y cuándo cierra, o que no tiene fechas. */
export function windowText(opensAt?: string, closesAt?: string): string {
  if (!opensAt && !closesAt) return 'Sin fechas: abierto desde ya y sin cierre.';
  const opens = opensAt ? `Abre el ${formatDate(opensAt, true)}` : 'Abierto desde ya';
  const closes = closesAt ? `Cierra el ${formatDate(closesAt, true)}` : 'Sin cierre';
  return `${opens} · ${closes}.`;
}
