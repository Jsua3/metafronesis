/**
 * Qué entrada manda en el mundo (plan visual F6-7, VD-5). Pura. La cruceta táctil no se decide solo por el puntero
 * principal (`(pointer: coarse)`): un portátil con pantalla táctil tiene ratón y dedo, y quien lo toca espera la
 * cruceta y quien mueve el ratón espera el suelo. Cuenta la ÚLTIMA entrada real.
 */

/** La última entrada real: dedo, ratón o ninguna todavía. */
export type InputKind = 'touch' | 'mouse' | null;

/**
 * La entrada que sigue a un evento de puntero. Un toque siempre cuenta; un ratón solo si el dispositivo tiene algún
 * puntero fino (`any-pointer: fine`): un navegador que EMULA el tacto no tiene ninguno, y ahí un clic de ratón de
 * prueba no debe esconder la cruceta. El lápiz y lo desconocido no cambian nada.
 */
export function nextInputKind(current: InputKind, pointerType: string, hasFinePointer: boolean): InputKind {
  if (pointerType === 'touch') return 'touch';
  if (pointerType === 'mouse' && hasFinePointer) return 'mouse';
  return current;
}

/** ¿Se ve la cruceta? La última entrada manda; sin ninguna todavía decide el puntero principal. */
export function touchControlsVisible(last: InputKind, primaryIsCoarse: boolean): boolean {
  if (last === 'touch') return true;
  if (last === 'mouse') return false;
  return primaryIsCoarse;
}
