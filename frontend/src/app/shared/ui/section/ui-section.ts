import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { uniqueUiId } from '../button/click-guard';

/**
 * Bloque de una pantalla (plan visual F2-3): región nombrada por su título (`aria-labelledby`). El nivel sigue al h1
 * de `ui-page-header`: h2 por defecto, h3 anidada. El `title` no queda como atributo (globo nativo).
 */
@Component({
  selector: 'ui-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-section', '[attr.title]': 'null' },
  template: `
    <section class="ui-section__region" [attr.aria-labelledby]="headingId">
      @if (level() === 3) {
        <h3 class="ui-section__title" [id]="headingId">{{ title() }}</h3>
      } @else {
        <h2 class="ui-section__title" [id]="headingId">{{ title() }}</h2>
      }
      <ng-content />
    </section>
  `,
  styleUrl: './ui-section.scss',
})
export class UiSection {
  readonly title = input.required<string>();
  readonly level = input<2 | 3>(2);

  protected readonly headingId = uniqueUiId('ui-section-title');
}
