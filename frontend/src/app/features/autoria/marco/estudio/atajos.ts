/**
 * Utilidades puras del espacio de trabajo (EDITOR-PRO.md, punto 4): cuándo una tecla de atajo NO debe actuar y cómo se
 * filtra la paleta de comandos. Sin Angular: se prueban solas y se llevan a metafronesis tal cual.
 *
 * Patrón: funciones puras (Strategy del filtrado, que usa quien arme la lista de comandos).
 */

/** Un comando de la paleta (Ctrl+K). `ejecutar` lo corre quien lo registró; la paleta solo elige. */
export interface Comando {
  /** Único en toda la paleta (p. ej. `escena:e3`, `panel:inspector`). */
  id: string;
  /** El grupo con el que se lista: «Escenas», «Ir a», «Vista», «Cómo hago…». */
  grupo: string;
  titulo: string;
  /** Un dato corto a la derecha (la sala, «3 por corregir»…). */
  detalle?: string;
  /** El atajo tal como se lee: «Ctrl+K», «F», «Alt+M». */
  atajo?: string;
  /** Otras palabras con las que se busca. */
  palabras?: string;
  ejecutar: () => void;
}

/** Un grupo de la hoja de atajos («?»). */
export interface GrupoAtajos {
  titulo: string;
  atajos: { teclas: string[]; hace: string }[];
}

const TIPOS_SIN_TEXTO = ['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image'];

/**
 * ¿La tecla nació dentro de algo que escribe? Entonces un atajo de UNA letra (F, ?, \) no se dispara: la docente está
 * escribiendo esa letra. Cubre campos, áreas de texto, listas desplegables y cualquier `contenteditable`.
 */
export function esCampoDeTexto(objetivo: EventTarget | null): boolean {
  if (!objetivo || typeof (objetivo as Element).closest !== 'function') return false;
  const el = objetivo as Element;
  if (el.closest('textarea, select, [contenteditable=""], [contenteditable="true"], [role="combobox"], [role="textbox"]')) return true;
  if (el instanceof HTMLInputElement) return !TIPOS_SIN_TEXTO.includes(el.type);
  return false;
}

/** Quita tildes y mayúsculas: «Recepción» se encuentra escribiendo «recepcion». */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/**
 * Puntúa un comando contra lo escrito: 3 si el título empieza así, 2 si alguna palabra del título empieza así, 1 si
 * aparece en cualquier parte (título, detalle, palabras o grupo), 0 si no. Todas las palabras de la consulta deben aparecer.
 */
export function puntuar(c: Comando, consulta: string): number {
  const q = normalizar(consulta);
  if (!q) return 1;
  const titulo = normalizar(c.titulo);
  const todo = `${titulo} ${normalizar(c.detalle ?? '')} ${normalizar(c.palabras ?? '')} ${normalizar(c.grupo)}`;
  const partes = q.split(/\s+/);
  if (!partes.every((p) => todo.includes(p))) return 0;
  if (titulo.startsWith(q)) return 3;
  if (titulo.split(/[\s·,.-]+/).some((p) => p.startsWith(partes[0]))) return 2;
  return 1;
}

/** Los comandos que coinciden, mejor puntuados primero; a igual puntuación, en el orden en que se registraron. */
export function filtrarComandos(comandos: readonly Comando[], consulta: string): Comando[] {
  const hayConsulta = normalizar(consulta) !== '';
  return comandos
    .map((c, i) => ({ c, i, p: puntuar(c, consulta) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => (hayConsulta ? b.p - a.p : 0) || a.i - b.i)
    .map((x) => x.c);
}

/** Lee lo guardado sin romperse si el almacenamiento no existe o está bloqueado (modo privado, política del navegador). */
export function leerGuardado<T extends object>(clave: string, porDefecto: T): T {
  try {
    const crudo = globalThis.localStorage?.getItem(clave);
    return crudo ? { ...porDefecto, ...(JSON.parse(crudo) as Partial<T>) } : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function guardar(clave: string, valor: unknown): void {
  try {
    globalThis.localStorage?.setItem(clave, JSON.stringify(valor));
  } catch {
    /* Sin almacenamiento: lo elegido vale mientras dure la página. */
  }
}

/** Acota un número a [min, max]. */
export function acotar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}
