import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { uniqueUiId } from '../button/click-guard';

export type UiBarraAccionesPosicion = 'pie' | 'columna';

/**
 * Barra de acciones pegajosa (DISENO C7): las acciones de la pantalla siempre a mano. Es capa de controles, así que va
 * en vidrio (P3) con un filo arriba, y lleva a la izquierda una nota de una línea («Al comenzar aceptas el aviso de
 * contenido»). La acción principal va la última, a la derecha, como en los diálogos.
 *
 * - `pie`: pegada al borde inferior de la página, en una bandeja de vidrio casi opaco (sin desenfoque: D-25). En móvil
 *   se apoya sobre las pestañas de la barra. La página que la usa
 *   agrega `.p-con-barra-acciones` (global, `_portal.scss`) para reservar su alto: así no tapa la última fila.
 * - `columna`: pegada al pie de una columna lateral (la valoración de Revisión, el pie de una hoja), sin vidrio propio.
 *
 * Es un `role="group"` con nombre cuando hay nota (la nota explica las acciones); sin nota es una simple fila.
 */
@Component({
  selector: 'ui-barra-acciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-barra-acciones ds-motion',
    '[class.ui-barra-acciones--pie]': 'enPie()',
    '[class.ui-barra-acciones--columna]': '!enPie()',
    '[attr.role]': "nota() ? 'group' : null",
    '[attr.aria-labelledby]': 'nota() ? notaId : null',
  },
  template: `
    <div class="ui-barra-acciones__bandeja" [class.ui-barra-acciones__bandeja--vidrio]="enPie()">
      @if (nota()) {
        <p class="ui-barra-acciones__nota" [id]="notaId">{{ nota() }}</p>
      }
      <div class="ui-barra-acciones__botones"><ng-content /></div>
    </div>
  `,
  styleUrl: './ui-barra-acciones.scss',
})
export class UiBarraAcciones {
  readonly nota = input<string | null | undefined>(null);
  readonly posicion = input<UiBarraAccionesPosicion>('pie');

  protected readonly notaId = uniqueUiId('ui-barra-acciones-nota');
  protected readonly enPie = computed(() => this.posicion() === 'pie');
}
