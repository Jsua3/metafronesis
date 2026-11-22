import { Directive, input } from '@angular/core';

/**
 * Celdas de una tabla que en un contenedor estrecho se apila en tarjetas (`<ui-table apilar>`, DISENO C3). Son atributos
 * que el CSS del apilado lee; sobre una tabla normal no cambian nada.
 *
 * - `[uiCelda]="'Estado'"`: el rótulo que la celda muestra encima de su valor cuando la fila es una tarjeta. Si se omite,
 *   `ui-table` lo toma del encabezado de su columna.
 * - `uiCeldaPrincipal`: la celda que pasa a ser el título de la tarjeta (el nombre del estudiante, el título del caso).
 * - `uiCeldaAcciones`: la celda que pasa a ser el pie de la tarjeta, con sus botones a todo lo ancho (44 px).
 */
@Directive({ selector: 'td[uiCelda], th[uiCelda]', host: { '[attr.data-etiqueta]': 'uiCelda() || null' } })
export class UiCelda {
  readonly uiCelda = input<string | null | undefined>(null);
}

@Directive({ selector: 'td[uiCeldaPrincipal], th[uiCeldaPrincipal]', host: { 'data-celda': 'principal' } })
export class UiCeldaPrincipal {}

@Directive({ selector: 'td[uiCeldaAcciones]', host: { 'data-celda': 'acciones' } })
export class UiCeldaAcciones {}
