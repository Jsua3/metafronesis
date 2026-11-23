import {
  ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal,
} from '@angular/core';

import type { ClaseRespuesta } from '../../modelo/caso';
import { NOMBRE_CLASE } from '../../modelo/textos';

/** Una respuesta que se puede marcar como «cumple este paso». */
export interface RespuestaElegible {
  id: string;
  escenaId: string;
  texto: string;
  clase: ClaseRespuesta | null;
}

/** Las respuestas de una escena, con el título numerado como en el riel («3 · Consultorio»). */
export interface EscenaElegible {
  escenaId: string;
  titulo: string;
  respuestas: readonly RespuestaElegible[];
}

/** Lo que pide quien marca o desmarca una respuesta en el selector. */
export interface CambioDeRespuesta {
  escenaId: string;
  respuestaId: string;
  cumple: boolean;
}

/** El mismo símbolo que la ficha de la respuesta: la clase se lee con forma y palabra, no solo con color. */
const SIMBOLO: Record<ClaseRespuesta, string> = { RECOMMENDED: '✓', ACCEPTABLE: '✓', RISKY: '▲', CONTRAINDICATED: '✕' };

const sinTildes = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * «Agregar una respuesta que lo cumple» (EDITOR.md §3.5): las respuestas del caso agrupadas por escena, en el orden de la
 * historia, con su clase a la vista y un buscador. Cada una es una casilla: marcarla aquí es lo mismo que marcar el paso
 * en la ficha de la respuesta (quien la usa llama a la misma operación del store).
 *
 * Se abre en el sitio, debajo del paso, y no en un diálogo modal: la docente ve a la vez el paso y lo que va marcando, y
 * no hay una capa más que atrapar el foco. Esc o «Listo» lo cierran y quien lo abrió devuelve el foco a su botón.
 *
 * Patrón: pieza de presentación (entradas y salidas, sin servicios); el buscador es su único estado.
 */
@Component({
  selector: 'app-selector-de-respuestas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'cerrar.emit()' },
  template: `
    <section class="selector" role="group" [attr.aria-labelledby]="idBase() + '-titulo'">
      <div class="selector__cabeza">
        <h3 class="selector__titulo" tabindex="-1" [id]="idBase() + '-titulo'">Respuestas que cumplen «{{ nombrePaso() }}»</h3>
        <button type="button" class="boton boton-primario selector__listo" (click)="cerrar.emit()">Listo</button>
      </div>
      <label class="solo-lector" [for]="idBase() + '-buscar'">Buscar una respuesta por su texto o por su escena</label>
      <input class="campo selector__buscar" type="search" autocomplete="off" [id]="idBase() + '-buscar'"
             placeholder="Buscar por texto o escena" [value]="consulta()" (input)="consulta.set($any($event.target).value)" />
      <p class="selector__cuenta" role="status">{{ cuenta() }}</p>
      <div class="selector__lista">
        @for (grupo of filtrados(); track grupo.escenaId) {
          <fieldset class="grupo">
            <legend class="grupo__titulo">{{ grupo.titulo }}</legend>
            @for (r of grupo.respuestas; track r.id) {
              <label class="respuesta" [class.marcada]="marcadas().includes(r.id)">
                <input type="checkbox" [checked]="marcadas().includes(r.id)"
                       (change)="cambiar.emit({ escenaId: grupo.escenaId, respuestaId: r.id, cumple: $any($event.target).checked })" />
                <span class="respuesta__texto">{{ r.texto.trim() || 'Respuesta sin escribir' }}</span>
                <span class="respuesta__clase" [attr.data-clase]="r.clase">
                  @if (r.clase) { <span aria-hidden="true">{{ simbolo[r.clase] }}</span> {{ nombreClase[r.clase] }} } @else { Sin clase }
                </span>
              </label>
            }
          </fieldset>
        } @empty {
          <p class="selector__vacio">{{ consulta().trim() ? 'Ninguna respuesta coincide con la búsqueda.' : 'Este caso todavía no tiene respuestas escritas.' }}</p>
        }
      </div>
    </section>
  `,
  styles: `
    :host { display: block; min-inline-size: 0; }
    .selector {
      display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; border-radius: var(--l-radio-control);
      border: 1px solid var(--l-filo-fuerte); background: var(--l-superficie-hundida);
    }
    .selector__cabeza { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
    .selector__titulo { margin: 0; min-inline-size: 0; font-size: var(--autoria-texto-16); line-height: 1.5rem; overflow-wrap: anywhere; }
    .selector__titulo:focus-visible { outline: 2px solid var(--ds-focus); outline-offset: 2px; border-radius: 0.25rem; }
    .selector__listo { flex: none; }
    .selector__buscar { inline-size: 100%; box-sizing: border-box; font: inherit; font-size: var(--autoria-texto-16); }
    .selector__cuenta { margin: 0; color: var(--ds-text-2); font-size: var(--autoria-texto-14); }
    /* Con 19 respuestas la lista no empuja la página: se desplaza dentro y no arrastra el resto (contain). */
    .selector__lista { display: flex; flex-direction: column; gap: 0.625rem; max-block-size: 22rem; overflow: auto; overscroll-behavior: contain; }
    .grupo { margin: 0; padding: 0; border: 0; min-inline-size: 0; display: flex; flex-direction: column; gap: 0.25rem; }
    .grupo__titulo { padding: 0; margin-block-end: 0.125rem; color: var(--ds-text-2); font-size: var(--autoria-texto-14); font-weight: 800; }
    .respuesta {
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0.625rem; min-block-size: 2.75rem;
      padding: 0.375rem 0.625rem; border-radius: 0.625rem; background: var(--l-superficie); cursor: pointer;
      box-shadow: inset 0 0 0 1px var(--l-filo); transition: box-shadow var(--ds-dur-fade) var(--ds-ease-out);
    }
    .respuesta.marcada { box-shadow: inset 0 0 0 2px var(--ds-primary); }
    .respuesta input { inline-size: 1.25rem; block-size: 1.25rem; margin: 0; accent-color: var(--ds-primary); }
    .respuesta__texto { font-size: var(--autoria-texto-16); line-height: 1.375rem; overflow-wrap: anywhere; }
    .respuesta__clase { color: var(--ds-text-2); font-size: var(--autoria-texto-14); font-weight: 700; white-space: nowrap; }
    .respuesta__clase[data-clase='RISKY'] { color: var(--riesgo); }
    .respuesta__clase[data-clase='CONTRAINDICATED'] { color: var(--peligro); }
    .respuesta:has(input:focus-visible) { outline: 2px solid var(--ds-focus); outline-offset: 2px; }
    .selector__vacio { margin: 0; padding: 0.75rem; color: var(--ds-text-2); }
    @media (max-width: 30rem) {
      .respuesta { grid-template-columns: auto minmax(0, 1fr); }
      .respuesta__clase { grid-column: 2; }
    }
    @media (forced-colors: active) {
      .respuesta { border: 1px solid CanvasText; }
      .respuesta.marcada { border-width: 3px; }
    }
  `,
})
export class SelectorDeRespuestasComponent {
  readonly escenas = input.required<readonly EscenaElegible[]>();
  /** Las respuestas que ya cumplen el paso. */
  readonly marcadas = input.required<readonly string[]>();
  readonly nombrePaso = input.required<string>();
  /** Prefijo de los ids (hay un selector por paso, pero solo uno abierto a la vez). */
  readonly idBase = input('selector');
  readonly cambiar = output<CambioDeRespuesta>();
  readonly cerrar = output<void>();

  protected readonly consulta = signal('');
  protected readonly simbolo = SIMBOLO;
  protected readonly nombreClase = NOMBRE_CLASE;

  protected readonly filtrados = computed(() => {
    const palabras = sinTildes(this.consulta()).split(/\s+/).filter(Boolean);
    if (!palabras.length) return this.escenas().filter((g) => g.respuestas.length);
    return this.escenas()
      .map((g) => ({
        ...g,
        respuestas: g.respuestas.filter((r) => {
          const texto = sinTildes(`${g.titulo} ${r.texto} ${r.clase ? NOMBRE_CLASE[r.clase] : ''}`);
          return palabras.every((p) => texto.includes(p));
        }),
      }))
      .filter((g) => g.respuestas.length);
  });

  protected readonly cuenta = computed(() => {
    const n = this.filtrados().reduce((total, g) => total + g.respuestas.length, 0);
    const marcadas = this.marcadas().length;
    const lista = n === 1 ? '1 respuesta' : `${n} respuestas`;
    return `${lista} · ${marcadas === 1 ? '1 cumple este paso' : `${marcadas} cumplen este paso`}`;
  });

  constructor() {
    // Al abrirse, el foco va al buscador: con el teclado se escribe y se baja con Tab a las casillas. En una pantalla táctil
    // va al título: enfocar el buscador abriría el teclado y taparía la lista que se quería ver.
    const raiz: HTMLElement = inject(ElementRef).nativeElement;
    afterNextRender(() => {
      const tactil = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      raiz.querySelector<HTMLElement>(tactil ? '.selector__titulo' : 'input[type="search"]')?.focus();
    });
  }
}
