import { ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation, inject, input } from '@angular/core';

/** Material de la tarjeta (DISENO C2): opaca (contenido), hundida (cita o bloque dentro de otra) o tinte (lo que sigue). */
export type UiCardSuperficie = 'opaca' | 'hundida' | 'tinte';

/**
 * Tarjeta del lenguaje visual (plan visual F2-3; rediseño DISENO C2). `<ui-card>` es solo superficie: opaca, porque es
 * capa de contenido (P3: el vidrio queda para los controles), con el filo fino y el brillo de un píxel de la portada y
 * una sombra de trabajo más baja que la de la portada. Para que toda la tarjeta sea clicable se usa sobre un control
 * nativo, `<a ui-card>` o `<button ui-card>`: foco, teclado y lector correctos, cursor de mano, filo más marcado al
 * pasar y respuesta al presionar (§2.6). No hay «tarjeta interactiva» sobre un `div`.
 */
@Component({
  selector: 'ui-card, a[ui-card], button[ui-card]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ui-card',
    '[class.ui-card--interactive]': 'interactive',
    '[class.ui-card--opaca]': "superficie() === 'opaca'",
    '[class.ui-card--hundida]': "superficie() === 'hundida'",
    '[class.ui-card--tinte]': "superficie() === 'tinte'",
  },
  template: '<ng-content />',
  styleUrl: './ui-card.scss',
})
export class UiCard {
  readonly superficie = input<UiCardSuperficie>('opaca');
  protected readonly interactive = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.tagName !== 'UI-CARD';
}
