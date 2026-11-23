import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

import { CharacterVisual } from './character-visual.resolver';
import { PortraitState, SHEETS, SheetId, ViewId } from './kit-engine';
import { figureStyle } from './kit-figure.util';

/**
 * Sprite o retrato del kit en CSS (lobby, editores, resultado, diálogo): a escala entera,
 * con `image-rendering: pixelated` y una caja del tamaño exacto del cuadro.
 */
@Component({
  selector: 'app-kit-figure',
  standalone: true,
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="kit-figure" [ngStyle]="style()" [attr.role]="label() ? 'img' : null"
    [attr.aria-label]="label() || null" [attr.aria-hidden]="label() ? null : 'true'"></span>`,
  styles: [`
    :host { display: inline-block; line-height: 0; }
    .kit-figure { display: block; background-repeat: no-repeat; image-rendering: pixelated; }
  `],
})
export class KitFigureComponent {
  readonly visual = input<CharacterVisual | null>(null);
  readonly view = input<ViewId>('down');
  readonly sheet = input<SheetId>('idle');
  /** ×1, ×2 o ×4 para el sprite; ×3 o ×6 para el retrato. */
  readonly scale = input(2);
  readonly animated = input(false);
  readonly portrait = input<PortraitState | null>(null);
  readonly label = input('');

  private readonly col = signal(0);
  private readonly reduceMotion = typeof window !== 'undefined'
    && (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false);

  readonly style = computed(() => figureStyle(this.visual(), {
    view: this.view(), sheet: this.sheet(), col: this.col(), scale: this.scale(), portrait: this.portrait(),
  }));

  constructor() {
    // Reposo o caminata en bucle a su fps; con movimiento reducido, el cuadro 0.
    effect(onCleanup => {
      const sheet = this.sheet();
      this.col.set(0);
      if (!this.animated() || this.reduceMotion || this.portrait() || !this.visual()) return;
      const { frames, fps } = SHEETS[sheet];
      const timer = setInterval(() => this.col.update(col => (col + 1) % frames), 1000 / fps);
      onCleanup(() => clearInterval(timer));
    });
  }
}
