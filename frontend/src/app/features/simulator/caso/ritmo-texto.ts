/**
 * Ritmo con que aparece la línea del personaje (contrato de calidad visual, regla 8): 30 caracteres por segundo y una
 * pausa breve en la puntuación, para que el texto se lea como se diría. Las acotaciones entre paréntesis se separan
 * para pintarlas aparte. Módulo puro: sin Angular.
 */
export const MS_POR_CARACTER = 33;

const PAUSA: Readonly<Record<string, number>> = {
  ',': 120, ';': 180, ':': 180, '.': 300, '?': 300, '!': 300, '…': 420, ')': 200,
};

/** Cuánto esperar después de escribir `caracter`, además del paso normal. Nada al final de la línea ni dentro de «...» o «3.5». */
export function pausaTras(caracter: string, siguiente: string | undefined): number {
  const pausa = PAUSA[caracter];
  if (!pausa || siguiente === undefined || siguiente === caracter) return 0;
  if (caracter === '.' && /\d/.test(siguiente)) return 0;
  return pausa;
}

export interface Tramo {
  texto: string;
  acotacion: boolean;
}

/** La línea en tramos: lo que se dice y lo que va entre paréntesis (acotación). */
export function tramos(texto: string): Tramo[] {
  const lista: Tramo[] = [];
  let desde = 0;
  for (const m of texto.matchAll(/\([^)]*\)/g)) {
    const i = m.index ?? 0;
    if (i > desde) lista.push({ texto: texto.slice(desde, i), acotacion: false });
    lista.push({ texto: m[0], acotacion: true });
    desde = i + m[0].length;
  }
  if (desde < texto.length) lista.push({ texto: texto.slice(desde), acotacion: false });
  return lista;
}
