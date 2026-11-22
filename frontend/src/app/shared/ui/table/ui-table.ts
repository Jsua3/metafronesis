import {
  ChangeDetectionStrategy, Component, DestroyRef, Directive, ElementRef, ViewEncapsulation, afterNextRender,
  afterRenderEffect, booleanAttribute, contentChild, inject, input, signal, viewChild,
} from '@angular/core';

import { UiSkeleton } from '../skeleton/ui-skeleton';
import { UiDataStateValue } from '../state/ui-data-state';
import { UiErrorState } from '../state/ui-error-state';

/** Marca la tabla nativa que va dentro de `ui-table`: `<table ui-table>`. */
@Directive({ selector: 'table[ui-table]', host: { class: 'ui-table__table' } })
export class UiTableTable {}

/** Fila con hover (puntero fino) y, si se elige, selección: `<tr uiRow [selected]="…">`. */
@Directive({
  selector: 'tr[uiRow]',
  host: {
    class: 'ui-table__row',
    '[class.ui-table__row--selected]': 'selected()',
    '[attr.aria-selected]': "selected() ? 'true' : null",
  },
})
export class UiTableRow {
  readonly selected = input(false, { transform: booleanAttribute });
}

/**
 * Roles explícitos para la tabla apilada (DISENO C3). Al apilar, el CSS pone `display: block` en filas y celdas, y
 * algunos navegadores dejan de exponerlas como tabla al lector de pantalla; con los roles escritos la semántica se
 * conserva (técnica de Adrian Roselli, «Tables, CSS Display Properties, and ARIA»). También da a cada celda sin
 * `[uiCelda]` el rótulo de su columna, que el apilado muestra encima del valor. Lo que se marca aquí lleva
 * `data-ui-apilada` para poder desmarcarlo si la tabla deja de apilarse.
 */
export function marcarTablaApilable(tabla: HTMLTableElement, activo: boolean): void {
  const marcados: HTMLElement[] = tabla.matches('[data-ui-apilada]') ? [tabla] : [];
  marcados.push(...tabla.querySelectorAll<HTMLElement>('[data-ui-apilada]'));
  if (!activo) {
    for (const el of marcados) {
      el.removeAttribute('role');
      if (el.hasAttribute('data-etiqueta-auto')) el.removeAttribute('data-etiqueta');
      el.removeAttribute('data-etiqueta-auto');
      el.removeAttribute('data-ui-apilada');
    }
    return;
  }
  const marcar = (el: Element, rol: string) => {
    if (el.getAttribute('role') !== rol) el.setAttribute('role', rol);
    el.setAttribute('data-ui-apilada', '');
  };
  marcar(tabla, 'table');
  // Los rótulos salen de la primera fila de la cabecera, respetando `colspan`.
  const rotulos: string[] = [];
  for (const th of Array.from(tabla.tHead?.rows[0]?.cells ?? [])) {
    const texto = th.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    for (let i = 0; i < Math.max(1, th.colSpan); i++) rotulos.push(texto);
  }
  for (const grupo of Array.from(tabla.querySelectorAll(':scope > thead, :scope > tbody, :scope > tfoot'))) marcar(grupo, 'rowgroup');
  for (const fila of Array.from(tabla.rows)) {
    marcar(fila, 'row');
    const enCabecera = fila.parentElement?.tagName === 'THEAD';
    let columna = 0;
    for (const celda of Array.from(fila.cells)) {
      if (enCabecera) marcar(celda, 'columnheader');
      else if (celda.tagName === 'TH') marcar(celda, 'rowheader');
      else marcar(celda, 'cell');
      if (!enCabecera) {
        const rotulo = rotulos[columna];
        const propio = celda.hasAttribute('data-etiqueta') && !celda.hasAttribute('data-etiqueta-auto');
        if (!propio && rotulo) {
          celda.setAttribute('data-etiqueta', rotulo);
          celda.setAttribute('data-etiqueta-auto', '');
        }
      }
      columna += Math.max(1, celda.colSpan);
    }
  }
}

/** Contenido que se muestra cuando la tabla está vacía (p. ej. un `ui-empty-state`). */
@Directive({ selector: '[uiTableEmpty]' })
export class UiTableEmpty {}

/** Contenido que se muestra cuando la carga falló (p. ej. un `ui-error-state`). */
@Directive({ selector: '[uiTableError]' })
export class UiTableError {}

const SKELETON_ROWS = [0, 1, 2, 3, 4];

/**
 * Marco de tabla (plan visual F2-8) para tablas NATIVAS: región con nombre que se desplaza en horizontal y en
 * vertical (cabecera pegajosa dentro de su alto máximo), densidad cómoda o compacta, y los estados de datos DENTRO
 * del marco y de a uno (`state`, de `uiDataState()`): en `pending` se sigue viendo la tabla (sin parpadeo), en
 * `loading` el esqueleto de filas (con `aria-busy`), y el vacío o el error proyectados; tras un reintento que vuelve a
 * fallar, el foco va al título del error. Si la tabla desborda, sombras en los bordes indican hacia dónde hay más y la región entra
 * en el orden de tabulación para desplazarse con el teclado.
 */
@Component({
  selector: 'ui-table',
  imports: [UiSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ui-table',
    '[class.ui-table--comfortable]': "density() === 'comfortable'",
    '[class.ui-table--compact]': "density() === 'compact'",
    '[class.ui-table--overflow-start]': 'overflowStart()',
    '[class.ui-table--overflow-end]': 'overflowEnd()',
    '[class.ui-table--apilar]': 'apilar()',
  },
  template: `
    <div #scroller class="ui-table__scroll" role="region" [attr.aria-label]="label()"
      [attr.aria-busy]="state() === 'loading' || state() === 'pending' ? 'true' : null" [attr.tabindex]="overflowing() ? 0 : null"
      (scroll)="measure()">
      <div class="ui-table__content" [hidden]="state() !== 'ready' && state() !== 'pending'"><ng-content select="table" /></div>
      @if (state() === 'loading') {
        <div class="ui-table__loading">
          @for (row of skeletonRows; track row) {
            <ui-skeleton shape="row" />
          }
        </div>
      }
      <div class="ui-table__state" [hidden]="state() !== 'empty'"><ng-content select="[uiTableEmpty]" /></div>
      <div class="ui-table__state" [hidden]="state() !== 'error'"><ng-content select="[uiTableError]" /></div>
    </div>
  `,
  styleUrl: './ui-table.scss',
})
export class UiTable {
  /** Nombre de la región (lo que contiene la tabla). */
  readonly label = input.required<string>();
  readonly density = input<'comfortable' | 'compact'>('comfortable');
  readonly state = input<UiDataStateValue>('ready');
  /**
   * En un contenedor de menos de 40rem, cada fila pasa a ser una tarjeta (DISENO C3, DP-20): responde al ancho de su
   * propio contenedor, no de la ventana, así también apila en la columna estrecha de una vista dividida. Toda tabla del
   * portal rediseñado lo lleva; sin él se conserva el desplazamiento horizontal señalizado.
   */
  readonly apilar = input(false, { transform: booleanAttribute });

  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly overflowing = signal(false);
  protected readonly overflowStart = signal(false);
  protected readonly overflowEnd = signal(false);
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly errorState = contentChild(UiErrorState, { descendants: true });
  private readonly tabla = contentChild(UiTableTable, { read: ElementRef });

  constructor() {
    // El error proyectado no se desmonta (se oculta): la tabla le avisa cuando vuelve a verse tras un reintento.
    afterRenderEffect(() => {
      const state = this.state();
      const error = this.errorState();
      if (state === 'error') error?.focusAfterRetry();
      else if (state === 'ready' || state === 'empty') error?.clearRetry();
    });
    const destroyRef = inject(DestroyRef);
    // Apilada: roles y rótulos en la tabla proyectada, y otra vez cada vez que cambian sus filas (un @for que llega del
    // servidor, una fila que se borra). Solo se observa la lista de nodos: marcar atributos no se observa a sí mismo.
    afterRenderEffect(onCleanup => {
      const tabla = this.tabla()?.nativeElement as HTMLTableElement | undefined;
      const activo = this.apilar();
      if (!tabla) return;
      marcarTablaApilable(tabla, activo);
      if (!activo || typeof MutationObserver === 'undefined') return;
      const observador = new MutationObserver(() => marcarTablaApilable(tabla, true));
      observador.observe(tabla, { childList: true, subtree: true, characterData: true });
      onCleanup(() => observador.disconnect());
    });
    afterNextRender(() => {
      this.measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.measure());
      observer.observe(this.scroller().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected measure(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.scroller().nativeElement;
    const overflowing = scrollWidth > clientWidth + 1;
    this.overflowing.set(overflowing);
    this.overflowStart.set(overflowing && scrollLeft > 1);
    this.overflowEnd.set(overflowing && scrollLeft + clientWidth < scrollWidth - 1);
  }
}
