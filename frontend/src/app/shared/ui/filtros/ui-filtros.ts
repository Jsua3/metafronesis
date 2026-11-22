import {
  ChangeDetectionStrategy, Component, DestroyRef, booleanAttribute, computed, effect, inject, input, model, output, untracked,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { UiButton } from '../button/ui-button';
import { UiControl, UiField } from '../field/ui-field';
import { UiEmptyState } from '../state/ui-empty-state';

/** Espera desde el último cambio antes de anunciar el recuento: no se lee una cifra por cada tecla. */
export const UI_FILTROS_ANUNCIO_MS = 400;

/**
 * Barra de filtros (DISENO C6): búsqueda, los filtros que se proyecten (segmentados o listas) y, a la derecha, el
 * recuento en palabras («Mostrando 4 de 12») con «Limpiar filtros» cuando hay algo puesto. El recuento se anuncia a los
 * lectores de pantalla por las regiones vivas de la app, en cortesía y tras 400 ms sin cambios (nunca con una región
 * que nace con su texto). Si los filtros dejan cero resultados, los controles SIGUEN a la vista y debajo aparece el
 * vacío «No hay resultados» con su acción de limpiar (NN/g: no esconder lo que causó el vacío).
 */
@Component({
  selector: 'ui-filtros',
  imports: [MatIconModule, UiButton, UiControl, UiEmptyState, UiField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-filtros' },
  template: `
    <div class="ui-filtros__barra">
      @if (conBusqueda()) {
        <ui-field class="ui-filtros__busqueda" [label]="etiquetaBusqueda()">
          <mat-icon class="ui-filtros__lupa" aria-hidden="true">search</mat-icon>
          <input uiControl type="search" autocomplete="off" enterkeyhint="search" [value]="busqueda()"
            (input)="busqueda.set($any($event.target).value)" />
        </ui-field>
      }
      <div class="ui-filtros__controles"><ng-content /></div>
      <div class="ui-filtros__resumen">
        <p class="ui-filtros__recuento">Mostrando <strong>{{ visibles() }}</strong> de {{ total() }}</p>
        @if (algoPuesto()) {
          <button ui-button type="button" variant="ghost" size="sm" class="ui-filtros__limpiar" (click)="limpiarTodo()">Limpiar filtros</button>
        }
      </div>
    </div>
    @if (sinResultados()) {
      <ui-empty-state class="ui-filtros__vacio" kind="no-results" withAction (action)="limpiarTodo()" />
    }
  `,
  styleUrl: './ui-filtros.scss',
})
export class UiFiltros {
  readonly busqueda = model('');
  readonly etiquetaBusqueda = input('Buscar');
  /** Sin búsqueda (pocas filas: por ejemplo, el catálogo hasta que tenga más de 8 casos). */
  readonly conBusqueda = input(true, { transform: booleanAttribute });
  readonly total = input.required<number>();
  readonly visibles = input.required<number>();
  /** Hay filtros proyectados distintos de «todos» (la búsqueda ya la cuenta el componente). */
  readonly hayFiltros = input(false, { transform: booleanAttribute });
  /** Limpiar: el componente ya vació la búsqueda; quien lo usa devuelve sus filtros a «todos». */
  readonly limpiar = output<void>();

  protected readonly algoPuesto = computed(() => this.hayFiltros() || this.busqueda().trim() !== '');
  protected readonly sinResultados = computed(() => this.visibles() === 0 && this.total() > 0 && this.algoPuesto());

  private readonly announcer = inject(LiveRegionAnnouncer);

  constructor() {
    let primero = true;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const texto = this.sinResultados()
        ? 'No hay resultados con estos filtros.'
        : `Mostrando ${this.visibles()} de ${this.total()}.`;
      // La primera lectura no se anuncia: es el estado con el que llega la pantalla, no la respuesta a un cambio.
      if (primero) {
        primero = false;
        return;
      }
      clearTimeout(temporizador);
      temporizador = setTimeout(() => untracked(() => this.announcer.announce(texto, 'polite')), UI_FILTROS_ANUNCIO_MS);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(temporizador));
  }

  protected limpiarTodo(): void {
    this.busqueda.set('');
    this.limpiar.emit();
  }
}
