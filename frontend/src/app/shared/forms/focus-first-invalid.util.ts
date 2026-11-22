/** Controles de formulario reactivo que Angular marca como inválidos. */
const INVALID_CONTROL = 'input.ng-invalid, textarea.ng-invalid, select.ng-invalid, mat-select.ng-invalid';

/**
 * Mueve el foco al primer control inválido dentro de `root`. Se usa al enviar
 * un formulario incompleto, para que teclado y lector de pantalla lleguen al problema.
 */
export function focusFirstInvalid(root: HTMLElement): boolean {
  const target = root.querySelector<HTMLElement>(INVALID_CONTROL);
  if (!target) return false;
  target.focus();
  return true;
}
