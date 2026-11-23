/**
 * Páginas de un parlamento largo (bloque U1, V5; pedido del usuario: «escribió mucho texto de corrido en una
 * conversación… al estudiante le toca scrollear mucho para leer»). Un parlamento no se lee desplazando: se parte en
 * páginas por frases enteras. Cuánto cabe en una página no es un número fijo de caracteres: lo dice `cabe`, que quien
 * llama mide sobre la placa real (su ancho, su letra y el alto que le queda). Módulo puro.
 */

/** Las frases del texto, con su puntuación y lo que la cierra (comillas, paréntesis). Unidas, dan el texto de nuevo. */
export function frasesDe(texto: string): string[] {
  const frases = texto.match(new RegExp('[^.!?…]+(?:[.!?…]+["»”’)\\]]*\\s*|$)', 'g'))?.filter(frase => frase.trim().length > 0) ?? [];
  return frases.length > 0 ? frases : [texto];
}

/**
 * Agrupa las frases en páginas: cada página lleva tantas frases enteras como quepan. Una frase que no cabe ni sola va sola
 * en su página (no se corta a media frase). Sin nada que partir, devuelve el texto entero como única página.
 */
export function partirEnPaginas(texto: string, cabe: (pagina: string) => boolean): string[] {
  const paginas: string[] = [];
  let actual = '';
  for (const frase of frasesDe(texto)) {
    const prueba = actual + frase;
    if (actual.trim() && !cabe(prueba.trim())) {
      paginas.push(actual.trim());
      actual = frase;
    } else {
      actual = prueba;
    }
  }
  if (actual.trim()) paginas.push(actual.trim());
  return paginas.length > 0 ? paginas : [texto];
}

/**
 * Decide las páginas de un parlamento contra el alto que el párrafo tiene de verdad en su placa (V6, CI de
 * `living-world.e2e.ts:101`: una línea de 80 caracteres que cabía de sobra salía en tres páginas de una frase).
 * - Nunca parte un texto que cabe entero: si `alto(texto)` no pasa de `disponible`, una sola página.
 * - Solo si de verdad no cabe, pagina; cada página se llena con tantas frases como quepan antes de abrir la siguiente.
 *   Con páginas, deja un renglón de margen (el pie gana «N de M» y el redondeo al 125 % estiraba la primera página),
 *   con un mínimo de dos renglones por página.
 * `alto` mide el texto en la placa real, sin el alto mínimo que reserva el párrafo (ese mínimo no es texto).
 */
export function paginarSiNoCabe(texto: string, disponible: number, renglon: number, alto: (pagina: string) => number): string[] {
  if (alto(texto) <= disponible) return [texto];
  const tope = Math.max(disponible - renglon, 2 * renglon);
  return partirEnPaginas(texto, pagina => alto(pagina) <= tope);
}
