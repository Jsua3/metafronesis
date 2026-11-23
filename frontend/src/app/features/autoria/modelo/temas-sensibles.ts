/**
 * Los temas sensibles del caso (RK-7): fichas cortas («violencia de pareja») que el estudiante lee en la ficha antes de
 * empezar. Las reglas son las del servidor (`_validated_content_warnings`): hasta 8, de hasta 60 caracteres, texto plano de
 * una línea; los repetidos (sin distinguir mayúsculas) se guardan una vez. Aquí se comprueban antes de guardar para decir
 * qué corregir en el campo. Funciones puras.
 */

export const MAX_TEMAS = 8;
export const MAX_LARGO_TEMA = 60;

const ETIQUETA = /<(?:\/?[A-Za-z]|[!?])/;
const ENLACE = /(?:\b[A-Za-z][A-Za-z0-9+.-]{1,15}:\/\/|\bwww\.|\b(?:javascript|vbscript|data|mailto)\s*:)/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** La lista como la guarda el sistema: sin espacios sobrantes, sin vacíos y sin repetidos (da igual si cambian las mayúsculas). */
export function normalizarTemas(temas: readonly string[]): string[] {
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const tema of temas) {
    const limpio = tema.trim().replace(/\s+/g, ' ');
    const clave = limpio.toLocaleLowerCase('es');
    if (!limpio || vistos.has(clave)) continue;
    vistos.add(clave);
    lista.push(limpio);
  }
  return lista;
}

/**
 * Qué le pasa a un tema que se quiere agregar, o `null` si está bien. `existentes` son los que el caso ya tiene: repetir
 * uno no es un error del sistema (se guarda una vez), pero a quien escribe se le dice para que no crea que se agregó.
 */
export function problemaDeTema(texto: string, existentes: readonly string[]): string | null {
  const limpio = texto.trim().replace(/\s+/g, ' ');
  if (!limpio) return null;
  if (limpio.length > MAX_LARGO_TEMA) return `Un tema admite hasta ${MAX_LARGO_TEMA} caracteres (ahora tiene ${limpio.length}).`;
  if (CONTROL.test(limpio)) return 'Hay caracteres que no se admiten.';
  if (ETIQUETA.test(limpio)) return 'Escribe texto plano, sin etiquetas ni formato.';
  if (ENLACE.test(limpio)) return 'Escribe texto plano, sin enlaces.';
  if (existentes.some((t) => t.toLocaleLowerCase('es') === limpio.toLocaleLowerCase('es'))) return 'Ese tema ya está en la lista.';
  if (existentes.length >= MAX_TEMAS) return `Un caso admite hasta ${MAX_TEMAS} temas sensibles.`;
  return null;
}
