import {
  ChangeDetectionStrategy, Component, Directive, HostAttributeToken, ViewEncapsulation, booleanAttribute, computed,
  inject, input, signal,
} from '@angular/core';

import { uniqueUiId } from '../button/click-guard';
import { UiIconButton } from '../button/ui-icon-button';
import { describeHostWith } from '../describe';

/**
 * Campo del lenguaje visual (plan visual F2-2): etiqueta visible + control NATIVO marcado con `uiControl` + un
 * único renglón de mensaje que muestra la ayuda o, si hay error, el error EN EL MISMO SITIO. El campo es dueño del
 * id del control (o adopta el que el control ya trae) y de lo que su `aria-describedby` apunta. Con `revealable`,
 * un botón «Mostrar contraseña» (aria-pressed) alterna el tipo del control sin enviar el formulario.
 *
 * `required` se expone como `aria-required` (no como `required` nativo: la validación la hace el formulario y no
 * aparecen los globos del navegador). Estilos globales con nombres BEM: el control es contenido proyectado.
 */
@Component({
  selector: 'ui-field',
  imports: [UiIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ui-field',
    '[class.ui-field--invalid]': '!!error()',
    '[class.ui-field--revealable]': 'revealable()',
  },
  template: `
    <label class="ui-field__label" [for]="controlId()">{{ label() }}@if (required()) {<span class="ui-field__required" aria-hidden="true"> *</span>}</label>
    <div class="ui-field__control">
      <ng-content />
      @if (revealable()) {
        <button ui-icon-button class="ui-field__reveal" [icon]="revealed() ? 'visibility_off' : 'visibility'"
          label="Mostrar contraseña" [attr.aria-pressed]="revealed()" (click)="toggleReveal()"></button>
      }
    </div>
    <p class="ui-field__message" [class.ui-field__message--error]="!!error()" [id]="messageId()" [hidden]="!message()">{{ message() }}</p>
  `,
  styleUrl: './ui-field.scss',
})
export class UiField {
  readonly label = input.required<string>();
  readonly hint = input<string | null | undefined>(null);
  readonly error = input<string | null | undefined>(null);
  readonly required = input(false, { transform: booleanAttribute });
  readonly revealable = input(false, { transform: booleanAttribute });

  /** Id del control; `uiControl` lo sustituye por el suyo si el control ya trae uno. */
  readonly controlId = signal(uniqueUiId('ui-field-control'));
  readonly revealed = signal(false);
  readonly message = computed(() => this.error() || this.hint() || null);
  readonly messageId = computed(() => `${this.controlId()}-mensaje`);
  readonly describedBy = computed(() => (this.message() ? this.messageId() : null));

  protected toggleReveal(): void {
    this.revealed.update(value => !value);
  }
}

/**
 * Control nativo dentro de un `ui-field` (plan visual F2-2): recibe del campo su id, su `aria-invalid` y su
 * `aria-required`, y SUMA el mensaje del campo a su `aria-describedby` (sin borrar descripciones ajenas); una
 * contraseña revelada pasa a `type="text"`. Fuera de un campo solo toma la apariencia del lenguaje visual.
 */
@Directive({
  selector: 'input[uiControl], textarea[uiControl], select[uiControl]',
  host: {
    class: 'ui-control',
    '[attr.id]': 'id()',
    '[attr.type]': 'type()',
    '[attr.aria-invalid]': "field?.error() ? 'true' : null",
    '[attr.aria-required]': "field?.required() ? 'true' : null",
  },
})
export class UiControl {
  protected readonly field = inject(UiField, { optional: true });
  private readonly ownId = inject(new HostAttributeToken('id'), { optional: true });
  private readonly nativeType = inject(new HostAttributeToken('type'), { optional: true });

  protected readonly id = computed(() => this.field?.controlId() ?? this.ownId);
  protected readonly type = computed(() =>
    this.nativeType === 'password' && this.field?.revealed() ? 'text' : this.nativeType);

  constructor() {
    if (this.field && this.ownId) this.field.controlId.set(this.ownId);
    describeHostWith(() => this.field?.describedBy());
  }
}
