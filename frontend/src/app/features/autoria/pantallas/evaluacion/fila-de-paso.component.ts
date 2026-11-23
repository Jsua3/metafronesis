import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { UiMenu, type UiMenuItem } from '../../../../shared/ui/menu/ui-menu';
import { AutoAltoDirective } from '../../marco/auto-alto.directive';
import type { Hito } from '../../modelo/caso';
import { type FichaDeRespuesta, FichasDeRespuestasComponent } from './fichas-de-respuestas.component';
import {
  type CambioDeRespuesta, type EscenaElegible, SelectorDeRespuestasComponent,
} from './selector-de-respuestas.component';

/** Una respuesta que cumple el paso, lista para pintarse como ficha. */
export type RespuestaDelPaso = FichaDeRespuesta;

/** Un paso profesional tal como lo pinta su fila. */
export interface PasoVista {
  hito: Hito;
  /** La descripción sin la marca «[por validar con Psicología]» (el dato no cambia; la marca va en una insignia). */
  descripcion: string;
  porValidar: boolean;
  respuestas: readonly RespuestaDelPaso[];
  /** Ninguna respuesta a la que se llega lo marca y ya no es «trabajo por hacer» sino algo por corregir. */
  porCorregir: boolean;
}

/** Lo que la docente cambia de un paso desde su fila. */
export type CambioDePaso = Partial<Pick<Hito, 'nombre' | 'descripcion' | 'decisivo'>>;

/** Más larga que esto, la descripción se recorta a dos renglones con «Ver más». */
const LARGO_DESCRIPCION = 110;

/**
 * Una fila de «Pasos profesionales» (EDITOR.md §3.5): el nombre con su estado (forma y palabra), «Decide el final», la
 * descripción en dos renglones, las respuestas que lo cumplen como fichas y «Agregar una respuesta». Editar y borrar van en
 * el menú «Más». Conserva `id="hito-<clave>"` y `tabindex="-1"`: es el ancla de «Llévame ahí».
 *
 * Patrón: pieza de presentación (entradas y salidas). Qué está abierto (selector, edición, confirmación) lo decide la
 * pantalla, que solo deja abierto uno a la vez.
 */
@Component({
  selector: 'app-fila-de-paso',
  imports: [NgTemplateOutlet, UiMenu, AutoAltoDirective, FichasDeRespuestasComponent, SelectorDeRespuestasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = paso();
    <article class="paso" [id]="'hito-' + p.hito.clave" tabindex="-1" [attr.aria-labelledby]="'hn-' + p.hito.clave"
             [attr.data-estado]="estado()">
      <div class="paso__cabeza">
        <span class="paso__marca marca-estado" [attr.data-estado]="estado()" aria-hidden="true"></span>
        <h3 class="paso__nombre" [id]="'hn-' + p.hito.clave">{{ p.hito.nombre }}</h3>
        <span class="solo-lector">{{ textoEstado() }}.</span>
        <label class="interruptor" [class.encendido]="p.hito.decisivo">
          <input type="checkbox" role="switch" [checked]="p.hito.decisivo" [disabled]="soloLectura()"
                 (change)="cambiar.emit({ decisivo: $any($event.target).checked })" />
          Decide el final
        </label>
        @if (!soloLectura()) {
          <ui-menu class="paso__mas" iconOnly [label]="'Más acciones del paso ' + p.hito.nombre" [items]="menu()" (itemSelected)="elegir($event)" />
        }
      </div>

      <!-- La marca «por validar» va delante de la descripción: en el primer renglón, nunca la corta el recorte. -->
      <ng-template #porValidar>@if (p.porValidar) {<span class="insignia" title="Psicología todavía tiene que validar esta descripción">Texto por validar</span> }</ng-template>
      @if (p.descripcion.length > largo) {
        <!-- details y no un botón: «Ver más» sigue sirviendo en solo lectura (un fieldset deshabilitado apaga los botones). -->
        <details class="paso__descripcion">
          <summary><span class="recorte"><ng-container [ngTemplateOutlet]="porValidar" />{{ p.descripcion }}</span><span class="ver-mas" aria-hidden="true"></span></summary>
        </details>
      } @else if (p.descripcion || p.porValidar) {
        <p class="paso__descripcion"><ng-container [ngTemplateOutlet]="porValidar" />{{ p.descripcion }}</p>
      }

      @if (p.porCorregir) {
        <p class="paso__aviso" role="note"><span aria-hidden="true">▲</span> Nadie puede cumplirlo todavía: ninguna respuesta a la que se llega desde el inicio lo marca.</p>
      }

      <app-fichas-de-respuestas [respuestas]="p.respuestas" [etiqueta]="'Respuestas que cumplen ' + p.hito.nombre" [nombre]="p.hito.nombre"
                                vacio="Ninguna respuesta lo cumple todavía." [quitable]="!soloLectura()" (irA)="irA.emit($event)" (quitar)="quitar.emit($event)">
        @if (!soloLectura()) {
          <li class="agregar-item">
            <button type="button" class="agregar" [id]="'agregar-' + p.hito.clave" [attr.aria-expanded]="abierto()"
                    [attr.aria-label]="'Agregar respuesta que cumple ' + p.hito.nombre"
                    [attr.aria-controls]="abierto() ? 'sel-' + p.hito.clave + '-titulo' : null" (click)="alternar.emit()">
              <span aria-hidden="true">+</span> Agregar respuesta
            </button>
          </li>
        }
      </app-fichas-de-respuestas>

      @if (abierto()) {
        <app-selector-de-respuestas [idBase]="'sel-' + p.hito.clave" [escenas]="escenas()" [marcadas]="marcadas()"
                                    [nombrePaso]="p.hito.nombre" (cambiar)="marcar.emit($event)" (cerrar)="alternar.emit()" />
      }

      @if (editando()) {
        <div class="editar" role="group" [attr.aria-label]="'Editar el paso ' + p.hito.nombre">
          <label class="etiqueta" [for]="'pn-' + p.hito.clave">Nombre del paso</label>
          <input class="campo" type="text" autocomplete="off" [id]="'pn-' + p.hito.clave" [value]="p.hito.nombre"
                 (change)="cambiarNombre($any($event.target))" />
          <label class="etiqueta" [for]="'pd-' + p.hito.clave">Qué se espera que haga el estudiante</label>
          <textarea autoAlto class="campo" rows="2" [id]="'pd-' + p.hito.clave" [value]="p.descripcion"
                    (change)="cambiarDescripcion($any($event.target).value)"></textarea>
          <button type="button" class="boton editar__listo" (click)="terminar.emit()">Listo</button>
        </div>
      }

      @if (borrando()) {
        <div class="confirmar" role="alertdialog" [attr.aria-labelledby]="'pb-' + p.hito.clave" [attr.aria-describedby]="'pbd-' + p.hito.clave">
          <p class="confirmar__titulo" [id]="'pb-' + p.hito.clave" tabindex="-1">¿Borrar el paso «{{ p.hito.nombre }}»?</p>
          <p [id]="'pbd-' + p.hito.clave">{{ consecuencia() }}</p>
          <div class="confirmar__acciones">
            @if (!bloqueoBorrado()) {
              <button type="button" class="boton boton-peligro" (click)="borrar.emit()">Borrar el paso</button>
            }
            <button type="button" class="boton" (click)="terminar.emit()">Conservar el paso</button>
          </div>
        </div>
      }
    </article>
  `,
  styleUrl: './fila-de-paso.component.scss',
})
export class FilaDePasoComponent {
  readonly paso = input.required<PasoVista>();
  readonly escenas = input.required<readonly EscenaElegible[]>();
  readonly soloLectura = input(false);
  readonly abierto = input(false);
  readonly editando = input(false);
  readonly borrando = input(false);
  /** Los finales propios cuya condición nombra el paso: mientras haya, no se puede borrar (el servidor lo rechaza). */
  readonly finalesQueLoNombran = input<readonly string[]>([]);

  readonly cambiar = output<CambioDePaso>();
  readonly marcar = output<CambioDeRespuesta>();
  readonly quitar = output<RespuestaDelPaso>();
  readonly irA = output<RespuestaDelPaso>();
  readonly alternar = output<void>();
  readonly pedirEdicion = output<void>();
  readonly pedirBorrado = output<void>();
  readonly borrar = output<void>();
  readonly terminar = output<void>();

  protected readonly largo = LARGO_DESCRIPCION;
  protected readonly marcadas = computed(() => this.paso().respuestas.map((r) => r.respuestaId));
  protected readonly menu = computed<UiMenuItem[]>(() => [
    { value: 'editar', label: 'Editar el nombre y la descripción' },
    { value: 'borrar', label: 'Borrar el paso', tone: 'danger' },
  ]);

  /** Con forma y palabra, como el hilo: visto (lo cumple alguna respuesta), círculo vacío (nadie aún) o triángulo (corregir). */
  protected readonly estado = computed(() => {
    const p = this.paso();
    if (p.porCorregir) return 'con-pendientes';
    return p.respuestas.length ? 'lista' : 'sin-empezar';
  });
  protected readonly textoEstado = computed(() => {
    const n = this.paso().respuestas.length;
    if (this.paso().porCorregir) return 'Por corregir';
    return n === 0 ? 'Ninguna respuesta lo cumple' : n === 1 ? 'Lo cumple 1 respuesta' : `Lo cumplen ${n} respuestas`;
  });

  protected readonly bloqueoBorrado = computed(() => this.finalesQueLoNombran().length > 0);
  protected readonly consecuencia = computed(() => {
    const finales = this.finalesQueLoNombran();
    if (finales.length) {
      const nombres = finales.map((f) => `«${f}»`).join(', ');
      return `${finales.length === 1 ? 'El final' : 'Los finales'} ${nombres} lo ${finales.length === 1 ? 'nombra' : 'nombran'} en su condición. Cámbiala en Finales y vuelve a borrarlo.`;
    }
    const n = this.paso().respuestas.length;
    const marcas = n === 0 ? 'Ninguna respuesta lo marca.' : n === 1 ? 'Lo marca 1 respuesta: se le quitará la marca.' : `Lo marcan ${n} respuestas: se les quitará la marca.`;
    return `${marcas} No se puede deshacer.`;
  });

  protected elegir(valor: string | undefined): void {
    if (valor === 'editar') this.pedirEdicion.emit();
    else if (valor === 'borrar') this.pedirBorrado.emit();
  }

  /** Un paso sin nombre no se guarda: el campo vuelve al que tenía. */
  protected cambiarNombre(campo: HTMLInputElement): void {
    const nombre = campo.value.trim();
    if (!nombre) {
      campo.value = this.paso().hito.nombre;
      return;
    }
    if (nombre !== this.paso().hito.nombre) this.cambiar.emit({ nombre });
  }

  protected cambiarDescripcion(texto: string): void {
    // La marca «por validar» sigue en el dato: reescribir la descripción no la valida (todo el caso pasa por Psicología).
    const descripcion = this.paso().porValidar ? `${texto.trim()} ${MARCA_POR_VALIDAR}`.trim() : texto.trim();
    if (descripcion !== this.paso().hito.descripcion) this.cambiar.emit({ descripcion });
  }
}

/** La marca que la biblioteca deja al final de la descripción de cada paso que Psicología aún no validó. */
export const MARCA_POR_VALIDAR = '[por validar con Psicología]';
const MARCA = /\s*\[por validar con psicolog[ií]a\]\s*$/i;

/** La descripción sin la marca, y si la tenía. */
export function separarMarca(descripcion: string): { descripcion: string; porValidar: boolean } {
  const porValidar = MARCA.test(descripcion);
  return { descripcion: porValidar ? descripcion.replace(MARCA, '').trim() : descripcion.trim(), porValidar };
}
