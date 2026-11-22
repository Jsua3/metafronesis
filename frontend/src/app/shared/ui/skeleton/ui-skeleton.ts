import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type UiSkeletonShape = 'line' | 'text' | 'card' | 'stat' | 'row' | 'chart' | 'avatar';

/**
 * Esqueleto de carga (plan visual §2.5, F2-4): la FORMA final del contenido con un brillo de 1,4 s lineal, quieto
 * con movimiento reducido. Es decorativo (`aria-hidden`): la región que carga lleva `aria-busy` y su texto de
 * estado. Para decidir CUÁNDO mostrarlo, `loadingPhase()`.
 */
@Component({
  selector: 'ui-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-skeleton ds-motion',
    'aria-hidden': 'true',
    '[class]': "'ui-skeleton--' + shape()",
  },
  template: `
    @switch (shape()) {
      @case ('text') {
        @for (line of lineList(); track $index) {
          <span class="ui-skeleton__bone ui-skeleton__bone--text" [class.ui-skeleton__bone--short]="$last && !$first"></span>
        }
      }
      @case ('card') {
        <span class="ui-skeleton__bone ui-skeleton__bone--title"></span>
        @for (line of lineList(); track $index) {
          <span class="ui-skeleton__bone ui-skeleton__bone--text" [class.ui-skeleton__bone--short]="$last && !$first"></span>
        }
      }
      @case ('stat') {
        <span class="ui-skeleton__bone ui-skeleton__bone--text ui-skeleton__bone--short"></span>
        <span class="ui-skeleton__bone ui-skeleton__bone--value"></span>
      }
      @case ('row') {
        <span class="ui-skeleton__bone ui-skeleton__bone--avatar"></span>
        <span class="ui-skeleton__lines">
          <span class="ui-skeleton__bone ui-skeleton__bone--text"></span>
          <span class="ui-skeleton__bone ui-skeleton__bone--text ui-skeleton__bone--short"></span>
        </span>
      }
      @case ('chart') {
        <span class="ui-skeleton__bone ui-skeleton__bone--chart"></span>
      }
      @case ('avatar') {
        <span class="ui-skeleton__bone ui-skeleton__bone--avatar"></span>
      }
      @default {
        <span class="ui-skeleton__bone ui-skeleton__bone--text"></span>
      }
    }
  `,
  styleUrl: './ui-skeleton.scss',
})
export class UiSkeleton {
  readonly shape = input<UiSkeletonShape>('line');
  /** Líneas de texto (formas `text` y `card`). */
  readonly lines = input(3);

  protected readonly lineList = computed(() => Array.from({ length: Math.max(1, this.lines()) }));
}
