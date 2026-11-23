import type { Gesto } from '../../../core/models/simulation.model';

/** El tope de una frase de reacción o de comentario. */
export const MAX_FRASE = 400;

/** Cómo se nombra cada gesto ante la docente (las claves son el vocabulario cerrado `GESTOS` del documento). */
// BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
export const NOMBRE_GESTO: Record<Gesto, string> = {
  'se-acerca': 'Se acerca', asiente: 'Asiente', 'se-aparta': 'Se aparta', 'baja-la-mirada': 'Baja la mirada', 'se-agita': 'Se agita',
};

// Las mismas reglas del validador del servidor (`casedef/text.py`): una etiqueta o comentario HTML, un enlace de cualquier esquema
// (`https` incluido: en una frase del juego no se admite ninguno) y los caracteres de control.
const ETIQUETA = /<(?:\/?[A-Za-z]|[!?])/;
const ENLACE = /(?:\b[A-Za-z][A-Za-z0-9+.-]{1,15}:\/\/|\bwww\.|\b(?:javascript|vbscript|data|mailto)\s*:)/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/** Por qué una frase de reacción o de comentario no se guarda; `null` si está bien. Una línea, hasta 400, sin enlaces ni HTML. */
export function problemaDeLaFrase(texto: string): string | null {
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
  if (texto.length > MAX_FRASE) return `No se guardó: la frase no puede pasar de ${MAX_FRASE} caracteres (tiene ${texto.length}).`;
  if (/[\r\n]/.test(texto)) return 'No se guardó: la frase debe escribirse en una sola línea.';
  if (CONTROL.test(texto)) return 'No se guardó: la frase tiene caracteres que no se admiten.';
  if (ETIQUETA.test(texto)) return 'No se guardó: la frase debe ser texto plano, sin HTML.';
  if (ENLACE.test(texto)) return 'No se guardó: la frase no puede llevar enlaces.';
  return null;
}
