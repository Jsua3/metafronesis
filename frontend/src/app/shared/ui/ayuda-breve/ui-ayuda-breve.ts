import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Explicación en el lugar, disponible con ratón y teclado. */
@Component({
  selector: 'ui-ayuda-breve',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<details><summary [attr.aria-label]="'Ayuda: ' + termino()">?</summary><span>{{ explicacion() }}</span></details>`,
  styles: `:host { display: inline-block; } details { position: relative; } summary { cursor: pointer; border: 1px solid currentColor; border-radius: 50%; inline-size: 1.5rem; text-align: center; list-style: none; font-weight: bold; } details span { display: block; padding: .5rem; max-width: 28rem; color: var(--tinta, #222); background: var(--superficie, white); }`,
})
export class UiAyudaBreve {
  readonly termino = input.required<string>();
  readonly explicacion = input.required<string>();
}
