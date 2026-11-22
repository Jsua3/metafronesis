import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from '@angular/core';

import { UiButton } from '../button/ui-button';
import { UiFiguraPixel } from '../figura-pixel/ui-figura-pixel';
import { EMPTY_STATE_COPY, UiEmptyKind } from './state-copy';

export type { UiEmptyKind } from './state-copy';

/**
 * Estado vacío (plan visual §2.5, F2-5; VD-8): título = qué falta; descripción = por qué o qué hacer; acción si es
 * accionable: la acción aparece SOLO si se pide (`actionLabel`, o `withAction` para el texto del catálogo, p. ej.
 * «Limpiar filtros»), nunca un botón que no hace nada. Tres clases con textos de reserva distintos (`state-copy.ts`). La ilustración es pixel art del juego
 * a escala entera y decorativa. «Sin resultados» se anuncia (role="status"): es la respuesta a una búsqueda.
 * El título es un párrafo destacado, no un encabezado: no rompe la jerarquía de la pantalla que lo contiene.
 *
 * Con `figura` (DISENO C12) el mueble se cambia por un personaje del kit a ×3 sobre su sombra de contacto y la firma de
 * tres píxeles de la marca bajo el título: el estado vacío es el único sitio donde la ilustración enseña sin competir
 * (NN/g). Las figuras de cada rol están en `FIGURAS_VACIO` (`state-copy.ts`).
 */
@Component({
  selector: 'ui-empty-state',
  imports: [UiButton, UiFiguraPixel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-empty-state',
    '[class]': "'ui-empty-state--' + kind()",
    '[attr.role]': "kind() === 'no-results' ? 'status' : null",
    '[attr.title]': 'null',
    '[class.ui-empty-state--figura]': '!!figura()',
  },
  template: `
    @if (figura(); as personaje) {
      <ui-figura-pixel class="ui-empty-state__figura" [personaje]="personaje" [escala]="3" />
    } @else {
      <img class="ui-empty-state__art" alt="" [src]="copy().art.src"
        [width]="copy().art.width * copy().art.scale" [height]="copy().art.height * copy().art.scale" />
    }
    <p class="ui-empty-state__title">{{ title() || copy().title }}</p>
    @if (figura()) {
      <span class="ui-empty-state__firma" aria-hidden="true"></span>
    }
    <p class="ui-empty-state__description">{{ description() || copy().description }}</p>
    @if (actionText(); as label) {
      <button ui-button type="button" [variant]="kind() === 'first-use' ? 'primary' : 'secondary'" (click)="action.emit()">{{ label }}</button>
    }
  `,
  styleUrl: './ui-empty-state.scss',
})
export class UiEmptyState {
  readonly kind = input<UiEmptyKind>('first-use');
  readonly title = input<string | null | undefined>(null);
  readonly description = input<string | null | undefined>(null);
  readonly actionLabel = input<string | null | undefined>(null);
  /** Mostrar la acción con el texto del catálogo (si la clase lo tiene). */
  readonly withAction = input(false, { transform: booleanAttribute });
  /** Personaje del kit en lugar del mueble (`'camila/bata'`, `'docente-universidad'`…); ver `FIGURAS_VACIO`. */
  readonly figura = input<string | null | undefined>(null);
  readonly action = output<void>();

  protected readonly copy = computed(() => EMPTY_STATE_COPY[this.kind()]);
  protected readonly actionText = computed(() =>
    this.actionLabel() || (this.withAction() ? this.copy().actionLabel ?? null : null));
}
