import { addAriaReferencedId, removeAriaReferencedId } from '@angular/cdk/a11y';
import { ElementRef, effect, inject } from '@angular/core';

/**
 * Suma `id()` al `aria-describedby` del anfitrión mientras no sea nulo y lo quita después, SIN pisar los ids que
 * pusieron otros (el consumidor, `uiTooltip`, un campo). Un `[attr.aria-describedby]` en el anfitrión los borraría
 * en cada detección de cambios. Llamar en un contexto de inyección.
 */
export function describeHostWith(id: () => string | null | undefined): void {
  const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  effect(onCleanup => {
    const value = id();
    if (!value) return;
    addAriaReferencedId(element, 'aria-describedby', value);
    onCleanup(() => removeAriaReferencedId(element, 'aria-describedby', value));
  });
}
