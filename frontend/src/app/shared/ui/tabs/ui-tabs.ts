import { Tab, TabContent, TabList, TabPanel, Tabs } from '@angular/aria/tabs';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, Directive, ElementRef, TemplateRef, afterRenderEffect, booleanAttribute, contentChildren, inject, input, model, signal, viewChild,
} from '@angular/core';

/** Una pestaña de `ui-tabs`: `<ng-template uiTab="clave" label="Texto">contenido</ng-template>`. */
@Directive({ selector: 'ng-template[uiTab]' })
export class UiTab {
  readonly value = input.required<string>({ alias: 'uiTab' });
  readonly label = input.required<string>();
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}

/**
 * Pestañas (plan visual F2-6) sobre `@angular/aria/tabs`: una sola parada de tabulación en la lista (foco
 * itinerante), flechas, Inicio y Fin mueven foco y selección (activación automática), cada panel se nombra por su
 * pestaña y los ocultos quedan inertes y fuera de la vista. El contenido de cada panel se pinta la primera vez que
 * se abre. La selección es de doble vía: `[(selected)]`.
 */
@Component({
  selector: 'ui-tabs',
  imports: [NgTemplateOutlet, Tab, TabContent, TabList, TabPanel, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-tabs',
    '[class.ui-tabs--mas-inicio]': 'masInicio()',
    '[class.ui-tabs--mas-fin]': 'masFin()',
  },
  template: `
    <div ngTabs>
      <div #lista ngTabList class="ui-tabs__list" [(selectedTab)]="selected" [attr.aria-label]="label()" (scroll)="bordes()">
        @for (tab of tabs(); track tab.value()) {
          <button type="button" ngTab class="ui-tabs__tab" [value]="tab.value()" [disabled]="tab.disabled()">{{ tab.label() }}</button>
        }
      </div>
      @for (tab of tabs(); track tab.value()) {
        <div ngTabPanel class="ui-tabs__panel" [value]="tab.value()">
          <ng-template ngTabContent><ng-container [ngTemplateOutlet]="tab.template" /></ng-template>
        </div>
      }
    </div>
  `,
  styleUrl: './ui-tabs.scss',
})
export class UiTabs {
  /** Nombre de la lista de pestañas (aria-label). */
  readonly label = input.required<string>();
  readonly selected = model<string | undefined>(undefined);

  protected readonly tabs = contentChildren(UiTab);
  protected readonly masInicio = signal(false);
  protected readonly masFin = signal(false);
  private readonly lista = viewChild.required<ElementRef<HTMLElement>>('lista');

  constructor() {
    afterRenderEffect(onCleanup => {
      this.tabs();
      const lista = this.lista().nativeElement;
      this.bordes();
      if (typeof ResizeObserver === 'undefined') return;
      const observador = new ResizeObserver(() => this.bordes());
      observador.observe(lista);
      for (const elemento of Array.from(lista.children)) observador.observe(elemento);
      onCleanup(() => observador.disconnect());
    });
  }

  protected bordes(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.lista().nativeElement;
    const desborda = scrollWidth > clientWidth + 1;
    this.masInicio.set(desborda && scrollLeft > 1);
    this.masFin.set(desborda && scrollLeft + clientWidth < scrollWidth - 1);
  }
}
