import { ChangeDetectionStrategy, Component, ViewEncapsulation, booleanAttribute, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Enlace de texto del lenguaje visual (plan visual F2-1). `external` abre otra pestaña con `rel="noopener
 * noreferrer"` y lo anuncia: icono decorativo + texto para lectores de pantalla.
 */
@Component({
  selector: 'a[ui-link]',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ui-link',
    '[attr.target]': "external() ? '_blank' : null",
    '[attr.rel]': "external() ? 'noopener noreferrer' : null",
  },
  template: `<ng-content />@if (external()) {<mat-icon class="ui-link__icon" aria-hidden="true">open_in_new</mat-icon><span class="ds-sr-only">(se abre en una pestaña nueva)</span>}`,
  styleUrl: './ui-link.scss',
})
export class UiLink {
  readonly external = input(false, { transform: booleanAttribute });
}
