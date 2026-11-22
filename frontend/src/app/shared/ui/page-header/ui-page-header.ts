import { ChangeDetectionStrategy, Component, Directive, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

/** Marca las acciones de la cabecera de página: `<button uiPageActions …>`. */
@Directive({ selector: '[uiPageActions]' })
export class UiPageActions {}

/**
 * Cabecera de pantalla (plan visual F2-3; contrato F3 → F4…F8; rediseño DISENO C1): enlace de regreso opcional,
 * antetítulo en la píldora con la firma de tres píxeles de la marca, el ÚNICO `h1` de la pantalla, descripción y
 * acciones. El `title` no queda como atributo del anfitrión (sería un globo nativo sobre toda la cabecera).
 *
 * El regreso (`volverA`) es para las pantallas que cuelgan de otra (reporte de un estudiante, detalle de un grupo,
 * cierre del caso): un enlace de verdad, no «Atrás» del historial, que podría sacar a la persona del portal.
 */
@Component({
  selector: 'ui-page-header',
  imports: [MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-page-header', '[attr.title]': 'null' },
  template: `
    <div class="ui-page-header__text">
      @if (volverA(); as destino) {
        <a class="ui-page-header__volver" [routerLink]="destino">
          <mat-icon class="ui-page-header__volver-icono" aria-hidden="true">arrow_back</mat-icon>{{ volverEtiqueta() }}
        </a>
      }
      @if (eyebrow()) {
        <p class="ui-page-header__eyebrow"><span class="ui-page-header__firma" aria-hidden="true"></span>{{ eyebrow() }}</p>
      }
      <h1 class="ui-page-header__title">{{ title() }}</h1>
      @if (description()) {
        <p class="ui-page-header__description">{{ description() }}</p>
      }
    </div>
    <div class="ui-page-header__actions"><ng-content select="[uiPageActions]" /></div>
  `,
  styleUrl: './ui-page-header.scss',
})
export class UiPageHeader {
  readonly title = input.required<string>();
  readonly eyebrow = input<string | null | undefined>(null);
  readonly description = input<string | null | undefined>(null);
  /** Ruta de la pantalla de la que cuelga esta (p. ej. `/portal/grupos`). Sin ella no hay enlace de regreso. */
  readonly volverA = input<string | null | undefined>(null);
  /** Texto del regreso: dice adónde se vuelve («Tus grupos»), no solo «Volver». */
  readonly volverEtiqueta = input('Volver');
}
