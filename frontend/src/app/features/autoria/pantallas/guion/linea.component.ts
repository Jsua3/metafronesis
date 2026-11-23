import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal,
} from '@angular/core';

import { UiMenu, type UiMenuItem } from '../../../../shared/ui/menu/ui-menu';
import { AutoAltoDirective } from '../../marco/auto-alto.directive';
import { rutaRetrato } from '../../modelo/biblioteca.service';
import type { Linea } from '../../modelo/caso';
import { EXPRESIONES, type Expresion } from '../../modelo/escenario';
import { NOMBRE_EXPRESION } from '../../modelo/textos';

/** Lo mínimo que la línea necesita saber de un personaje del caso para pintarlo. */
export interface PersonajeDeLinea {
  id: string;
  nombre: string;
  recipeId?: string | null;
}

type Desplegable = 'personaje' | 'expresion';

/**
 * Una línea del libreto (EDITOR.md §3.4, punto 3): una FILA, no una tarjeta. El retrato de 48 px ES el selector de
 * personaje y la ficha de expresión abre las seis caras dibujadas: se elige mirando, como en la sala, y no en una lista
 * de texto. El texto crece con lo escrito (`autoAlto`). Las acciones de fila (subir, bajar, duplicar, borrar) viven en
 * «Más», que se muestra al pasar el cursor o al enfocar y siempre se alcanza con el teclado.
 *
 * Patrón: pieza de presentación (SOLID, S): no conoce el store; recibe la línea y emite intenciones. El guion
 * (`guion.component.ts`, el contenedor) decide qué hacer con cada una.
 */
@Component({
  selector: 'app-linea',
  imports: [AutoAltoDirective, UiMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'linea-libreto', '(keydown.escape)': 'cerrar(true)', '(focusout)': 'alSalir($event)' },
  template: `
    <div class="linea-libreto__selector">
      <button type="button" class="retrato-boton" [id]="'lp' + indice()" aria-haspopup="true"
              [attr.aria-expanded]="abierto() === 'personaje'" [attr.aria-controls]="'lp-panel-' + indice()"
              [attr.aria-label]="'Personaje de la línea ' + numero() + ': ' + nombre()" (click)="alternar('personaje')">
        <img class="pixel retrato" [src]="retrato(linea().personajeId, linea().expresion)" alt="" width="48" height="48" />
      </button>
      @if (abierto() === 'personaje') {
        <div class="desplegable" [id]="'lp-panel-' + indice()" role="group" [attr.aria-label]="'Quién dice la línea ' + numero()">
          @for (p of personajes(); track p.id) {
            <button type="button" class="desplegable__opcion" [attr.aria-pressed]="p.id === linea().personajeId"
                    (click)="elegirPersonaje(p.id)">
              <img class="pixel" [src]="retrato(p.id, linea().expresion)" alt="" width="40" height="40" />
              <span>{{ p.nombre }}</span>
            </button>
          }
        </div>
      }
    </div>

    <div class="linea-libreto__cuerpo">
      <div class="linea-libreto__cabecera">
        <span class="linea-libreto__nombre">{{ nombre() }}</span>
        <div class="linea-libreto__selector">
          <button type="button" class="ficha-cara" [id]="'le' + indice()" aria-haspopup="true"
                  [attr.aria-expanded]="abierto() === 'expresion'" [attr.aria-controls]="'le-panel-' + indice()"
                  [attr.aria-label]="'Expresión de la línea ' + numero() + ': ' + nombreExpresion[linea().expresion]"
                  (click)="alternar('expresion')">
            {{ nombreExpresion[linea().expresion] }}<span class="ficha-cara__flecha" aria-hidden="true">▾</span>
          </button>
          @if (abierto() === 'expresion') {
            <div class="desplegable desplegable--caras" [id]="'le-panel-' + indice()" role="group"
                 [attr.aria-label]="'Cara de la línea ' + numero()">
              @for (x of expresiones; track x) {
                <button type="button" class="desplegable__opcion desplegable__opcion--cara" [attr.data-expresion]="x"
                        [attr.aria-pressed]="x === linea().expresion" (click)="elegirExpresion(x)">
                  <img class="pixel" [src]="retrato(linea().personajeId, x)" alt="" width="40" height="40" />
                  <span>{{ nombreExpresion[x] }}</span>
                </button>
              }
            </div>
          }
        </div>
        @if (linea().marcaIa) {
          <span class="pildora">Sugerido por la IA</span>
          <button type="button" class="boton boton-compacto" data-accion="aceptar-ia" (click)="aceptar.emit()">Aceptar línea</button>
          <button type="button" class="boton boton-texto boton-compacto" (click)="descartar.emit()">Descartar línea</button>
        }
        <ui-menu class="linea-libreto__mas" iconOnly [label]="'Más acciones de la línea ' + numero()" [items]="acciones()"
                 (itemSelected)="alElegir($event)" />
      </div>
      <label class="solo-lector" [for]="'lt' + indice()">Lo que dice, línea {{ numero() }}</label>
      <textarea autoAlto [id]="'lt' + indice()" class="campo" rows="1" [value]="linea().texto"
                [attr.aria-describedby]="(linea().texto ? '' : 'lv' + indice() + ' ') + 'la' + indice()"
                (change)="escribir($any($event.target).value)" (keydown)="alTeclear($event)"></textarea>
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <span class="solo-lector" [id]="'la' + indice()">Ctrl más Enter agrega la línea siguiente.</span>
      @if (!linea().texto) {
        <p [id]="'lv' + indice()" class="nota">Escribe lo que dice; sin texto, el estudiante no verá nada en este turno.</p>
      }
    </div>
  `,
  styles: `
    :host { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.75rem; align-items: start; }
    .linea-libreto__selector { position: relative; }
    .linea-libreto__cuerpo { display: flex; flex-direction: column; gap: 0.375rem; min-inline-size: 0; }
    .linea-libreto__cabecera { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem 0.5rem; min-block-size: 2.75rem; }
    .linea-libreto__nombre { font-weight: 700; color: var(--tinta); overflow-wrap: anywhere; }
    /* El retrato es el botón: 48 px de arte dentro de un blanco de 52 px, con el filo de un control. */
    .retrato-boton {
      display: grid; place-items: center; inline-size: 3.25rem; block-size: 3.25rem; padding: 0; cursor: pointer;
      border: 1px solid var(--linea); border-radius: var(--radio-control); background: var(--fondo-hundido);
      transition: scale var(--ds-dur-press) var(--ds-ease-out), border-color var(--ds-dur-fade) var(--ds-ease-out);
    }
    .retrato-boton[aria-expanded='true'] { border-color: var(--primario); }
    .retrato { border-radius: calc(var(--radio-control) - 0.25rem); }
    .ficha-cara {
      display: inline-flex; align-items: center; gap: 0.25rem; min-block-size: 2.75rem; padding: 0 0.75rem; cursor: pointer;
      border: 1px solid var(--borde-control); border-radius: 999px; background: var(--superficie); color: var(--tinta);
      font-size: var(--autoria-texto-14); font-weight: 700;
      transition: scale var(--ds-dur-press) var(--ds-ease-out), background-color var(--ds-dur-fade) var(--ds-ease-out);
    }
    .ficha-cara__flecha { color: var(--texto-secundario); }
    .boton-compacto { min-height: 2.75rem; padding: 0 0.75rem; }
    /* «Más» se asoma al pasar o al enfocar la fila (§3.4); en pantallas táctiles, siempre (no hay cursor que pase). */
    .linea-libreto__mas { margin-inline-start: auto; transition: opacity var(--ds-dur-fade) var(--ds-ease-out); }
    @media (hover: hover) and (pointer: fine) {
      .linea-libreto__mas { opacity: 0; }
      :host(:hover) .linea-libreto__mas, :host(:focus-within) .linea-libreto__mas { opacity: 1; }
      .retrato-boton:hover, .ficha-cara:hover { border-color: var(--primario); }
      .desplegable__opcion:hover { background: var(--fondo-hundido); }
    }
    textarea.campo { inline-size: 100%; line-height: 1.5rem; resize: none; }
    .nota { margin: 0; color: var(--texto-secundario); font-size: var(--autoria-texto-14); line-height: 1.25rem; }
    /* El desplegable flota sobre el libreto con la elevación de lo que se abre (§4.7): superficie opaca, sombra en capas. */
    .desplegable {
      position: absolute; z-index: var(--autoria-capa-5); inset-block-start: calc(100% + 0.25rem); inset-inline-start: 0;
      display: grid; gap: 0.125rem; min-inline-size: 13rem; max-inline-size: min(22rem, calc(100vw - 2rem)); padding: 0.25rem;
      border: 1px solid var(--linea); border-radius: var(--radio-tarjeta); background: var(--superficie); box-shadow: var(--sombra-menu);
      animation: desplegable-entra var(--ds-dur-fade) var(--ds-spring-soft, var(--ds-ease-out));
      transform-origin: top left;
    }
    .desplegable--caras { grid-template-columns: repeat(3, minmax(0, 1fr)); min-inline-size: 18rem; }
    .desplegable__opcion {
      display: flex; align-items: center; gap: 0.5rem; min-block-size: 2.75rem; padding: 0.25rem 0.5rem; cursor: pointer;
      border: 1px solid transparent; border-radius: var(--radio-control); background: transparent; color: var(--tinta);
      font-size: var(--autoria-texto-16); text-align: start;
    }
    .desplegable__opcion--cara { flex-direction: column; gap: 0.125rem; font-size: var(--autoria-texto-14); text-align: center; }
    .desplegable__opcion[aria-pressed='true'] { border-color: var(--primario); background: var(--primario-tinte); font-weight: 700; }
    .desplegable__opcion img { border-radius: 0.375rem; background: var(--fondo-hundido); }
    button:active { scale: 0.97; }
    @keyframes desplegable-entra { from { opacity: 0; scale: 0.97; } }
    @media (prefers-reduced-motion: reduce) {
      .desplegable { animation: none; }
      .linea-libreto__mas, .retrato-boton, .ficha-cara { transition: none; }
    }
    @media (forced-colors: active) {
      .desplegable__opcion[aria-pressed='true'], .retrato-boton[aria-expanded='true'] { outline: 2px solid Highlight; }
      .linea-libreto__mas { opacity: 1; }
    }
  `,
})
export class LineaComponent {
  readonly linea = input.required<Linea>();
  /** Su posición en la escena, desde 0 (los ids `lt<i>`, `lp<i>` y `le<i>` la usan, como antes). */
  readonly indice = input.required<number>();
  readonly total = input.required<number>();
  readonly personajes = input.required<readonly PersonajeDeLinea[]>();

  readonly editar = output<Partial<Omit<Linea, 'id'>>>();
  readonly mover = output<-1 | 1>();
  readonly duplicar = output<void>();
  readonly borrar = output<void>();
  readonly aceptar = output<void>();
  readonly descartar = output<void>();
  /** Ctrl+Enter: la docente quiere la línea siguiente, con el mismo personaje. */
  readonly siguiente = output<void>();

  private readonly raiz = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  protected readonly expresiones = EXPRESIONES;
  protected readonly nombreExpresion = NOMBRE_EXPRESION;
  protected readonly abierto = signal<Desplegable | null>(null);
  protected readonly numero = computed(() => this.indice() + 1);
  protected readonly nombre = computed(() => this.personajes().find((p) => p.id === this.linea().personajeId)?.nombre ?? 'Sin personaje');

  /** Las acciones de fila: lo que no se puede (subir la primera) se ofrece apagado, para que el menú no cambie de forma. */
  protected readonly acciones = computed<UiMenuItem[]>(() => [
    { value: 'subir', label: `Subir la línea ${this.numero()}`, icon: 'keyboard_arrow_up', disabled: this.indice() === 0 },
    { value: 'bajar', label: `Bajar la línea ${this.numero()}`, icon: 'keyboard_arrow_down', disabled: this.indice() >= this.total() - 1 },
    { value: 'duplicar', label: `Duplicar la línea ${this.numero()}`, icon: 'content_copy' },
    { value: 'borrar', label: `Borrar la línea ${this.numero()}`, icon: 'delete', tone: 'danger' },
  ]);

  protected retrato(personajeId: string, expresion: Expresion): string {
    const receta = this.personajes().find((p) => p.id === personajeId)?.recipeId ?? 'sin-receta';
    return rutaRetrato(receta, expresion);
  }

  protected alternar(cual: Desplegable): void {
    this.abierto.update((a) => (a === cual ? null : cual));
    if (this.abierto() === cual) this.enfocarDespues(`#${cual === 'personaje' ? 'lp' : 'le'}-panel-${this.indice()} [aria-pressed="true"], #${cual === 'personaje' ? 'lp' : 'le'}-panel-${this.indice()} button`);
  }

  protected elegirPersonaje(id: string): void {
    if (id !== this.linea().personajeId) this.editar.emit({ personajeId: id });
    this.cerrar(true);
  }

  protected elegirExpresion(x: Expresion): void {
    if (x !== this.linea().expresion) this.editar.emit({ expresion: x });
    this.cerrar(true);
  }

  /** Cierra el desplegable; con `devolver`, el foco vuelve a su botón (Esc o una elección, como un menú). */
  protected cerrar(devolver = false): void {
    const cual = this.abierto();
    if (!cual) return;
    this.abierto.set(null);
    if (devolver) this.enfocarDespues(`#${cual === 'personaje' ? 'lp' : 'le'}${this.indice()}`);
  }

  /** Si el foco sale de la fila, el desplegable se cierra solo: no queda un panel huérfano tapando la línea de abajo. */
  protected alSalir(evento: FocusEvent): void {
    const hacia = evento.relatedTarget as Node | null;
    if (hacia && this.raiz.contains(hacia)) return;
    this.cerrar();
  }

  protected escribir(valor: string): void {
    if (valor !== this.linea().texto) this.editar.emit({ texto: valor });
  }

  /** Ctrl+Enter guarda lo escrito (el campo aún no perdió el foco, así que `change` no llegó) y pide la siguiente línea. */
  protected alTeclear(evento: KeyboardEvent): void {
    if (evento.key !== 'Enter' || !(evento.ctrlKey || evento.metaKey) || evento.shiftKey) return;
    evento.preventDefault();
    this.escribir((evento.target as HTMLTextAreaElement).value);
    this.siguiente.emit();
  }

  protected alElegir(valor: string | undefined): void {
    if (valor === 'subir') this.mover.emit(-1);
    else if (valor === 'bajar') this.mover.emit(1);
    else if (valor === 'duplicar') this.duplicar.emit();
    else if (valor === 'borrar') this.borrar.emit();
  }

  private enfocarDespues(selector: string): void {
    afterNextRender(() => this.raiz.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
