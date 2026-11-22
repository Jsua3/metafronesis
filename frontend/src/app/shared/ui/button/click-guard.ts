import { DestroyRef, ElementRef, inject } from '@angular/core';

let nextId = 0;

/** Id único para el texto del motivo de un control deshabilitado (aria-describedby). */
export function uniqueUiId(prefix: string): string {
  return `${prefix}-${nextId++}`;
}

/**
 * Bloquea los clics del elemento anfitrión mientras `blocked()` sea verdadero (plan visual F2-1, Review Focus 1).
 * Se registra en fase de captura al crear el componente, antes que cualquier `(click)` del consumidor o de otra
 * directiva (RouterLink): cancela la acción por defecto (envío del formulario, navegación del enlace) y detiene el
 * resto de oyentes. El control sigue recibiendo foco: así su motivo se puede leer. `onBlocked` se llama con cada clic
 * bloqueado (para explicar el motivo a quien pulsa sin pasar el ratón: clic rápido o toque).
 */
export function guardClicks(blocked: () => boolean, onBlocked?: () => void): void {
  const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const guard = (event: Event) => {
    if (!blocked()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onBlocked?.();
  };
  element.addEventListener('click', guard, { capture: true });
  inject(DestroyRef).onDestroy(() => element.removeEventListener('click', guard, { capture: true }));
}
