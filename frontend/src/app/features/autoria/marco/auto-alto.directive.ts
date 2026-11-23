import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/** ¿El navegador ya hace crecer los campos solo (`field-sizing: content`)? Entonces la directiva no tiene nada que hacer. */
export function crecenSolos(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content');
}

/**
 * Un área de texto que crece con lo que se escribe (EDITOR.md §4.2, regla 2): ajusta su alto al cargar y al escribir, hasta
 * el tope de la clase `.auto-alto` (40 % del alto de la ventana); de ahí en adelante, desplazamiento interno. Así un guion
 * largo se lee entero sin barras dentro de cada campo y la docente no pierde de vista lo que escribe.
 *
 * Donde el navegador admite `field-sizing: content` (Chromium) lo hace el CSS de `styles/components/_autoria.scss` y la
 * directiva no toca nada. En los demás (Firefox y Safari, hoy) mide `scrollHeight`. El alto se escribe con
 * `style.setProperty` sobre una variable, no con un atributo `style` en la plantilla (regla de `ui:lint`).
 *
 * Uso: `<textarea autoAlto …>`.
 */
@Directive({
  selector: 'textarea[autoAlto]',
  host: { class: 'auto-alto', '(input)': 'ajustar()' },
})
export class AutoAltoDirective {
  private readonly campo = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;

  constructor() {
    // Al cargar, cuando el campo ya tiene su texto y su ancho (el alto depende de cuántos renglones caben).
    afterNextRender(() => this.ajustar());
  }

  /** Mide el contenido y fija el alto; el tope y el desplazamiento interno los pone el CSS. */
  ajustar(): void {
    if (crecenSolos()) return;
    const estilo = this.campo.style;
    estilo.setProperty('--auto-alto', 'auto');
    // `scrollHeight` no cuenta el borde: se suma para que el último renglón no quede cortado.
    const borde = this.campo.offsetHeight - this.campo.clientHeight;
    estilo.setProperty('--auto-alto', `${this.campo.scrollHeight + Math.max(0, borde)}px`);
  }
}
