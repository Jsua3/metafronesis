/**
 * Los datos del caso que lee el estudiante antes de empezar: el contexto y los objetivos de aprendizaje. Las reglas son las
 * del servidor (`plain_text_problem` y los topes de `update_brief`): se comprueban aquí para decirle al docente qué corregir
 * en el campo que las rompe, antes de guardar. Funciones puras.
 */

/** Los topes del servidor: el campo los dice, no se recortan en silencio. */
export const MAX_CONTEXTO = 4000;
export const MAX_OBJETIVOS = 12;
export const MAX_LARGO_OBJETIVO = 280;

/** Una etiqueta o un comentario HTML (`<b>`, `</p>`, `<!--`): un «<» que no abre nada («edad < 18») es texto. */
const ETIQUETA = /<(?:\/?[A-Za-z]|[!?])/;
/** Un enlace: `https://…`, `www.…` o un esquema que ejecuta o abre algo. */
const ENLACE = /(?:\b[A-Za-z][A-Za-z0-9+.-]{1,15}:\/\/|\bwww\.|\b(?:javascript|vbscript|data|mailto)\s*:)/i;
/** Caracteres de control salvo el salto de línea, el retorno y la tabulación. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** Los objetivos escritos (uno por línea) como lista: sin espacios sobrantes ni renglones vacíos. */
export function objetivosDeTexto(texto: string): string[] {
  return texto.split(/\r?\n/).map((linea) => linea.trim()).filter(Boolean);
}

export interface ErroresFicha {
  contexto: string | null;
  objetivos: string | null;
}

const formato = (n: number) => n.toLocaleString('es-CO');

/** Qué le pasa a un texto que no es texto plano, o `null`; `quien` abre la frase de los objetivos («El objetivo 2 debe ser…»). */
function problemaDeTextoPlano(texto: string): 'etiquetas' | 'enlaces' | 'control' | null {
  if (CONTROL.test(texto)) return 'control';
  if (ETIQUETA.test(texto)) return 'etiquetas';
  if (ENLACE.test(texto)) return 'enlaces';
  return null;
}

export function revisarFicha(contexto: string, objetivosTexto: string): ErroresFicha {
  const limpio = contexto.trim();
  let errorContexto: string | null = null;
  if (limpio.length > MAX_CONTEXTO) {
    errorContexto = `El contexto admite hasta ${formato(MAX_CONTEXTO)} caracteres (ahora tiene ${formato(limpio.length)}).`;
  } else {
    const problema = problemaDeTextoPlano(limpio);
    if (problema === 'control') errorContexto = 'Hay caracteres que no se admiten.';
    else if (problema === 'etiquetas') errorContexto = 'Escribe texto plano, sin etiquetas ni formato.';
    else if (problema === 'enlaces') errorContexto = 'Escribe texto plano, sin enlaces.';
  }

  const objetivos = objetivosDeTexto(objetivosTexto);
  let errorObjetivos: string | null = null;
  if (objetivos.length > MAX_OBJETIVOS) {
    errorObjetivos = `Un caso admite hasta ${MAX_OBJETIVOS} objetivos de aprendizaje.`;
  } else {
    for (let i = 0; i < objetivos.length && errorObjetivos === null; i++) {
      const n = i + 1;
      const problema = problemaDeTextoPlano(objetivos[i]);
      if (objetivos[i].length > MAX_LARGO_OBJETIVO) errorObjetivos = `El objetivo ${n} admite hasta ${MAX_LARGO_OBJETIVO} caracteres.`;
      else if (problema === 'control') errorObjetivos = `El objetivo ${n} tiene caracteres que no se admiten.`;
      else if (problema === 'etiquetas') errorObjetivos = `El objetivo ${n} debe ser texto plano, sin etiquetas ni formato.`;
      else if (problema === 'enlaces') errorObjetivos = `El objetivo ${n} debe ser texto plano, sin enlaces.`;
    }
  }
  return { contexto: errorContexto, objetivos: errorObjetivos };
}

/** El tope del nombre del caso en el servidor (RK-8). */
export const MAX_NOMBRE = 255;

/** Qué le pasa a un nombre de caso que se quiere guardar (vacío, muy largo o con formato), o `null` si está bien. */
export function problemaDeNombre(nombre: string): string | null {
  const limpio = nombre.trim();
  if (!limpio) return 'El caso necesita un nombre.';
  if (limpio.length > MAX_NOMBRE) return `El nombre admite hasta ${MAX_NOMBRE} caracteres (ahora tiene ${limpio.length}).`;
  const problema = problemaDeTextoPlano(limpio);
  if (problema === 'control') return 'El nombre tiene caracteres que no se admiten.';
  if (problema === 'etiquetas') return 'Escribe el nombre como texto plano, sin etiquetas ni formato.';
  if (problema === 'enlaces') return 'Escribe el nombre como texto plano, sin enlaces.';
  return null;
}
