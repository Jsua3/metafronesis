import { Menu, MenuContent, MenuItem, MenuTrigger } from '@angular/aria/menu';
import {
  ChangeDetectionStrategy, Component, ElementRef, afterNextRender, afterRenderEffect, booleanAttribute, input, output,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { UiButton, UiButtonVariant } from '../button/ui-button';
import { uniqueUiId } from '../button/click-guard';
import { UiIconButton } from '../button/ui-icon-button';

export interface UiMenuItem {
  value: string;
  label: string;
  icon?: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

/**
 * Menú de acciones (plan visual F2-6) sobre `@angular/aria/menu`: el botón anuncia `aria-haspopup`/`aria-expanded`
 * y abre una lista `role="menu"` nombrada por él; flechas, Inicio, Fin y búsqueda por letra (sobre el texto, no la
 * ligadura del icono) recorren los ítems; Esc cierra y devuelve el foco al botón; elegir un ítem emite
 * `itemSelected`, cierra y devuelve el foco. El panel es HIJO del componente en el DOM (D9 de la barra de vidrio: el
 * menú de cuenta vive en su módulo) pero se muestra en la CAPA SUPERIOR (`popover`), anclado al botón con anchor
 * positioning y volteado hacia arriba si no cabe: ningún ancestro con `overflow` (una tabla, un diálogo) lo recorta.
 * Sin anchor positioning, se coloca por JS al abrir. Los ítems se pintan al abrir (`ngMenuContent`).
 */
@Component({
  selector: 'ui-menu',
  imports: [MatIconModule, Menu, MenuContent, MenuItem, MenuTrigger, UiButton, UiIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-menu',
    '[class.ui-menu--start]': "align() === 'start'",
  },
  template: `
    @if (iconOnly()) {
      <button #trigger ui-icon-button class="ui-menu__trigger" ngMenuTrigger [menu]="menu" [id]="triggerId"
        [style.anchor-name]="anchorName" [icon]="icon() ?? 'more_vert'" [label]="label()" [variant]="variant()"></button>
    } @else {
      <button #trigger ui-button type="button" class="ui-menu__trigger" ngMenuTrigger [menu]="menu" [id]="triggerId"
        [style.anchor-name]="anchorName" [variant]="variant()" [icon]="icon()" iconEnd="expand_more">{{ label() }}</button>
    }
    <div ngMenu #menu="ngMenu" #panel class="ui-menu__panel ds-motion" [style.position-anchor]="anchorName"
      [attr.aria-labelledby]="triggerId"
      (itemSelected)="itemSelected.emit($event)">
      <ng-template ngMenuContent>
        @for (item of items(); track item.value) {
          <div ngMenuItem class="ui-menu__item" [class.ui-menu__item--danger]="item.tone === 'danger'"
            [value]="item.value" [disabled]="!!item.disabled" [searchTerm]="item.label">
            @if (item.icon) {
              <mat-icon class="ui-menu__icon" aria-hidden="true">{{ item.icon }}</mat-icon>
            }
            <span class="ui-menu__label">{{ item.label }}</span>
          </div>
        }
      </ng-template>
    </div>
  `,
  styleUrl: './ui-menu.scss',
})
export class UiMenu {
  /** Texto del botón; con `iconOnly`, su nombre accesible y su globo. */
  readonly label = input.required<string>();
  readonly items = input.required<readonly UiMenuItem[]>();
  readonly icon = input<string | undefined>(undefined);
  readonly iconOnly = input(false, { transform: booleanAttribute });
  readonly variant = input<UiButtonVariant>('ghost');
  /** Borde del botón con el que se alinea el panel. */
  readonly align = input<'start' | 'end'>('end');
  readonly itemSelected = output<string | undefined>();

  protected readonly triggerId = uniqueUiId('ui-menu-trigger');
  protected readonly anchorName = `--${this.triggerId}`;
  private readonly menu = viewChild.required(Menu);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly trigger = viewChild.required<ElementRef<HTMLElement>>('trigger');

  constructor() {
    // El panel entra UNA vez en la capa superior al pintarse; mostrarlo u ocultarlo sigue siendo cosa de
    // @angular/aria (data-visible, en la misma detección de cambios), así el foco al primer ítem nunca llega antes de
    // que el panel se vea.
    afterNextRender(() => {
      const panel = this.panel().nativeElement;
      if (typeof panel.showPopover !== 'function' || !panel.isConnected) return;
      // El atributo se pone aquí y no en la plantilla: sin soporte de popover, el panel no queda oculto para siempre.
      panel.setAttribute('popover', 'manual');
      panel.showPopover();
    });
    afterRenderEffect(() => {
      if (this.menu().visible() && !supportsAnchorPositioning()) this.placeByScript(this.panel().nativeElement);
    });
  }

  /** Respaldo sin anchor positioning: bajo el botón, alineado a su borde, o encima si no cabe. */
  private placeByScript(panel: HTMLElement): void {
    const anchor = this.trigger().nativeElement.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const gap = 4;
    const below = anchor.bottom + gap + box.height <= window.innerHeight;
    const top = below ? anchor.bottom + gap : Math.max(gap, anchor.top - gap - box.height);
    const left = this.align() === 'start' ? anchor.left : anchor.right - box.width;
    panel.style.setProperty('inset', `${top}px auto auto ${Math.max(gap, left)}px`);
  }
}

function supportsAnchorPositioning(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('anchor-name: --a');
}
