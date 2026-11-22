import { ChangeDetectionStrategy, Component, Directive, ViewEncapsulation } from '@angular/core';

/**
 * Casilla u opción con su texto (plan visual F2-2): la etiqueta ENVUELVE al `<input type="checkbox|radio">` nativo,
 * así toda la fila (≥ 44 px) es el objetivo y el texto es el nombre accesible. El control conserva su teclado y su
 * estado nativos; el color sale de `accent-color`.
 */
@Component({
  selector: 'label[ui-check]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ui-check' },
  template: `<ng-content select="input" /><span class="ui-check__label"><ng-content /></span>`,
  styleUrl: './ui-check.scss',
})
export class UiCheck {}

/**
 * Interruptor (plan visual F2-2): una casilla nativa con `role="switch"` y forma de interruptor. Con contraste
 * forzado vuelve a la casilla del sistema.
 */
@Directive({
  selector: 'input[type=checkbox][uiSwitch]',
  host: { class: 'ui-switch', role: 'switch' },
})
export class UiSwitch {}
