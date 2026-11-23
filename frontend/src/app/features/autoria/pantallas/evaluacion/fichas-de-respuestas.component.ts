import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Una respuesta del caso pintada como ficha: su escena numerada y su texto. */
export interface FichaDeRespuesta {
  escenaId: string;
  respuestaId: string;
  /** «3 · Consultorio». */
  escena: string;
  texto: string;
  /** La dirección del guion de su escena (para abrirla con Ctrl o en otra pestaña). */
  href: string;
}

/**
 * Las respuestas que cumplen un paso o evidencian un criterio, como fichas de una línea (EDITOR.md §3.5 y §5.3: «el mismo
 * patrón que Pasos profesionales»). Un clic lleva a la respuesta en su guion y la enfoca; con Ctrl, Mayús o el botón
 * central el navegador abre el enlace. Con `quitable`, cada ficha lleva su «×». Lo que se proyecta (un botón «Agregar»)
 * va al final de la lista, como un elemento más.
 *
 * Patrón: pieza de presentación compartida por «Pasos profesionales» y «Rúbrica del caso» (no se copia en cada pantalla).
 */
@Component({
  selector: 'app-fichas-de-respuestas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="fichas" [attr.aria-label]="etiqueta()">
      @for (r of respuestas(); track r.respuestaId) {
        <li class="ficha">
          <!-- A la vista, el número de la escena (el del riel) y la respuesta; el nombre de la escena va al lector y al globo.
               Las comillas quedan fuera del recorte: «Validar su…» y no «Validar su… sin cierre. -->
          <a class="ficha__enlace" [href]="r.href" [title]="r.escena + ': ' + textoDe(r)" (click)="abrir($event, r)"><span
             class="ficha__escena" aria-hidden="true">{{ numeroDe(r) }}</span><span class="solo-lector">{{ r.escena }}:</span>
             «<span class="ficha__texto">{{ textoDe(r) }}</span>»</a>
          @if (quitable()) {
            <button type="button" class="ficha__quitar" [attr.aria-label]="'Quitar «' + textoDe(r) + '» de ' + nombre()" (click)="quitar.emit(r)">
              <span aria-hidden="true">×</span>
            </button>
          }
        </li>
      } @empty {
        <li class="fichas__vacio">{{ vacio() }}</li>
      }
      <ng-content />
    </ul>
  `,
  styles: `
    :host { display: block; min-inline-size: 0; }
    .fichas { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; min-inline-size: 0; margin: 0; padding: 0; list-style: none; }
    .fichas > li { min-inline-size: 0; max-inline-size: 100%; }
    .fichas__vacio { color: var(--ds-text-2); font-size: var(--autoria-texto-14); line-height: 1.25rem; padding-inline-end: 0.25rem; }
    .ficha {
      display: inline-flex; align-items: center; min-block-size: 2.75rem; border-radius: 999px;
      background: var(--l-tinte); box-shadow: inset 0 0 0 1px var(--l-filo);
    }
    .ficha__enlace {
      display: inline-flex; min-inline-size: 0; max-inline-size: 17.5rem; padding-inline: 0.5rem 0.875rem; border-radius: 999px; color: var(--ds-text-1);
      font-size: var(--autoria-texto-14); line-height: 2.75rem; text-decoration: none; white-space: nowrap;
    }
    .ficha__texto { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
    .ficha:has(.ficha__quitar) .ficha__enlace { padding-inline-end: 0.25rem; }
    /* El número de la escena como una placa pequeña, a la manera del riel. */
    .ficha__escena {
      flex: none; align-self: center; display: inline-grid; place-items: center; min-inline-size: 1.5rem; block-size: 1.5rem;
      margin-inline-end: 0.375rem; padding-inline: 0.25rem; border-radius: 0.375rem; background: var(--l-superficie);
      color: var(--ds-text-2); font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums;
    }
    @media (hover: hover) and (pointer: fine) { .ficha__enlace:hover { text-decoration: underline; text-underline-offset: 0.2em; } }
    .ficha__quitar {
      display: inline-grid; place-items: center; flex: none; inline-size: 2.75rem; block-size: 2.75rem; border: 0; border-radius: 999px;
      background: transparent; color: var(--ds-text-2); font: inherit; font-size: var(--autoria-texto-20); cursor: pointer;
      transition: scale var(--ds-dur-press) var(--ds-ease-out);
    }
    .ficha__quitar:active { scale: 0.92; }
    .ficha__enlace:focus-visible, .ficha__quitar:focus-visible { outline: 2px solid var(--ds-focus); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { .ficha__quitar { transition: none; } }
    @media (forced-colors: active) { .ficha { border: 1px solid CanvasText; } }
  `,
})
export class FichasDeRespuestasComponent {
  readonly respuestas = input.required<readonly FichaDeRespuesta[]>();
  /** Nombre accesible de la lista («Respuestas que cumplen Valorar el riesgo»). */
  readonly etiqueta = input.required<string>();
  /** El paso o el criterio, para nombrar el botón «Quitar». */
  readonly nombre = input('');
  readonly vacio = input('Ninguna respuesta todavía.');
  readonly quitable = input(false);
  readonly irA = output<FichaDeRespuesta>();
  readonly quitar = output<FichaDeRespuesta>();

  /** «4» de «4 · Consultorio» (el número que el riel le da a la escena). */
  protected numeroDe(r: FichaDeRespuesta): string {
    return /^(\d+)/.exec(r.escena)?.[1] ?? r.escena;
  }

  protected textoDe(r: FichaDeRespuesta): string {
    return r.texto.trim() || 'respuesta sin escribir';
  }

  protected abrir(evento: MouseEvent, r: FichaDeRespuesta): void {
    if (evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.button !== 0) return;
    evento.preventDefault();
    this.irA.emit(r);
  }
}
