import type { CasoBorrador } from '../modelo/caso';
import { rutaDelEditor } from '../rutas';

/**
 * La dirección real de una pantalla del editor. «:sala» y «:escena» toman la de la dirección actual o, si no hay, la
 * primera sala y la escena de inicio del caso. La usan la guía y el tutorial.
 */
export function rutaConcreta(rutaCorta: string, caso: CasoBorrador | null, urlActual: string): string | null {
  if (!rutaCorta) return null;
  const partes = urlActual.split('?')[0].split('/').filter(Boolean);
  const i = partes.indexOf('editor');
  const salaActual = i >= 0 && partes[i + 1] === 'sala' ? decodeURIComponent(partes[i + 2] ?? '') : null;
  const escenaActual = i >= 0 && partes[i + 1] === 'escena' ? decodeURIComponent(partes[i + 2] ?? '') : null;
  const sala = salaActual ?? caso?.salas[0]?.id ?? '';
  const escena = escenaActual ?? caso?.inicioId ?? caso?.escenas[0]?.id ?? '';
  if ((rutaCorta.includes(':sala') && !sala) || (rutaCorta.includes(':escena') && !escena)) return rutaDelEditor('/', null);
  const corta = rutaCorta.replace(':sala', encodeURIComponent(sala)).replace(':escena', encodeURIComponent(escena));
  return rutaDelEditor(corta, caso?.id ?? null);
}
