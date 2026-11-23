import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { TipoElemento } from '../../estado/caso.store';

/** Una pieza del catálogo del lugar que se puede agregar a la sala. */
export interface PiezaDelCatalogo { ref: string; nombre: string; arte: string }

/**
 * El catálogo del lugar de la sala (E4, EDITOR.md §4.4): pestañas por tipo con su cuenta, buscador y una fila por pieza
 * con su arte real. Pieza de presentación (sin servicios): la sala le pasa lo que filtra y escucha qué se agrega. Va en
 * la pestaña «Agregar» de la sala de imagen fija, y dentro de «Objetos» en la sala por piezas.
 */
@Component({
  selector: 'app-catalogo-del-lugar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="catalogo" class="catalogo" data-accion="agregar-mueble">
      <h3 id="catalogo">Catálogo del lugar <span class="texto-secundario">· se agrega en el centro de la sala</span></h3>
      <div role="tablist" aria-label="Qué quieres agregar" class="catalogo__tipos">
        @for (t of pestanas(); track t.tipo) {
          <button role="tab" type="button" class="catalogo__tipo" [attr.aria-selected]="pestana() === t.tipo" (click)="pestanaCambio.emit(t.tipo)">
            {{ t.nombre }} <span class="catalogo__cuenta">{{ cantidades()[t.tipo] }}</span>
          </button>
        }
      </div>
      <label for="catq" class="etiqueta">Buscar en el catálogo</label>
      <input id="catq" type="search" class="campo" placeholder="Buscar, por ejemplo «silla»" [value]="busqueda()"
             (input)="busquedaCambio.emit($any($event.target).value)" />
      <div role="tabpanel" [attr.aria-label]="nombrePestana()">
        <ul class="catalogo-lista">
          @for (c of items(); track c.ref) {
            <li>
              <button type="button" class="catalogo__item" [attr.aria-label]="'Agregar a la sala: ' + c.nombre"
                (click)="agregar.emit({ ref: c.ref, nombre: c.nombre })">
                <span class="catalogo__arte" aria-hidden="true">@if (c.arte) { <img class="pixel" [src]="c.arte" alt="" /> }</span>
                <span class="catalogo__nombre">{{ c.nombre }}</span>
              </button>
            </li>
          } @empty {
            @if (cantidades()[pestana()] === 0) {
              <li class="texto-secundario" data-sin-catalogo>{{ sinCatalogo() }}</li>
            } @else {
              <li class="texto-secundario">Nada coincide con «{{ busqueda() }}».</li>
            }
          }
        </ul>
      </div>
    </section>
  `,
  styleUrl: './catalogo-del-lugar.component.scss',
})
export class CatalogoDelLugarComponent {
  readonly items = input.required<PiezaDelCatalogo[]>();
  readonly pestanas = input.required<{ tipo: TipoElemento; nombre: string }[]>();
  readonly pestana = input.required<TipoElemento>();
  readonly cantidades = input.required<Record<TipoElemento, number>>();
  readonly busqueda = input('');
  /** Por qué no hay piezas que agregar (un caso sin lugar no tiene catálogo). */
  readonly sinCatalogo = input('');
  readonly pestanaCambio = output<TipoElemento>();
  readonly busquedaCambio = output<string>();
  readonly agregar = output<{ ref: string; nombre: string }>();
  protected readonly nombrePestana = computed(() => this.pestanas().find(t => t.tipo === this.pestana())?.nombre ?? '');
}
