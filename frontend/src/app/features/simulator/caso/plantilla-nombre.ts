/**
 * La plantilla `{nombre}` de los textos del caso (contrato del caso insignia, «Plantilla común»): se reemplaza por el nombre
 * de pila de quien juega (`AuthService.currentUser().nombre`, primera palabra). Sin nombre, la marca se quita y se limpian
 * los espacios y las comas que quedan sueltos: «Hola, {nombre}.» queda «Hola.» y «Eres {nombre}, del equipo» queda «Eres del
 * equipo». Se aplica al pintar (el dato del caso no cambia). Pura: sin Angular ni DOM.
 */

/** La marca, con o sin espacios dentro de las llaves y en cualquier caja: `{nombre}`, `{ nombre }`, `{Nombre}`. */
const MARCA = /\{\s*nombre\s*\}/gi;
/** Señal interna del hueco que deja la marca sin nombre (un carácter que ningún texto del caso trae). */
const HUECO = '\u0000';

/** El nombre de pila: la primera palabra del nombre, sin espacios. Vacío si no hay nombre. */
export function nombreDePila(nombre: string | null | undefined): string {
  if (typeof nombre !== 'string') return '';
  return nombre.trim().split(/\s+/)[0] ?? '';
}

/** ¿El texto trae la marca `{nombre}`? */
export function tieneNombre(texto: string | null | undefined): boolean {
  return typeof texto === 'string' && new RegExp(MARCA.source, 'i').test(texto);
}

/**
 * El texto con `{nombre}` puesto. `nombre` puede venir completo («María José Ruiz»): se usa solo la primera palabra.
 * Un texto sin la marca vuelve igual (la misma cadena).
 */
export function conNombre(texto: string, nombre: string | null | undefined): string;
export function conNombre(texto: string | null | undefined, nombre: string | null | undefined): string | null | undefined;
export function conNombre(texto: string | null | undefined, nombre: string | null | undefined): string | null | undefined {
  if (typeof texto !== 'string' || !tieneNombre(texto)) return texto;
  const pila = nombreDePila(nombre);
  if (pila) return texto.replace(MARCA, () => pila);
  return sinHueco(texto.replace(MARCA, HUECO));
}

/** Quita el hueco que dejó la marca y arregla lo que queda alrededor. */
function sinHueco(texto: string): string {
  let t = texto;
  // «Gracias, {nombre}, por venir.» → «Gracias por venir.»: el nombre iba entre dos comas (vocativo en medio de la frase).
  t = t.replace(new RegExp(`\\s*,\\s*${HUECO}\\s*,\\s*`, 'g'), ' ');
  // «Hola, {nombre}.» / «¡Hola, {nombre}!» → «Hola.» / «¡Hola!»: la coma de antes sobra si después viene puntuación o el final.
  t = t.replace(new RegExp(`\\s*,\\s*${HUECO}(?=\\s*(?:[.,;:!?…)»”]|$))`, 'g'), '');
  // «{nombre}, mira esto» al empezar una frase → «Mira esto» (la mayúscula pasa a la palabra siguiente).
  t = t.replace(
    new RegExp(`(^|[.!?…]\\s+|[¡¿«“(]\\s*)${HUECO}[ \\t]*,?[ \\t]*((?:[¡¿«“(][ \\t]*)*)(\\p{L})`, 'gmu'),
    (_, antes: string, apertura: string, letra: string) => antes + apertura + letra.toLocaleUpperCase('es'),
  );
  // «Eres {nombre}, del equipo» → «Eres del equipo»: la coma que seguía al nombre sobra.
  t = t.replace(new RegExp(`\\s*${HUECO}\\s*,\\s*`, 'g'), ' ');
  // Lo que quede: el hueco se va con un espacio.
  t = t.replace(new RegExp(HUECO, 'g'), ' ');
  return t
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:!?…)»”])/g, '$1')
    .replace(/([¡¿«“(])[ \t]+/g, '$1')
    .replace(/^[ \t]+|[ \t]+$/gm, '');
}

/**
 * Un diálogo con `{nombre}` puesto en quien habla, sus líneas, sus opciones y sus avisos. Sin ninguna marca devuelve el
 * MISMO objeto (el panel no ve un diálogo nuevo); con alguna, una copia: el dato del caso no se toca.
 */
export function dialogoConNombre<T extends DialogoConTextos>(dialogo: T | null, nombre: string | null | undefined): T | null {
  if (!dialogo) return dialogo;
  const marca = tieneNombre(dialogo.speakerName) || tieneNombre(dialogo.notice)
    || dialogo.lines.some(l => tieneNombre(l.text) || tieneNombre(l.speakerName))
    || dialogo.choices.some(c => tieneNombre(c.text) || tieneNombre(c.evidenceWarning));
  if (!marca) return dialogo;
  return {
    ...dialogo,
    speakerName: conNombre(dialogo.speakerName, nombre),
    notice: conNombre(dialogo.notice, nombre),
    lines: dialogo.lines.map(l => ({ ...l, text: conNombre(l.text, nombre), speakerName: conNombre(l.speakerName, nombre) })),
    choices: dialogo.choices.map(c => ({ ...c, text: conNombre(c.text, nombre), evidenceWarning: conNombre(c.evidenceWarning, nombre) ?? undefined })),
  } as T;
}

/** La forma mínima de un diálogo que `dialogoConNombre` recorre (la de `DialogueState`). */
export interface DialogoConTextos {
  speakerName: string;
  notice?: string | null;
  lines: { text: string; speakerName: string }[];
  choices: { text: string; evidenceWarning?: string }[];
}

/** Un comentario de cercanía con `{nombre}` puesto en su línea (el mismo objeto si no lo trae). */
export function comentarioConNombre<T extends { line: string }>(comentario: T | null, nombre: string | null | undefined): T | null {
  return comentario && tieneNombre(comentario.line) ? { ...comentario, line: conNombre(comentario.line, nombre) } : comentario;
}
