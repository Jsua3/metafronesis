/**
 * Recorrido con teclado de una lista de herramientas (la bandeja de Revisión, la lista de grupos), como en un cliente
 * de correo: ↑/↓ pasan a la fila anterior o siguiente y Inicio/Fin a la primera o la última. Solo mueve el foco: abrir
 * sigue siendo Intro o Espacio sobre la fila (es un botón o un enlace), así nadie abre algo sin querer al recorrer.
 *
 * Utilidad pura sobre el DOM (sin servicios ni estado): la comparten varias pantallas sin copiar la lógica.
 * Devuelve true si movió el foco (y entonces evitó el desplazamiento de la página).
 */
export function moverFocoEnLista(evento: KeyboardEvent, lista: string, fila: string): boolean {
  const pasos: Record<string, (i: number, total: number) => number> = {
    ArrowDown: (i, total) => Math.min(total - 1, i + 1),
    ArrowUp: i => Math.max(0, i - 1),
    Home: () => 0,
    End: (_, total) => total - 1,
  };
  const paso = pasos[evento.key];
  const actual = evento.target instanceof HTMLElement ? evento.target : null;
  if (!paso || !actual || evento.altKey || evento.ctrlKey || evento.metaKey) return false;
  const filas = Array.from(actual.closest(lista)?.querySelectorAll<HTMLElement>(fila) ?? []);
  const indice = filas.indexOf(actual);
  if (indice < 0) return false;
  evento.preventDefault();
  filas[paso(indice, filas.length)].focus();
  return true;
}
